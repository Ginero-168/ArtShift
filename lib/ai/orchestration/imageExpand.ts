/**
 * Expand / outpaint toward print ratios beyond the model 3:1 cap
 * (e.g. 29×7cm landscape ≈ 4.14:1, or 7×29cm portrait ≈ 1:4.14)
 * via Recipe D: keep the filled ≤3:1 center, generate edge continuations
 * at legal sizes, client-stitch to the true print canvas.
 *
 * Works for ANY longer:shorter > 3 — not a single hardcoded size.
 *
 * @see docs/research/image-expand-outpaint-2026-09-18.md
 */

import {
  GPT_IMAGE_MAX_ASPECT,
  GPT_IMAGE_PREFERRED_LONG_EDGE,
  resolveGenerationSizeFromRatio,
  resolvePrintCanvasSize,
} from "@/lib/ai/generationSize";
import { generateAIImage } from "@/lib/ai/imageGeneration";
import { loadDataURL } from "@/lib/engine/imageCache";

export type ExpandAxis = "horizontal" | "vertical";

export type ExpandLayout = {
  axis: ExpandAxis;
  targetWidth: number;
  targetHeight: number;
  /** Where the source is drawn on the print canvas. */
  center: { x: number; y: number; width: number; height: number };
  leftGap: number;
  rightGap: number;
  topGap: number;
  bottomGap: number;
};

export type ExpandProgress = {
  stage: "planning" | "left" | "right" | "top" | "bottom" | "stitching" | "done";
  message: string;
};

export type OutpaintSide = "left" | "right" | "top" | "bottom";

/** True when longer:shorter exceeds the GPT Image 3:1 cap (needs edge stitch). */
export function ratioExceedsModelMax(ratioWidth: number, ratioHeight: number): boolean {
  const w = Math.abs(ratioWidth);
  const h = Math.abs(ratioHeight);
  if (!(w > 0) || !(h > 0)) return false;
  return Math.max(w, h) / Math.min(w, h) > GPT_IMAGE_MAX_ASPECT + 1e-6;
}

/** Which axis must expand past the model cap for this print ratio. */
export function expandAxisForRatio(ratioWidth: number, ratioHeight: number): ExpandAxis | null {
  const w = Math.abs(ratioWidth);
  const h = Math.abs(ratioHeight);
  if (!(w > 0) || !(h > 0)) return null;
  if (w / h > GPT_IMAGE_MAX_ASPECT + 1e-6) return "horizontal";
  if (h / w > GPT_IMAGE_MAX_ASPECT + 1e-6) return "vertical";
  return null;
}

/**
 * Detect **explicit** expand/outpaint wording plus a print ratio beyond 3:1.
 *
 * This is NOT a chat-turn router. Special-size asks such as
 * `@Photo ปรับไซส์เป็น 29x7cm` must still run Gemini Memory Recall then
 * Creative Director; only the image-task runner may call
 * `expandImageToAspectRatio` after that plan (when `ratioClamped`).
 * Never short-circuit the chat bar / coPilot into outpaint from this flag.
 */
export function isExpandAspectPrompt(text?: string): boolean {
  if (!text || typeof text !== "string") return false;
  const value = text.toLocaleLowerCase();
  // Require an explicit expand/outpaint verb. Do NOT treat a custom cm resize
  // ("ปรับไซส์เป็น 29x7cm") as "jump to ต่อภาพ" — that skipped Gemini planning.
  const wantsExpand = /ขยาย|expand|outpaint|ต่อข้าง|เติมข้าง|ต่อบน|ต่อล่าง|ต่อภาพ|ต่อฉาก/iu.test(value);
  if (!wantsExpand) return false;

  const parsed = parseExpandRatioFromText(text);
  if (!ratioExceedsModelMax(parsed.ratioWidth, parsed.ratioHeight)) return false;

  return (
    /29\s*[x×]\s*7|7\s*[x×]\s*29|4\s*:\s*1|1\s*:\s*4|4\.14|shelftalk|ชีลฟ์ทอล์ค|แถบยาว|แถบสูง/iu.test(
      value,
    ) ||
    /\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:cm|ซม)/iu.test(value) ||
    /\d+\s*:\s*\d+/u.test(value)
  );
}

