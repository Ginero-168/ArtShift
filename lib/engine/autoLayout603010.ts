import type { EngineElement, EngineSlide, TextElement } from "./types";

export interface AutoLayoutPatch {
  id: string;
  patch: Partial<EngineElement>;
}

export interface VisionSubjectScore {
  isHeroSubject: boolean;
  visualProminence: number;
}

/**
 * 60 / 30 / 10 Auto-Layout Algorithm
 *
 * Hierarchy of visual priority:
 * 3D Book (bookMockup) > Hero Image (Vision AI) > Image (image / frame) > Shape (rect, ellipse, star...) > Text (text)
 *
 * Directional flow:
 * From Top-Right (60% Hero Dominant) -> Left/Center (30% Secondary) -> Bottom-Left (10% Accent)
 *
 * Workspace coverage:
 * Scales elements proportionally to utilize near 100% of the active canvas zone.
 */
export function compute603010AutoLayout(
  slide: EngineSlide,
  visionScores?: Record<string, VisionSubjectScore>,
): AutoLayoutPatch[] {
  const elements = slide.elements.filter((e) => !e.isDeleted && e.visible !== false);
  if (elements.length === 0) return [];

  const slideW = slide.width;
  const slideH = slide.height;
  const isPortrait = slideH > slideW * 1.15;
  const isSquare = !isPortrait && Math.abs(slideW - slideH) < slideW * 0.15;

  // Single element case: scale to fit beautifully centered
  if (elements.length === 1) {
    const el = elements[0];
    const aspect = Math.max(0.1, el.width / Math.max(1, el.height));
    let targetW = slideW * 0.75;
    let targetH = targetW / aspect;
    if (targetH > slideH * 0.78) {
      targetH = slideH * 0.78;
      targetW = targetH * aspect;
    }
    targetW = Math.round(targetW);
    targetH = Math.round(targetH);
    const targetX = Math.round((slideW - targetW) / 2);
    const targetY = Math.round((slideH - targetH) / 2);
    return [{ id: el.id, patch: { x: targetX, y: targetY, width: targetW, height: targetH } }];
  }

  // Priority scoring: 3D Book > Hero Image (Vision AI) > Image > Shape > Text > Others
  function getPriority(el: EngineElement): number {
    switch (el.type) {
      case "bookMockup":
        return 4000;
      case "image":
      case "frame": {
        const vScore = visionScores?.[el.id];
        if (vScore?.isHeroSubject) {
          return 3800 + Math.min(150, Math.round(vScore.visualProminence * 100));
        }
        return 3000;
      }
      case "rect":
      case "ellipse":
      case "diamond":
      case "triangle":
      case "star":
      case "hexagon":
      case "heart":
      case "plus":
        return 2000;
      case "text": {
        const textEl = el as TextElement;
        const len = textEl.text?.length ?? 0;
        const fs = textEl.fontSize ?? 24;
        if (textEl.textPreset === "title" || fs >= 36) return 1400;
        if (textEl.textPreset === "subtitle" || (fs >= 24 && len > 20)) return 1200;
        if (
          textEl.textPreset === "price" ||
          textEl.textPreset === "sale" ||
          textEl.textPreset === "author"
        ) {
          return 900;
        }
        return 1000 + Math.min(100, fs);
      }
      default:
        return 500;
    }
  }

  // Sort by priority descending
  const sorted = [...elements].sort((a, b) => getPriority(b) - getPriority(a));

  // Determine tiers: 60% Hero, 30% Secondary, 10% Accent
  const heroElements: EngineElement[] = [];
  const secondaryElements: EngineElement[] = [];
  const accentElements: EngineElement[] = [];

  // Top element becomes the 60% Hero
  heroElements.push(sorted[0]);

  // Distribute remaining elements
  const remaining = sorted.slice(1);

  for (const el of remaining) {
    const prio = getPriority(el);
    if (prio >= 1200) {
      // High-priority text or secondary media goes to 30% Secondary
      if (secondaryElements.length < 3) {
        secondaryElements.push(el);
      } else {
        accentElements.push(el);
      }
    } else {
      // Lower priority elements go to 10% Accent
      accentElements.push(el);
    }
  }

  // If secondary is empty and we have accents, promote the first accent to secondary
  if (secondaryElements.length === 0 && accentElements.length > 0) {
    secondaryElements.push(accentElements.shift()!);
  }

  const patches: AutoLayoutPatch[] = [];

  // Define 60/30/10 Zones based on canvas orientation (Top-Right to Bottom-Left)
  let zone60: { x: number; y: number; width: number; height: number };
  let zone30: { x: number; y: number; width: number; height: number };
  let zone10: { x: number; y: number; width: number; height: number };

  if (isPortrait) {
    zone60 = {
      x: Math.round(slideW * 0.08),
      y: Math.round(slideH * 0.05),
      width: Math.round(slideW * 0.84),
      height: Math.round(slideH * 0.5),
    };
    zone30 = {
      x: Math.round(slideW * 0.08),
      y: Math.round(slideH * 0.57),
      width: Math.round(slideW * 0.84),
      height: Math.round(slideH * 0.26),
    };
    zone10 = {
      x: Math.round(slideW * 0.08),
      y: Math.round(slideH * 0.85),
      width: Math.round(slideW * 0.84),
      height: Math.round(slideH * 0.1),
    };
  } else if (isSquare) {
    // Square 1:1
    zone60 = {
      x: Math.round(slideW * 0.4),
      y: Math.round(slideH * 0.06),
      width: Math.round(slideW * 0.54),
      height: Math.round(slideH * 0.88),
    };
    zone30 = {
      x: Math.round(slideW * 0.06),
      y: Math.round(slideH * 0.08),
      width: Math.round(slideW * 0.32),
      height: Math.round(slideH * 0.54),
    };
    zone10 = {
      x: Math.round(slideW * 0.06),
      y: Math.round(slideH * 0.66),
      width: Math.round(slideW * 0.32),
      height: Math.round(slideH * 0.28),
    };
  } else {
    // Landscape (16:9, etc.) - Top-Right (60%) to Bottom-Left (30% & 10%)
    zone60 = {
      x: Math.round(slideW * 0.42),
      y: Math.round(slideH * 0.05),
      width: Math.round(slideW * 0.53),
      height: Math.round(slideH * 0.9),
    };
    zone30 = {
      x: Math.round(slideW * 0.06),
      y: Math.round(slideH * 0.08),
      width: Math.round(slideW * 0.33),
      height: Math.round(slideH * 0.54),
    };
    zone10 = {
      x: Math.round(slideW * 0.06),
      y: Math.round(slideH * 0.65),
      width: Math.round(slideW * 0.33),
      height: Math.round(slideH * 0.28),
    };
  }

  // --- 1. Layout Hero Zone (60% Dominant - Top Right) ---
  for (const hero of heroElements) {
    const origW = Math.max(1, hero.width);
    const origH = Math.max(1, hero.height);
    const aspect = origW / origH;

    let targetW = zone60.width * 0.95;
    let targetH = targetW / aspect;

    if (targetH > zone60.height * 0.95) {
      targetH = zone60.height * 0.95;
      targetW = targetH * aspect;
    }

    targetW = Math.round(targetW);
    targetH = Math.round(targetH);

    const targetX = Math.round(zone60.x + (zone60.width - targetW) / 2);
    const targetY = Math.round(zone60.y + (zone60.height - targetH) / 2);

    patches.push({
      id: hero.id,
      patch: {
        x: targetX,
        y: targetY,
        width: targetW,
        height: targetH,
      },
    });
  }

  // --- 2. Layout Secondary Zone (30% Supporting - Upper/Mid Left) ---
  let currentY30 = zone30.y;
  const gap30 = Math.max(12, Math.round(slideH * 0.02));

  for (const sec of secondaryElements) {
    if (sec.type === "text") {
      const textEl = sec as TextElement;
      const targetW = Math.round(zone30.width);
      const baseFs = Math.max(22, Math.min(64, Math.round(slideW * 0.032)));
      const fs =
        textEl.textPreset === "title" || getPriority(sec) === 1400
          ? baseFs
          : Math.round(baseFs * 0.65);
      const approxLineCount = Math.max(1, Math.ceil((textEl.text.length * fs * 0.6) / targetW));
      const targetH = Math.round(approxLineCount * fs * 1.4 + 20);

      patches.push({
        id: sec.id,
        patch: {
          x: zone30.x,
          y: currentY30,
          width: targetW,
          height: targetH,
          fontSize: fs,
          textAlign: "left",
        },
      });

      currentY30 += targetH + gap30;
    } else {
      const aspect = Math.max(0.1, sec.width / Math.max(1, sec.height));
      let targetW = zone30.width;
      let targetH = Math.round(targetW / aspect);
      if (targetH > zone30.height * 0.6) {
        targetH = Math.round(zone30.height * 0.6);
        targetW = Math.round(targetH * aspect);
      }
      patches.push({
        id: sec.id,
        patch: {
          x: zone30.x,
          y: currentY30,
          width: targetW,
          height: targetH,
        },
      });
      currentY30 += targetH + gap30;
    }
  }

  // --- 3. Layout Accent Zone (10% Detail / CTA - Bottom Left) ---
  let currentY10 = zone10.y;
  const gap10 = Math.max(10, Math.round(slideH * 0.015));

  for (const acc of accentElements) {
    if (acc.type === "text") {
      const textEl = acc as TextElement;
      const targetW = Math.round(zone10.width);
      const fs = Math.max(14, Math.min(24, Math.round(slideW * 0.015)));
      const approxLineCount = Math.max(1, Math.ceil((textEl.text.length * fs * 0.6) / targetW));
      const targetH = Math.round(approxLineCount * fs * 1.4 + 12);

      patches.push({
        id: acc.id,
        patch: {
          x: zone10.x,
          y: currentY10,
          width: targetW,
          height: targetH,
          fontSize: fs,
          textAlign: "left",
        },
      });

      currentY10 += targetH + gap10;
    } else {
      const targetW = Math.min(zone10.width, Math.max(120, Math.round(acc.width * 1.1)));
      const targetH = Math.min(zone10.height, Math.max(40, Math.round(acc.height * 1.1)));
      patches.push({
        id: acc.id,
        patch: {
          x: zone10.x,
          y: currentY10,
          width: targetW,
          height: targetH,
        },
      });
      currentY10 += targetH + gap10;
    }
  }

  return patches;
}

