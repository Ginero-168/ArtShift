import { getCached } from "@/lib/engine/imageCache";
import { createEllipse, createRect, createText } from "@/lib/engine/factory";
import {
  getProcessingPreviewBounds,
  getProcessingPreviewPlacement,
} from "@/lib/engine/processingPreview";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, EngineSlide, ImageElement } from "@/lib/engine/types";
import {
  BRIEF_GUIDE_FILL,
  styleBriefGuideShape,
  styleBriefGuideText,
} from "@/lib/ai/briefGuideStyle";
import { type ConvertToBriefData, isUsableBriefLayout } from "@/lib/ai/briefParser";
import { reportAIError, reportAIResult } from "@/lib/ai/progressReporter";

export type ConvertToBriefOptions = {
  signal?: AbortSignal;
  onProgress?: (status: string) => void;
};

/** Always cloud vision quality — never local analyzer. */
export const CLOUD_BRIEF_ATTEMPTS = 3;
const CLOUD_RETRY_BASE_MS = 700;
const BRIEF_FAILURE_AFTER_RETRIES =
  "สร้างบรีฟไม่สำเร็จหลังลองใหม่อัตโนมัติ 3 ครั้ง กรุณาลองอีกครั้งนะคะ";

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function getImageDataUrlFromElement(element: ImageElement): string | null {
  const cached = getCached(element.fileId);
  if (cached?.dataURL) return cached.dataURL;

  if (cached?.img) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = cached.img.naturalWidth || cached.img.width || 800;
      canvas.height = cached.img.naturalHeight || cached.img.height || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(cached.img, 0, 0);
        return canvas.toDataURL("image/png");
      }
    } catch {
      // Ignored if canvas tainted
    }
  }
  return null;
}

async function fetchBriefDataOnce(
  dataUrl: string,
  signal?: AbortSignal,
): Promise<ConvertToBriefData> {
  const res = await fetch("/api/ai/convert-to-brief", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
    signal,
  });

  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    result?: ConvertToBriefData;
    error?: string;
    retryable?: boolean;
  } | null;

  if (json?.success && isUsableBriefLayout(json.result)) {
    return json.result as ConvertToBriefData;
  }

  const err = new Error(json?.error || `brief_http_${res.status}`);
  (err as Error & { retryable?: boolean }).retryable =
    res.status === 429 || res.status >= 500 || json?.retryable === true || !json?.success;
  throw err;
}

/**
 * Cloud-only brief fetch with exactly CLOUD_BRIEF_ATTEMPTS attempts.
 * No local/analyzer fallback — quality stays on the vision path.
 */
export async function fetchBriefDataForImage(
  dataUrl: string,
  signal?: AbortSignal,
  onAttempt?: (attempt: number, maxAttempts: number) => void,
): Promise<ConvertToBriefData> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= CLOUD_BRIEF_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onAttempt?.(attempt, CLOUD_BRIEF_ATTEMPTS);
    try {
      return await fetchBriefDataOnce(dataUrl, signal);
    } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (attempt >= CLOUD_BRIEF_ATTEMPTS) break;
      await sleep(CLOUD_RETRY_BASE_MS * attempt, signal);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(BRIEF_FAILURE_AFTER_RETRIES);
}