/** Parse first WxH (cm, px) or A:B from text for expand target; default 29×7. */
export function parseExpandRatioFromText(text?: string): {
  ratioWidth: number;
  ratioHeight: number;
} {
  if (!text) return { ratioWidth: 29, ratioHeight: 7 };

  const dim = /(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(?:cm|ซม\.?|px)?/iu.exec(text);
  if (dim) {
    const w = parseFloat(dim[1] ?? "");
    const h = parseFloat(dim[2] ?? "");
    if (w > 0 && h > 0) return { ratioWidth: w, ratioHeight: h };
  }

  const colon = /(\d+)\s*:\s*(\d+)/u.exec(text);
  if (colon) {
    const w = Number(colon[1]);
    const h = Number(colon[2]);
    if (w > 0 && h > 0 && w <= 64 && h <= 64) {
      return { ratioWidth: w, ratioHeight: h };
    }
  }

  if (/7\s*[x×]\s*29|แถบสูง|แนวตั้ง.*ยาว/iu.test(text)) {
    return { ratioWidth: 7, ratioHeight: 29 };
  }
  if (/29|shelftalk|ชีลฟ์ทอล์ค|แถบยาว/iu.test(text)) {
    return { ratioWidth: 29, ratioHeight: 7 };
  }
  return { ratioWidth: 29, ratioHeight: 7 };
}

/**
 * Place the filled ≤3:1 source onto the true print canvas.
 * - Horizontal extreme (e.g. 29:7): height-match, gaps left/right
 * - Vertical extreme (e.g. 7:29): width-match, gaps top/bottom
 */
export function planExpandToRatio(
  sourceWidth: number,
  sourceHeight: number,
  ratioWidth: number,
  ratioHeight: number,
): ExpandLayout {
  const axis = expandAxisForRatio(ratioWidth, ratioHeight) ?? "horizontal";
  const print = resolvePrintCanvasSize(ratioWidth, ratioHeight, {
    preferredLongEdge: Math.max(
      GPT_IMAGE_PREFERRED_LONG_EDGE,
      axis === "horizontal"
        ? Math.round((sourceWidth * (ratioWidth / Math.max(ratioHeight, 1e-6))) / 3)
        : Math.round((sourceHeight * (ratioHeight / Math.max(ratioWidth, 1e-6))) / 3),
    ),
  });

  if (axis === "vertical") {
    let targetWidth = Math.max(1, Math.round(sourceWidth));
    let targetHeight = Math.max(
      1,
      Math.round((targetWidth * ratioHeight) / Math.max(ratioWidth, 1e-6)),
    );
    if (targetHeight > print.height * 1.5) {
      targetWidth = print.width;
      targetHeight = print.height;
    }
    const scale = targetWidth / Math.max(1, sourceWidth);
    const placedWidth = targetWidth;
    const placedHeight = Math.max(1, Math.round(sourceHeight * scale));
    const y = Math.max(0, Math.round((targetHeight - placedHeight) / 2));
    return {
      axis,
      targetWidth,
      targetHeight,
      center: { x: 0, y, width: placedWidth, height: placedHeight },
      leftGap: 0,
      rightGap: 0,
      topGap: y,
      bottomGap: Math.max(0, targetHeight - (y + placedHeight)),
    };
  }

  let targetHeight = Math.max(1, Math.round(sourceHeight));
  let targetWidth = Math.max(
    1,
    Math.round((targetHeight * ratioWidth) / Math.max(ratioHeight, 1e-6)),
  );
  if (targetWidth > print.width * 1.5) {
    targetWidth = print.width;
    targetHeight = print.height;
  }
  const scale = targetHeight / Math.max(1, sourceHeight);
  const placedWidth = Math.max(1, Math.round(sourceWidth * scale));
  const placedHeight = targetHeight;
  const x = Math.max(0, Math.round((targetWidth - placedWidth) / 2));
  return {
    axis,
    targetWidth,
    targetHeight,
    center: { x, y: 0, width: placedWidth, height: placedHeight },
    leftGap: x,
    rightGap: Math.max(0, targetWidth - (x + placedWidth)),
    topGap: 0,
    bottomGap: 0,
  };
}

export function legalSidePanelSize(
  gapWidth: number,
  height: number,
): { width: number; height: number } {
  const gap = Math.max(64, gapWidth);
  const h = Math.max(64, height);
  const resolved = resolveGenerationSizeFromRatio(gap, h);
  return { width: resolved.width, height: resolved.height };
}

/**
 * Plan a legal outpaint canvas with fill + seed.
 * Horizontal sides: [fill|seed] or [seed|fill] at panel height.
 * Vertical sides: [fill/seed stacked] at panel width.
 */
export function planOutpaintPanelGeometry(input: {
  gapSize: number;
  crossEdge: number;
  sourceAlong: number;
  axis: ExpandAxis;
}): { width: number; height: number; fillSize: number; seedSize: number } {
  const cross = Math.max(64, Math.round(input.crossEdge));
  const gap = Math.max(64, Math.round(input.gapSize));
  const desiredSeed = Math.max(
    gap,
    Math.min(
      Math.max(1, Math.round(input.sourceAlong)),
      Math.round(Math.max(gap * 2.5, input.sourceAlong * 0.45)),
    ),
  );

  if (input.axis === "horizontal") {
    const resolved = resolveGenerationSizeFromRatio(gap + desiredSeed, cross);
    const scale = resolved.height / Math.max(1, cross);
    let fillSize = Math.max(Math.round(gap * scale), Math.round(resolved.width * 0.22));
    let seedSize = resolved.width - fillSize;
    if (seedSize < 64) {
      seedSize = Math.min(resolved.width - 32, 64);
      fillSize = resolved.width - seedSize;
    }
    return {
      width: resolved.width,
      height: resolved.height,
      fillSize,
      seedSize,
    };
  }

  const resolved = resolveGenerationSizeFromRatio(cross, gap + desiredSeed);
  const scale = resolved.width / Math.max(1, cross);
  let fillSize = Math.max(Math.round(gap * scale), Math.round(resolved.height * 0.22));
  let seedSize = resolved.height - fillSize;
  if (seedSize < 64) {
    seedSize = Math.min(resolved.height - 32, 64);
    fillSize = resolved.height - seedSize;
  }
  return {
    width: resolved.width,
    height: resolved.height,
    fillSize,
    seedSize,
  };
}

/** @deprecated Prefer planOutpaintPanelGeometry with axis */
export function planOutpaintPanelGeometryLegacy(input: {
  gapWidth: number;
  targetHeight: number;
  sourceWidth: number;
}): { width: number; height: number; fillWidth: number; seedWidth: number } {
  const geometry = planOutpaintPanelGeometry({
    gapSize: input.gapWidth,
    crossEdge: input.targetHeight,
    sourceAlong: input.sourceWidth,
    axis: "horizontal",
  });
  return {
    width: geometry.width,
    height: geometry.height,
    fillWidth: geometry.fillSize,
    seedWidth: geometry.seedSize,
  };
}

/** Dedicated outpaint prompt — never reuse the full hero/scene brief. */
export function buildSideOutpaintPrompt(side: OutpaintSide): string {
  const labels: Record<OutpaintSide, { dir: string; preserve: string }> = {
    left: {
      dir: "LEFT",
      preserve: "Keep the RIGHT portion of the image unchanged.",
    },
    right: {
      dir: "RIGHT",
      preserve: "Keep the LEFT portion of the image unchanged.",
    },
    top: {
      dir: "TOP",
      preserve: "Keep the BOTTOM portion of the image unchanged.",
    },
    bottom: {
      dir: "BOTTOM",
      preserve: "Keep the TOP portion of the image unchanged.",
    },
  };
  const { dir, preserve } = labels[side];
  return [
    `Outpaint / extend ONLY the empty ${dir} region of this print banner.`,
    preserve,
    "Continue background architecture, walls, lighting, perspective, wood grain, and atmosphere seamlessly into the empty region.",
    "Do NOT add people, faces, chefs, hands, product heroes, sushi platters, text, logos, badges, price tags, or speech bubbles.",
    "Do NOT duplicate or mirror the main subject. No collage. No seams. Edge-to-edge fill, no letterboxing, no blank bars.",
  ].join(" ");
}

function loadHtmlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image for expand"));
    img.src = dataUrl;
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement, quality = 0.95): string {
  return canvas.toDataURL("image/jpeg", quality);
}

function canvasToPngDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function sampleColumnColor(ctx: CanvasRenderingContext2D, x: number, height: number): string {
  const sx = Math.max(0, Math.min(ctx.canvas.width - 1, Math.round(x)));
  const data = ctx.getImageData(sx, 0, 1, height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.max(1, height);
  for (let y = 0; y < height; y++) {
    const i = y * 4;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

function sampleRowColor(ctx: CanvasRenderingContext2D, y: number, width: number): string {
  const sy = Math.max(0, Math.min(ctx.canvas.height - 1, Math.round(y)));
  const data = ctx.getImageData(0, sy, width, 1).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.max(1, width);
  for (let x = 0; x < width; x++) {
    const i = x * 4;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
  }
  return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
}

export type SideOutpaintPanel = {
  imageDataUrl: string;
  maskDataUrl: string;
  width: number;
  height: number;
  fillSize: number;
  seedSize: number;
  side: OutpaintSide;
};

/**
 * Recipe A panel: pad empty fill beside/above a seed strip from the center edge,
 * with an RGBA mask (α=0 on fill only).
 */
export async function buildSideOutpaintPanel(
  sourceDataUrl: string,
  side: OutpaintSide,
  gapSize: number,
  crossEdge: number,
): Promise<SideOutpaintPanel> {
  const source = await loadHtmlImage(sourceDataUrl);
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  const axis: ExpandAxis = side === "left" || side === "right" ? "horizontal" : "vertical";
  const geometry = planOutpaintPanelGeometry({
    gapSize,
    crossEdge,
    sourceAlong: axis === "horizontal" ? sw : sh,
    axis,
  });

  const image = document.createElement("canvas");
  image.width = geometry.width;
  image.height = geometry.height;
  const ictx = image.getContext("2d");
  if (!ictx) throw new Error("Canvas unavailable for expand outpaint image");

  const mask = document.createElement("canvas");
  mask.width = geometry.width;
  mask.height = geometry.height;
  const mctx = mask.getContext("2d", { alpha: true });
  if (!mctx) throw new Error("Canvas unavailable for expand outpaint mask");

  mctx.clearRect(0, 0, geometry.width, geometry.height);
  mctx.fillStyle = "rgba(255,255,255,1)";
  mctx.fillRect(0, 0, geometry.width, geometry.height);

  if (axis === "horizontal") {
    const srcSeedW = Math.max(
      1,
      Math.min(sw, Math.round((geometry.seedSize / Math.max(1, geometry.height)) * sh)),
    );
    const srcSeedX = side === "left" ? 0 : Math.max(0, sw - srcSeedW);
    const seedCanvas = document.createElement("canvas");
    seedCanvas.width = geometry.seedSize;
    seedCanvas.height = geometry.height;
    const sctx = seedCanvas.getContext("2d");
    if (!sctx) throw new Error("Canvas unavailable for expand seed");
    sctx.drawImage(source, srcSeedX, 0, srcSeedW, sh, 0, 0, geometry.seedSize, geometry.height);
    const edgeX = side === "left" ? 0 : geometry.seedSize - 1;
    const placeholder = sampleColumnColor(sctx, edgeX, geometry.height);

    if (side === "left") {
      ictx.fillStyle = placeholder;
      ictx.fillRect(0, 0, geometry.fillSize, geometry.height);
      ictx.drawImage(seedCanvas, geometry.fillSize, 0);
      mctx.clearRect(0, 0, geometry.fillSize, geometry.height);
    } else {
      ictx.drawImage(seedCanvas, 0, 0);
      ictx.fillStyle = placeholder;
      ictx.fillRect(geometry.seedSize, 0, geometry.fillSize, geometry.height);
      mctx.clearRect(geometry.seedSize, 0, geometry.fillSize, geometry.height);
    }
  } else {
    const srcSeedH = Math.max(
      1,
      Math.min(sh, Math.round((geometry.seedSize / Math.max(1, geometry.width)) * sw)),
    );
    const srcSeedY = side === "top" ? 0 : Math.max(0, sh - srcSeedH);
    const seedCanvas = document.createElement("canvas");
    seedCanvas.width = geometry.width;
    seedCanvas.height = geometry.seedSize;
    const sctx = seedCanvas.getContext("2d");
    if (!sctx) throw new Error("Canvas unavailable for expand seed");
    sctx.drawImage(source, 0, srcSeedY, sw, srcSeedH, 0, 0, geometry.width, geometry.seedSize);
    const edgeY = side === "top" ? 0 : geometry.seedSize - 1;
    const placeholder = sampleRowColor(sctx, edgeY, geometry.width);

    if (side === "top") {
      ictx.fillStyle = placeholder;
      ictx.fillRect(0, 0, geometry.width, geometry.fillSize);
      ictx.drawImage(seedCanvas, 0, geometry.fillSize);
      mctx.clearRect(0, 0, geometry.width, geometry.fillSize);
    } else {
      ictx.drawImage(seedCanvas, 0, 0);
      ictx.fillStyle = placeholder;
      ictx.fillRect(0, geometry.seedSize, geometry.width, geometry.fillSize);
      mctx.clearRect(0, geometry.seedSize, geometry.width, geometry.fillSize);
    }
  }

  return {
    imageDataUrl: canvasToJpegDataUrl(image),
    maskDataUrl: canvasToPngDataUrl(mask),
    width: geometry.width,
    height: geometry.height,
    fillSize: geometry.fillSize,
    seedSize: geometry.seedSize,
    side,
  };
}

/** Crop only the newly generated fill strip from an outpaint panel result. */
export async function cropOutpaintFill(
  panelDataUrl: string,
  side: OutpaintSide,
  fillSize: number,
  panelAlong: number,
): Promise<string> {
  const img = await loadHtmlImage(panelDataUrl);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for expand fill crop");

  if (side === "left" || side === "right") {
    const scale = w / Math.max(1, panelAlong);
    const cropW = Math.max(1, Math.min(w, Math.round(fillSize * scale)));
    const sx = side === "left" ? 0 : Math.max(0, w - cropW);
    canvas.width = cropW;
    canvas.height = h;
    ctx.drawImage(img, sx, 0, cropW, h, 0, 0, cropW, h);
  } else {
    const scale = h / Math.max(1, panelAlong);
    const cropH = Math.max(1, Math.min(h, Math.round(fillSize * scale)));
    const sy = side === "top" ? 0 : Math.max(0, h - cropH);
    canvas.width = w;
    canvas.height = cropH;
    ctx.drawImage(img, 0, sy, w, cropH, 0, 0, w, cropH);
  }
  return canvasToJpegDataUrl(canvas);
}

/** @deprecated Prefer buildSideOutpaintPanel */
export async function cropVerticalStrip(
  dataUrl: string,
  side: "left" | "right",
  stripWidth: number,
): Promise<string> {
  const img = await loadHtmlImage(dataUrl);
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const w = Math.max(1, Math.min(sw, Math.round(stripWidth)));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for expand crop");
  const sx = side === "left" ? 0 : Math.max(0, sw - w);
  ctx.drawImage(img, sx, 0, w, sh, 0, 0, w, sh);
  return canvasToJpegDataUrl(canvas);
}

/**
 * Stitch center + edge fill strips onto the print canvas.
 * Fill inputs should already be the outpainted strip only.
 */
export async function stitchExpandPanels(input: {
  layout: ExpandLayout;
  centerDataUrl: string;
  leftDataUrl?: string;
  rightDataUrl?: string;
  topDataUrl?: string;
  bottomDataUrl?: string;
}): Promise<{ dataUrl: string; width: number; height: number }> {
  const { layout } = input;
  const canvas = document.createElement("canvas");
  canvas.width = layout.targetWidth;
  canvas.height = layout.targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for expand stitch");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const center = await loadHtmlImage(input.centerDataUrl);
  ctx.drawImage(
    center,
    layout.center.x,
    layout.center.y,
    layout.center.width,
    layout.center.height,
  );

  if (input.leftDataUrl && layout.leftGap > 0) {
    const left = await loadHtmlImage(input.leftDataUrl);
    ctx.drawImage(left, 0, 0, layout.leftGap, layout.targetHeight);
  }
  if (input.rightDataUrl && layout.rightGap > 0) {
    const right = await loadHtmlImage(input.rightDataUrl);
    ctx.drawImage(
      right,
      layout.center.x + layout.center.width,
      0,
      layout.rightGap,
      layout.targetHeight,
    );
  }
  if (input.topDataUrl && layout.topGap > 0) {
    const top = await loadHtmlImage(input.topDataUrl);
    ctx.drawImage(top, 0, 0, layout.targetWidth, layout.topGap);
  }
  if (input.bottomDataUrl && layout.bottomGap > 0) {
    const bottom = await loadHtmlImage(input.bottomDataUrl);
    ctx.drawImage(
      bottom,
      0,
      layout.center.y + layout.center.height,
      layout.targetWidth,
      layout.bottomGap,
    );
  }

  return {
    dataUrl: canvasToJpegDataUrl(canvas),
    width: layout.targetWidth,
    height: layout.targetHeight,
  };
}

export type ExpandImageResult = {
  dataUrl: string;
  fileId: string;
  width: number;
  height: number;
  layout: ExpandLayout;
};

async function generateEdgeFill(options: {
  sourceDataUrl: string;
  side: OutpaintSide;
  gapSize: number;
  crossEdge: number;
  quality?: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
  cloudConsent?: boolean;
  signal?: AbortSignal;
}): Promise<string> {
  const panel = await buildSideOutpaintPanel(
    options.sourceDataUrl,
    options.side,
    options.gapSize,
    options.crossEdge,
  );
  const generated = await generateAIImage(
    {
      prompt: buildSideOutpaintPrompt(options.side),
      width: panel.width,
      height: panel.height,
      quality: options.quality ?? "high",
      inputImages: [{ dataUrl: panel.imageDataUrl, mimeType: "image/jpeg" }],
      mask: { dataUrl: panel.maskDataUrl, mimeType: "image/png" },
      cloudConsent: options.cloudConsent === true,
      enhance: false,
    },
    options.signal,
  );
  const along = options.side === "left" || options.side === "right" ? panel.width : panel.height;
  return cropOutpaintFill(generated.dataUrl, options.side, panel.fillSize, along);
}

/**
 * Expand a filled (typically ≤3:1) banner toward any print ratio that exceeds
 * the model aspect cap — left/right for ultra-wide, top/bottom for ultra-tall.
 */
export async function expandImageToAspectRatio(options: {
  sourceDataUrl: string;
  ratioWidth: number;
  ratioHeight: number;
  scenePrompt?: string;
  quality?: "low" | "medium" | "high" | "xhigh" | "max" | "auto";
  cloudConsent?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ExpandProgress) => void;
}): Promise<ExpandImageResult> {
  if (typeof document === "undefined") {
    throw new Error("expandImageToAspectRatio requires a browser environment");
  }

  const report = (stage: ExpandProgress["stage"], message: string) => {
    options.onProgress?.({ stage, message });
  };

  report("planning", "กำลังวางแผนขยายขอบที่เกินเพดานโมเดล…");

  if (!ratioExceedsModelMax(options.ratioWidth, options.ratioHeight)) {
    throw new Error("สัดส่วนนี้ยังอยู่ในเพดาน 3:1 ของโมเดล — ใช้ generate/edit ปกติ ไม่ต้อง stitch ขยายขอบ");
  }

  const source = await loadHtmlImage(options.sourceDataUrl);
  const sourceWidth = source.naturalWidth || source.width;
  const sourceHeight = source.naturalHeight || source.height;
  const layout = planExpandToRatio(
    sourceWidth,
    sourceHeight,
    options.ratioWidth,
    options.ratioHeight,
  );

  const needsExpand =
    layout.leftGap >= 8 || layout.rightGap >= 8 || layout.topGap >= 8 || layout.bottomGap >= 8;

  if (!needsExpand) {
    const cached = await loadDataURL(options.sourceDataUrl);
    return {
      dataUrl: cached.dataURL,
      fileId: cached.fileId,
      width: cached.width,
      height: cached.height,
      layout,
    };
  }

  void options.scenePrompt;

  let leftDataUrl: string | undefined;
  let rightDataUrl: string | undefined;
  let topDataUrl: string | undefined;
  let bottomDataUrl: string | undefined;

  const edgeOpts = {
    sourceDataUrl: options.sourceDataUrl,
    quality: options.quality,
    cloudConsent: options.cloudConsent,
    signal: options.signal,
  };

  if (layout.leftGap >= 8) {
    report("left", "กำลังต่อฉากทางซ้าย (outpaint)…");
    leftDataUrl = await generateEdgeFill({
      ...edgeOpts,
      side: "left",
      gapSize: layout.leftGap,
      crossEdge: layout.targetHeight,
    });
  }
  if (layout.rightGap >= 8) {
    report("right", "กำลังต่อฉากทางขวา (outpaint)…");
    rightDataUrl = await generateEdgeFill({
      ...edgeOpts,
      side: "right",
      gapSize: layout.rightGap,
      crossEdge: layout.targetHeight,
    });
  }
  if (layout.topGap >= 8) {
    report("top", "กำลังต่อฉากทางบน (outpaint)…");
    topDataUrl = await generateEdgeFill({
      ...edgeOpts,
      side: "top",
      gapSize: layout.topGap,
      crossEdge: layout.targetWidth,
    });
  }
  if (layout.bottomGap >= 8) {
    report("bottom", "กำลังต่อฉากทางล่าง (outpaint)…");
    bottomDataUrl = await generateEdgeFill({
      ...edgeOpts,
      side: "bottom",
      gapSize: layout.bottomGap,
      crossEdge: layout.targetWidth,
    });
  }

  report(
    "stitching",
    layout.axis === "vertical" ? "กำลังประกอบแถบบน–กลาง–ล่าง…" : "กำลังประกอบแถบซ้าย–กลาง–ขวา…",
  );
  const stitched = await stitchExpandPanels({
    layout,
    centerDataUrl: options.sourceDataUrl,
    leftDataUrl,
    rightDataUrl,
    topDataUrl,
    bottomDataUrl,
  });
  const cached = await loadDataURL(stitched.dataUrl);
  report("done", `ขยายเป็น ${cached.width}×${cached.height}px แล้ว`);
  return {
    dataUrl: cached.dataURL,
    fileId: cached.fileId,
    width: cached.width,
    height: cached.height,
    layout,
  };
}