/**
 * Enhanced Vision-Aware 60/30/10 Auto-Layout:
 * Scans slide images via local Vision AI to identify prominent Hero subjects (products, models, objects).
 * Images with detected Hero subjects receive boosted visual priority in the 60% Dominant Golden Ratio zone.
 */
export async function computeVisionAware603010AutoLayout(
  slide: EngineSlide,
  onStatus?: (status: string) => void,
): Promise<AutoLayoutPatch[]> {
  const images = slide.elements.filter(
    (e) => !e.isDeleted && e.visible !== false && (e.type === "image" || e.type === "frame"),
  );

  const visionScores: Record<string, VisionSubjectScore> = {};

  if (images.length > 0 && typeof window !== "undefined") {
    try {
      onStatus?.("Analyzing visual hierarchy with Vision AI...");
      const { getCached } = await import("./imageCache");
      const { visionDetect } = await import("../vision/visionEngine");

      for (const imgEl of images) {
        if (imgEl.type === "image") {
          const cached = getCached(imgEl.fileId);
          if (cached?.dataURL) {
            try {
              const res = await visionDetect(cached.dataURL);
              const objects = res.objects;
              const hasHeroObject = objects.some(
                (o) =>
                  o.label.includes("person") ||
                  o.label.includes("book") ||
                  o.label.includes("product") ||
                  o.label.includes("shoe") ||
                  o.label.includes("bottle") ||
                  o.label.includes("car") ||
                  o.label.includes("bag") ||
                  o.label.includes("dress"),
              );
              visionScores[imgEl.id] = {
                isHeroSubject: hasHeroObject || objects.length >= 1,
                visualProminence: Math.min(1, objects.length * 0.3),
              };
            } catch {
              // Fallback silently for single image
            }
          }
        }
      }
    } catch {
      // Vision engine load fallback
    }
  }

  return compute603010AutoLayout(slide, visionScores);
}