export function generateBriefElements(
  data: ConvertToBriefData,
  imageElement: ImageElement,
  slide?: EngineSlide,
  targetBounds?: { x: number; y: number; width?: number; height?: number },
): EngineElement[] {
  const targetWidth = Math.round(targetBounds?.width ?? imageElement.width);
  const targetHeight = Math.round(targetBounds?.height ?? imageElement.height);
  const gap = 40;

  const slideW = slide?.width ?? 1920;
  const slideH = slide?.height ?? 1080;

  // Position: use targetBounds if provided (e.g. from dragged preview!), else to the right of the reference image
  let targetX = targetBounds ? Math.round(targetBounds.x) : Math.round(imageElement.x + imageElement.width + gap);
  let targetY = targetBounds ? Math.round(targetBounds.y) : Math.round(imageElement.y);

  // If placement overflows slide horizontally, place below if there is room (only when not explicitly positioned)
  if (!targetBounds && targetX + targetWidth > slideW + 100) {
    if (imageElement.y + targetHeight * 2 + gap <= slideH) {
      targetX = Math.round(imageElement.x);
      targetY = Math.round(imageElement.y + imageElement.height + gap);
    }
  }

  const masterGroupId = crypto.randomUUID();
  const elements: EngineElement[] = [];

  // 1. Outer boundary frame matching exact image proportions
  const outerFrame = createRect({
    x: targetX,
    y: targetY,
    width: targetWidth,
    height: targetHeight,
  });
  styleBriefGuideShape(outerFrame, BRIEF_GUIDE_FILL.frame);
  outerFrame.name = "Brief Frame";
  outerFrame.groupIds = [masterGroupId];
  elements.push(outerFrame);

  const hasArtDirection = Boolean(
    data.heroSubject ||
    data.backgroundZone ||
    data.headlineCard ||
    data.badge ||
    data.subtextCard ||
    (data.featureTags && data.featureTags.length > 0) ||
    data.brandLogo ||
    data.footerBar
  );

  const renderedTexts = new Set<string>();

  if (hasArtDirection) {
    // 2. Background Zone (rendered first as backdrop)
    if (data.backgroundZone) {
      const bgGroupId = crypto.randomUUID();
      const bx = targetX + Math.round((data.backgroundZone.box[1] / 1000) * targetWidth);
      const by = targetY + Math.round((data.backgroundZone.box[0] / 1000) * targetHeight);
      const bw = Math.max(10, Math.round(((data.backgroundZone.box[3] - data.backgroundZone.box[1]) / 1000) * targetWidth));
      const bh = Math.max(10, Math.round(((data.backgroundZone.box[2] - data.backgroundZone.box[0]) / 1000) * targetHeight));

      const bgRect = createRect({ x: bx, y: by, width: bw, height: bh });
      styleBriefGuideShape(bgRect, BRIEF_GUIDE_FILL.zone);
      bgRect.name = data.backgroundZone.description
        ? `Background Zone: ${data.backgroundZone.description}`
        : "Background Zone";
      bgRect.groupIds = [bgGroupId, masterGroupId];
      elements.push(bgRect);
      // Zone descriptions stay on the shape name only — never as canvas text.
      // Vision scene notes look like poster copy when this brief is used as a layout reference.
    }

    // 3. Hero Subject (e.g. Child playing in water or main character/model)
    if (data.heroSubject) {
      const heroGroupId = crypto.randomUUID();
      const sx = targetX + Math.round((data.heroSubject.box[1] / 1000) * targetWidth);
      const sy = targetY + Math.round((data.heroSubject.box[0] / 1000) * targetHeight);
      const sw = Math.max(10, Math.round(((data.heroSubject.box[3] - data.heroSubject.box[1]) / 1000) * targetWidth));
      const sh = Math.max(10, Math.round(((data.heroSubject.box[2] - data.heroSubject.box[0]) / 1000) * targetHeight));

      const heroRect = createRect({ x: sx, y: sy, width: sw, height: sh });
      styleBriefGuideShape(heroRect, BRIEF_GUIDE_FILL.hero);
      heroRect.name = data.heroSubject.description
        ? `Hero Subject: ${data.heroSubject.description}`
        : "Hero Subject";
      heroRect.groupIds = [heroGroupId, masterGroupId];
      elements.push(heroRect);
      // Same rule: subject/scene description is metadata, not layout copy.
    }

    // 4. Headline Card (e.g. "สวนน้ำ\nเปิดใหม่")
    if (data.headlineCard) {
      const hlGroupId = crypto.randomUUID();
      const hx = targetX + Math.round((data.headlineCard.box[1] / 1000) * targetWidth);
      const hy = targetY + Math.round((data.headlineCard.box[0] / 1000) * targetHeight);
      const hw = Math.max(10, Math.round(((data.headlineCard.box[3] - data.headlineCard.box[1]) / 1000) * targetWidth));
      const hh = Math.max(10, Math.round(((data.headlineCard.box[2] - data.headlineCard.box[0]) / 1000) * targetHeight));

      const hlRect = createRect({ x: hx, y: hy, width: hw, height: hh });
      styleBriefGuideShape(hlRect, BRIEF_GUIDE_FILL.card);
      hlRect.name = "Headline Card";
      hlRect.groupIds = [hlGroupId, masterGroupId];
      elements.push(hlRect);

      const hlLines = data.headlineCard.text.split("\n");
      const hlFontSize = Math.min(26, Math.max(15, Math.round(targetWidth * 0.034)));
      const hlTextH = hlLines.length * hlFontSize * 1.3;

      const hlText = createText({
        x: hx + 8,
        y: Math.round(hy + Math.max(6, (hh - hlTextH) / 2)),
        width: Math.max(40, hw - 16),
        text: data.headlineCard.text,
        fontSize: hlFontSize,
        fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
      });
      styleBriefGuideText(hlText);
      hlText.textAlign = "center";
      hlText.name = `Headline: ${data.headlineCard.text}`;
      hlText.groupIds = [hlGroupId, masterGroupId];
      elements.push(hlText);

      renderedTexts.add(data.headlineCard.text.trim().toLowerCase());
    }

    // 5. Promo Badge (e.g. "เปิดแล้ว\nวันนี้")
    if (data.badge) {
      const badgeGroupId = crypto.randomUUID();
      const bx = targetX + Math.round((data.badge.box[1] / 1000) * targetWidth);
      const by = targetY + Math.round((data.badge.box[0] / 1000) * targetHeight);
      const bw = Math.max(16, Math.round(((data.badge.box[3] - data.badge.box[1]) / 1000) * targetWidth));
      const bh = Math.max(16, Math.round(((data.badge.box[2] - data.badge.box[0]) / 1000) * targetHeight));

      const badgeShape =
        data.badge.shape === "rect"
          ? createRect({ x: bx, y: by, width: bw, height: bh })
          : createEllipse({ x: bx, y: by, width: bw, height: bh });
      styleBriefGuideShape(badgeShape, BRIEF_GUIDE_FILL.badge);
      badgeShape.name = "Promo Badge";
      badgeShape.groupIds = [badgeGroupId, masterGroupId];
      elements.push(badgeShape);

      const badgeLines = data.badge.text.split("\n");
      const badgeFontSize = Math.min(17, Math.max(11, Math.round(bw * 0.16)));
      const badgeTextH = badgeLines.length * badgeFontSize * 1.3;

      const badgeText = createText({
        x: bx + 4,
        y: Math.round(by + Math.max(4, (bh - badgeTextH) / 2)),
        width: Math.max(20, bw - 8),
        text: data.badge.text,
        fontSize: badgeFontSize,
        fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
      });
      styleBriefGuideText(badgeText);
      badgeText.textAlign = "center";
      badgeText.name = `Badge: ${data.badge.text}`;
      badgeText.groupIds = [badgeGroupId, masterGroupId];
      elements.push(badgeText);

      renderedTexts.add(data.badge.text.trim().toLowerCase());
    }

    // 6. Subtext Card (e.g. "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน")
    if (data.subtextCard) {
      const stGroupId = crypto.randomUUID();
      const stx = targetX + Math.round((data.subtextCard.box[1] / 1000) * targetWidth);
      const sty = targetY + Math.round((data.subtextCard.box[0] / 1000) * targetHeight);
      const stw = Math.max(20, Math.round(((data.subtextCard.box[3] - data.subtextCard.box[1]) / 1000) * targetWidth));
      const sth = Math.max(14, Math.round(((data.subtextCard.box[2] - data.subtextCard.box[0]) / 1000) * targetHeight));

      const stRect = createRect({ x: stx, y: sty, width: stw, height: sth });
      styleBriefGuideShape(stRect, BRIEF_GUIDE_FILL.card);
      stRect.name = "Subtext Card";
      stRect.groupIds = [stGroupId, masterGroupId];
      elements.push(stRect);

      const stFontSize = Math.min(16, Math.max(11, Math.round(targetWidth * 0.024)));
      const stLines = data.subtextCard.text.split("\n");
      const stTextH = stLines.length * stFontSize * 1.3;

      const stText = createText({
        x: stx + 8,
        y: Math.round(sty + Math.max(3, (sth - stTextH) / 2)),
        width: Math.max(20, stw - 16),
        text: data.subtextCard.text,
        fontSize: stFontSize,
        fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
      });
      styleBriefGuideText(stText);
      stText.textAlign = "center";
      stText.name = `Subtext: ${data.subtextCard.text}`;
      stText.groupIds = [stGroupId, masterGroupId];
      elements.push(stText);

      renderedTexts.add(data.subtextCard.text.trim().toLowerCase());
    }

    // 7. Feature Tags (Category pill badges: WATER SLIDES, WAVE POOL, KIDS ZONE...)
    if (data.featureTags && data.featureTags.length > 0) {
      for (const tag of data.featureTags) {
        const tagGroupId = crypto.randomUUID();
        const tx = targetX + Math.round((tag.box[1] / 1000) * targetWidth);
        const ty = targetY + Math.round((tag.box[0] / 1000) * targetHeight);
        const tw = Math.max(24, Math.round(((tag.box[3] - tag.box[1]) / 1000) * targetWidth));
        const th = Math.max(14, Math.round(((tag.box[2] - tag.box[0]) / 1000) * targetHeight));

        const tagRect = createRect({ x: tx, y: ty, width: tw, height: th });
        styleBriefGuideShape(tagRect, BRIEF_GUIDE_FILL.tag);
        tagRect.name = `Tag: ${tag.text}`;
        tagRect.groupIds = [tagGroupId, masterGroupId];
        elements.push(tagRect);

        const tagFontSize = Math.min(13, Math.max(9, Math.round(th * 0.45)));
        const tagText = createText({
          x: tx + 4,
          y: Math.round(ty + Math.max(2, (th - tagFontSize * 1.2) / 2)),
          width: Math.max(20, tw - 8),
          text: tag.text,
          fontSize: tagFontSize,
          fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
        });
        styleBriefGuideText(tagText);
        tagText.textAlign = "center";
        tagText.name = `Tag Text: ${tag.text}`;
        tagText.groupIds = [tagGroupId, masterGroupId];
        elements.push(tagText);

        renderedTexts.add(tag.text.trim().toLowerCase());
      }
    }

    // 8. Brand Logo / Venue Name (e.g. "AQUA WORLD")
    if (data.brandLogo) {
      const logoGroupId = crypto.randomUUID();
      const lx = targetX + Math.round((data.brandLogo.box[1] / 1000) * targetWidth);
      const ly = targetY + Math.round((data.brandLogo.box[0] / 1000) * targetHeight);
      const lw = Math.max(30, Math.round(((data.brandLogo.box[3] - data.brandLogo.box[1]) / 1000) * targetWidth));
      const lh = Math.max(16, Math.round(((data.brandLogo.box[2] - data.brandLogo.box[0]) / 1000) * targetHeight));

      const logoRect = createRect({ x: lx, y: ly, width: lw, height: lh });
      styleBriefGuideShape(logoRect, BRIEF_GUIDE_FILL.logo);
      logoRect.name = `Logo Zone: ${data.brandLogo.text}`;
      logoRect.groupIds = [logoGroupId, masterGroupId];
      elements.push(logoRect);

      const logoFontSize = Math.min(18, Math.max(11, Math.round(lh * 0.38)));
      const logoDisplayText = data.brandLogo.subtext
        ? `${data.brandLogo.text}\n${data.brandLogo.subtext}`
        : data.brandLogo.text;

      const logoText = createText({
        x: lx + 4,
        y: Math.round(ly + Math.max(2, (lh - logoFontSize * (data.brandLogo.subtext ? 2.2 : 1.3)) / 2)),
        width: Math.max(20, lw - 8),
        text: logoDisplayText,
        fontSize: logoFontSize,
        fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
      });
      styleBriefGuideText(logoText);
      logoText.textAlign = "center";
      logoText.name = `Logo: ${data.brandLogo.text}`;
      logoText.groupIds = [logoGroupId, masterGroupId];
      elements.push(logoText);

      renderedTexts.add(data.brandLogo.text.trim().toLowerCase());
    }

    // 9. Footer Bar / Highlight Strip (e.g. 4 selling points at bottom)
    if (data.footerBar) {
      const footerGroupId = crypto.randomUUID();
      const fx = targetX + Math.round((data.footerBar.box[1] / 1000) * targetWidth);
      const fy = targetY + Math.round((data.footerBar.box[0] / 1000) * targetHeight);
      const fw = Math.max(30, Math.round(((data.footerBar.box[3] - data.footerBar.box[1]) / 1000) * targetWidth));
      const fh = Math.max(20, Math.round(((data.footerBar.box[2] - data.footerBar.box[0]) / 1000) * targetHeight));

      const footerRect = createRect({ x: fx, y: fy, width: fw, height: fh });
      styleBriefGuideShape(footerRect, BRIEF_GUIDE_FILL.footer);
      footerRect.name = "Footer Bar";
      footerRect.groupIds = [footerGroupId, masterGroupId];
      elements.push(footerRect);

      const items = data.footerBar.items;
      if (items.length > 0) {
        const itemWidth = fw / items.length;
        const itemFontSize = Math.min(12, Math.max(9, Math.round(fh * 0.28)));

        items.forEach((item, index) => {
          let ix = fx + Math.round(index * itemWidth);
          let iy = fy;
          let iw = Math.round(itemWidth);
          let ih = fh;

          if (item.box) {
            ix = targetX + Math.round((item.box[1] / 1000) * targetWidth);
            iy = targetY + Math.round((item.box[0] / 1000) * targetHeight);
            iw = Math.max(20, Math.round(((item.box[3] - item.box[1]) / 1000) * targetWidth));
            ih = Math.max(10, Math.round(((item.box[2] - item.box[0]) / 1000) * targetHeight));
          }

          const itemText = createText({
            x: ix + 4,
            y: Math.round(iy + Math.max(2, (ih - itemFontSize * 1.3) / 2)),
            width: Math.max(20, iw - 8),
            text: item.text,
            fontSize: itemFontSize,
            fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
          });
          styleBriefGuideText(itemText, true);
          itemText.textAlign = "center";
          itemText.name = `Footer Item: ${item.text}`;
          itemText.groupIds = [footerGroupId, masterGroupId];
          elements.push(itemText);

          renderedTexts.add(item.text.trim().toLowerCase());
        });
      }
    }
  } else {
    // Compatibility path: Background Partitions
    for (const [partitionIndex, partition] of data.backgroundPartitions.entries()) {
      const partGroupId = crypto.randomUUID();
      const px = targetX + Math.round((partition.box[1] / 1000) * targetWidth);
      const py = targetY + Math.round((partition.box[0] / 1000) * targetHeight);
      const pw = Math.max(4, Math.round(((partition.box[3] - partition.box[1]) / 1000) * targetWidth));
      const ph = Math.max(4, Math.round(((partition.box[2] - partition.box[0]) / 1000) * targetHeight));

      const pRect = createRect({
        x: px,
        y: py,
        width: pw,
        height: ph,
      });
      styleBriefGuideShape(
        pRect,
        partitionIndex % 2 === 0 ? BRIEF_GUIDE_FILL.partitionA : BRIEF_GUIDE_FILL.partitionB,
      );
      pRect.name = partition.name || "โซนพื้นที่";
      pRect.groupIds = [partGroupId, masterGroupId];
      elements.push(pRect);

      if (partition.name) {
        const labelFontSize = Math.min(18, Math.max(12, Math.round(targetWidth * 0.028)));
        let labelX = px + 12;
        let labelY = py + 12;
        let textAlign: "left" | "center" = "left";

        if (partition.labelPlacement === "center") {
          textAlign = "center";
          labelX = px + Math.max(0, Math.round(pw / 2 - 100));
          labelY = py + Math.max(0, Math.round(ph / 2 - labelFontSize));
        }

        const pLabel = createText({
          x: labelX,
          y: labelY,
          width: Math.max(80, Math.min(200, pw - 24)),
          text: partition.name,
          fontSize: labelFontSize,
          fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
        });
        styleBriefGuideText(pLabel);
        pLabel.textAlign = textAlign;
        pLabel.name = `Label: ${partition.name}`;
        pLabel.groupIds = [partGroupId, masterGroupId];
        elements.push(pLabel);
      }
    }

    // Compatibility path: Focal Objects
    for (const obj of data.focalObjects) {
      const objGroupId = crypto.randomUUID();
      const ox = targetX + Math.round((obj.box[1] / 1000) * targetWidth);
      const oy = targetY + Math.round((obj.box[0] / 1000) * targetHeight);
      const ow = Math.max(16, Math.round(((obj.box[3] - obj.box[1]) / 1000) * targetWidth));
      const oh = Math.max(16, Math.round(((obj.box[2] - obj.box[0]) / 1000) * targetHeight));

      const shape =
        obj.shape === "rect"
          ? createRect({ x: ox, y: oy, width: ow, height: oh })
          : createEllipse({ x: ox, y: oy, width: ow, height: oh });

      styleBriefGuideShape(shape, BRIEF_GUIDE_FILL.focal);
      shape.name = obj.name || "ป้าย / วัตถุ";
      shape.groupIds = [objGroupId, masterGroupId];
      elements.push(shape);

      if (obj.text) {
        renderedTexts.add(obj.text.trim().toLowerCase());
        const badgeFontSize = Math.min(18, Math.max(12, Math.round(ow * 0.13)));
        const lines = obj.text.split("\n");
        const textH = lines.length * badgeFontSize * 1.3;

        const badgeText = createText({
          x: ox + 4,
          y: Math.round(oy + Math.max(2, (oh - textH) / 2)),
          width: Math.max(20, ow - 8),
          text: obj.text,
          fontSize: badgeFontSize,
          fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
        });
        styleBriefGuideText(badgeText);
        badgeText.textAlign = "center";
        badgeText.name = `Text: ${obj.text}`;
        badgeText.groupIds = [objGroupId, masterGroupId];
        elements.push(badgeText);
      }
    }
  }

  // 10. Dividers are intentionally omitted — hard guide lines get copied as design chrome.

  // 11. Additional OCR / Intentional Texts
  for (const t of data.texts) {
    const cleanText = t.text.trim();
    if (!cleanText || renderedTexts.has(cleanText.toLowerCase())) continue;

    const tx = targetX + Math.round((t.box[1] / 1000) * targetWidth);
    const ty = targetY + Math.round((t.box[0] / 1000) * targetHeight);
    const tw = Math.max(40, Math.round(((t.box[3] - t.box[1]) / 1000) * targetWidth));
    const fontSize = t.fontSize || Math.min(18, Math.max(12, Math.round(targetWidth * 0.026)));

    const textEl = createText({
      x: tx,
      y: ty,
      width: tw,
      text: cleanText,
      fontSize,
      fontFamily: "'Inter', 'Mali', 'Noto Sans Thai', sans-serif",
    });
    styleBriefGuideText(textEl);
    textEl.textAlign = t.align || "center";
    textEl.name = `Text: ${cleanText}`;
    textEl.groupIds = [masterGroupId];
    elements.push(textEl);
  }

  return elements;
}

export async function convertImageToBrief(
  imageElement: ImageElement,
  options: ConvertToBriefOptions = {},
): Promise<EngineElement[]> {
  options.onProgress?.("กำลังเตรียมรูปภาพอ้างอิง...");
  const dataUrl = getImageDataUrlFromElement(imageElement);
  if (!dataUrl) {
    const message = "ยังอ่านภาพอ้างอิงไม่ได้ กรุณาเลือกรูปที่โหลดเสร็จแล้วแล้วลองใหม่นะคะ";
    reportAIError({
      taskId: `brief-${crypto.randomUUID()}`,
      operation: "Convert to Brief",
      message,
    });
    throw new Error(message);
  }

  const initialBounds = getProcessingPreviewBounds(imageElement);
  let createdElements: EngineElement[] = [];

  const job = enqueueProcessingJob({
    preview: {
      ...initialBounds,
      kind: "brief",
      label: "Convert to Brief",
      progress: 0.08,
      message: "กำลังเตรียมรูปภาพอ้างอิง…",
      sourceDataUrl: dataUrl,
    },
    signal: options.signal,
    concurrent: true,
    run: async (context) => {
      const update = (message: string, progress = 0.2) => {
        options.onProgress?.(message);
        context.update({ progress, message });
      };

      const briefData = await fetchBriefDataForImage(
        dataUrl,
        context.signal ?? options.signal,
        (attempt, maxAttempts) => {
          update(
            attempt === 1
              ? "กำลังวิเคราะห์สัดส่วนและโครงสร้างภาพ…"
              : `ยังไม่สำเร็จ กำลังลองใหม่อัตโนมัติ (${attempt}/${maxAttempts})…`,
            0.15 + attempt * 0.15,
          );
        },
      );

      if (!isUsableBriefLayout(briefData)) {
        throw new Error(BRIEF_FAILURE_AFTER_RETRIES);
      }

      update("กำลังสร้างเส้น กรอบ และตัวหนังสือบน Canvas…", 0.92);

      const placement = getProcessingPreviewPlacement(context.id, initialBounds);
      const slide = useEngine.getState().currentSlide();
      createdElements = generateBriefElements(briefData, imageElement, slide, placement);

      if (createdElements.length > 0) {
        useEngine.getState().addElements(createdElements, "Convert to Brief");
      }

      update("สร้างบรีฟเรียบร้อยแล้ว!", 1);
    },
  });

  try {
    await job.promise;
    reportAIResult({
      taskId: job.id,
      operation: "Convert to Brief",
      message: "สร้างบรีฟจากภาพอ้างอิงเรียบร้อยแล้วค่ะ",
    });
    return createdElements;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    const raw = error instanceof Error ? error.message : "";
    const message =
      raw && !/replicate|brief_http_|unusable_layout|vision_failed|brief_unavailable/i.test(raw)
        ? raw
        : BRIEF_FAILURE_AFTER_RETRIES;
    reportAIError({
      taskId: job.id,
      operation: "Convert to Brief",
      message,
    });
    throw new Error(message);
  }
}
