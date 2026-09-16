export type BriefPartition = {
  name: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  color: string;
  labelPlacement?: "top-left" | "center" | "top-center";
};

export type BriefDivider = {
  start: [number, number]; // [x, y] 0..1000
  end: [number, number]; // [x, y] 0..1000
  color?: string;
  strokeWidth?: number;
};

export type BriefObject = {
  name: string;
  shape: "ellipse" | "rect";
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  color: string;
  text?: string;
  textColor?: string;
};

export type BriefText = {
  text: string;
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
};

export type BriefHeroSubject = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  description: string; // e.g. "รูปภาพเด็กชาย กำลังยิ้มแย้ม และเล่นน้ำ ขณะใส่ห่วงยางสีน้ำเงิน"
  color?: string; // wireframe pastel fill, e.g. "#dbeafe"
};

export type BriefBackgroundZone = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  description: string; // e.g. "พื้นหลังเป็นภาพสวนน้ำ"
  color?: string; // wireframe pastel fill, e.g. "#f5f0eb"
};

export type BriefHeadlineCard = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  text: string; // e.g. "สวนน้ำ\nเปิดใหม่"
  color?: string; // wireframe pastel fill, e.g. "#e2e8f0"
};

export type BriefBadge = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  shape?: "ellipse" | "rect";
  text: string; // e.g. "เปิดแล้ว\nวันนี้"
  color?: string; // e.g. "#fcd34d"
};

export type BriefSubtextCard = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  text: string; // e.g. "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน"
  color?: string; // e.g. "#e2e8f0"
};

export type BriefFeatureTag = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  text: string; // e.g. "WATER SLIDES", "WAVE POOL", "KIDS ZONE"
  color?: string; // e.g. "#ffedd5"
};

export type BriefBrandLogo = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  text: string; // e.g. "AQUA WORLD"
  subtext?: string; // e.g. "PROMISE SMILES EVERYDAY"
  color?: string;
};

export type BriefFooterItem = {
  text: string; // e.g. "สนุกได้ทั้งครอบครัว", "ปลอดภัยได้มาตรฐาน"
  box?: [number, number, number, number];
};

export type BriefFooterDirection = "row" | "column";

export type BriefFooterBar = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  color?: string; // e.g. "#1e293b"
  /** row = left→right columns (selling points). column = top→bottom stack (title/subtitle/CTA). */
  direction?: BriefFooterDirection;
  items: BriefFooterItem[];
};

/**
 * Choose footer item flow when the model omits direction / per-item boxes.
 * Long stacked copy (title→CTA) → column; short equal selling points → row.
 */
export function resolveFooterBarDirection(
  footer: Pick<BriefFooterBar, "direction" | "items">,
  footerWidthPx: number,
  footerHeightPx: number,
): BriefFooterDirection {
  if (footer.direction === "row" || footer.direction === "column") {
    return footer.direction;
  }
  const items = footer.items;
  if (items.length <= 1) return "column";
  if (items.every((item) => Array.isArray(item.box) && item.box.length === 4)) {
    return "row"; // unused when boxes drive placement
  }

  const avgLen =
    items.reduce((sum, item) => sum + item.text.trim().length, 0) / items.length;
  const fontSize = Math.min(12, Math.max(9, Math.round(footerHeightPx * 0.28)));
  const colWidth = footerWidthPx / items.length;
  const fitsInColumns = avgLen * fontSize * 0.55 <= colWidth * 0.9;
  const canStack = footerHeightPx / items.length >= fontSize * 1.35;

  if (!fitsInColumns && canStack) return "column";
  if (canStack && avgLen >= 18 && items.length <= 3) return "column";
  if (canStack && avgLen >= 22) return "column";
  return "row";
}

export type ConvertToBriefData = {
  aspectRatio: { width: number; height: number };
  heroSubject?: BriefHeroSubject;
  backgroundZone?: BriefBackgroundZone;
  headlineCard?: BriefHeadlineCard;
  badge?: BriefBadge;
  subtextCard?: BriefSubtextCard;
  featureTags?: BriefFeatureTag[];
  brandLogo?: BriefBrandLogo;
  footerBar?: BriefFooterBar;

  // General layout partitions & backward compatibility
  backgroundPartitions: BriefPartition[];
  dividers: BriefDivider[];
  focalObjects: BriefObject[];
  texts: BriefText[];
};

export const BRIEF_VISION_PROMPT = `You are an expert advertising art director.
Analyze this ad/poster image and return a layout brief as ONE JSON object.

Rules:
- Return ONLY valid JSON. No markdown. No code fences. No trailing semicolon.
- Coordinates are normalized 0..1000 as [ymin, xmin, ymax, xmax] (0=top/left, 1000=bottom/right).
- Prefer real text from the image. Thai text must stay Thai.
- Include every major GRAPHIC layout block. Omit keys you cannot support.
- Keep the JSON compact but complete.
- "color" fields are ignored for fill (renderer uses one shared gray + borders). Do NOT invent yellow accents or colorful wireframe chrome.

Text policy (important):
- ONLY extract intentional design/copy: headline, subheadline, promo badge, feature tags/pills, brand logo, footer bar items.
- heroSubject.description / backgroundZone.description are short SCENE NOTES for the zone (who/what is pictured), NOT poster copy. Never put those notes into texts, intentionalTexts, featureTags, or any text field that would be drawn as layout copy.
- DO NOT extract photographic / background / prop text, including:
  - text printed on clothing, towels, tubes, or merch in the photo
  - text on signs, boards, or scenery that are part of the photograph (not the ad layout)
  - watermarks, UI chrome, or accidental OCR noise
- Put person/product appearance only in heroSubject.description (no clothing slogans as separate text).
- Leave "texts" and "intentionalTexts" empty unless a layout text does not fit the named fields above.
- footerBar.direction: use "column" when footer copy stacks top→bottom (title / subtitle / CTA). Use "row" when equal selling-point columns sit left→right. Prefer per-item box when positions are clear.

Required shape:
{
  "aspectRatio": { "width": number, "height": number },
  "heroSubject": { "box": [ymin,xmin,ymax,xmax], "description": "Thai", "color": "#e5e5e5" },
  "backgroundZone": { "box": [ymin,xmin,ymax,xmax], "description": "Thai", "color": "#e5e5e5" },
  "headlineCard": { "box": [ymin,xmin,ymax,xmax], "text": "exact text", "color": "#e5e5e5" },
  "badge": { "box": [ymin,xmin,ymax,xmax], "shape": "ellipse"|"rect", "text": "exact text", "color": "#e5e5e5" },
  "subtextCard": { "box": [ymin,xmin,ymax,xmax], "text": "exact text", "color": "#e5e5e5" },
  "featureTags": [{ "text": "exact", "box": [ymin,xmin,ymax,xmax], "color": "#e5e5e5" }],
  "brandLogo": { "box": [ymin,xmin,ymax,xmax], "text": "brand", "subtext": "optional" },
  "footerBar": { "box": [ymin,xmin,ymax,xmax], "color": "#e5e5e5", "direction": "row"|"column", "items": [{ "text": "exact", "box": [ymin,xmin,ymax,xmax] }] },
  "dividers": [],
  "backgroundPartitions": [],
  "focalObjects": [],
  "texts": [],
  "intentionalTexts": []
}`;

/** True when a brief has at least one layout region the canvas generator can draw. */
export function isUsableBriefLayout(data: ConvertToBriefData | null | undefined): boolean {
  if (!data) return false;
  return Boolean(
    data.heroSubject ||
      data.headlineCard ||
      data.backgroundZone ||
      data.badge ||
      data.subtextCard ||
      data.brandLogo ||
      data.footerBar ||
      (data.featureTags && data.featureTags.length > 0) ||
      (data.backgroundPartitions && data.backgroundPartitions.length > 0) ||
      (data.focalObjects && data.focalObjects.length > 0),
  );
}

type NormBox = [number, number, number, number];

function boxCenter(box: NormBox): { y: number; x: number } {
  return { y: (box[0] + box[2]) / 2, x: (box[1] + box[3]) / 2 };
}

function pointInBox(y: number, x: number, box: NormBox, pad = 20): boolean {
  return y >= box[0] - pad && y <= box[2] + pad && x >= box[1] - pad && x <= box[3] + pad;
}

function normalizeCopy(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectProtectedCopy(data: {
  headlineCard?: BriefHeadlineCard;
  badge?: BriefBadge;
  subtextCard?: BriefSubtextCard;
  featureTags?: BriefFeatureTag[];
  brandLogo?: BriefBrandLogo;
  footerBar?: BriefFooterBar;
}): Set<string> {
  const protectedCopy = new Set<string>();
  const add = (value?: string) => {
    const normalized = value ? normalizeCopy(value) : "";
    if (normalized) protectedCopy.add(normalized);
  };
  add(data.headlineCard?.text);
  add(data.badge?.text);
  add(data.subtextCard?.text);
  add(data.brandLogo?.text);
  add(data.brandLogo?.subtext);
  for (const tag of data.featureTags ?? []) add(tag.text);
  for (const item of data.footerBar?.items ?? []) add(item.text);
  return protectedCopy;
}

/**
 * Drop OCR/noise text that sits inside the hero photo (e.g. shirt slogans)
 * unless it matches intentional layout copy already captured in named fields.
 */
export function filterPhotographicBriefTexts(
  texts: BriefText[],
  heroSubject?: BriefHeroSubject,
  protectedCopy: Set<string> = new Set(),
): BriefText[] {
  if (!heroSubject) {
    return texts.filter((item) => Boolean(item.text?.trim()));
  }
  return texts.filter((item) => {
    const clean = item.text?.trim();
    if (!clean) return false;
    if (protectedCopy.has(normalizeCopy(clean))) return false;
    const center = boxCenter(item.box);
    // Text centered inside the hero photograph is treated as photo-intrinsic noise.
    if (pointInBox(center.y, center.x, heroSubject.box)) return false;
    return true;
  });
}

export function parseBriefResponse(raw: string): ConvertToBriefData | null {
  try {
    let clean = raw.trim();
    clean = clean.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
    // Models sometimes echo `};` from broken prompt examples.
    clean = clean.replace(/;\s*$/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    let candidate = jsonMatch[0].replace(/;\s*$/g, "");
    let parsed: (Partial<ConvertToBriefData> & Record<string, any>) | null = null;

    try {
      parsed = JSON.parse(candidate);
    } catch {
      // Repair pass 1: remove trailing commas before } or ]
      candidate = candidate.replace(/,\s*([}\]])/g, "$1");
      try {
        parsed = JSON.parse(candidate);
      } catch {
        // Repair pass 2: fix unescaped newlines inside strings
        candidate = candidate.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/gs, (match) =>
          match.replace(/\r?\n/g, "\\n")
        );
        try {
          parsed = JSON.parse(candidate);
        } catch {
          // Repair pass 3: balance unclosed braces if response was truncated
          const openB = (candidate.match(/\{/g) || []).length;
          const closeB = (candidate.match(/\}/g) || []).length;
          if (openB > closeB) {
            candidate += "}".repeat(openB - closeB);
            try {
              parsed = JSON.parse(candidate);
            } catch {
              parsed = null;
            }
          }
        }
      }
    }

    if (!parsed || typeof parsed !== "object") return null;

    const aspectRatio = parsed.aspectRatio || { width: 1000, height: 700 };

    // 1. Parse Art Direction specific fields
    let heroSubject: BriefHeroSubject | undefined;
    if (parsed.heroSubject && typeof parsed.heroSubject === "object") {
      const p = parsed.heroSubject;
      if (Array.isArray(p.box) && p.box.length === 4 && p.description) {
        heroSubject = {
          box: p.box as [number, number, number, number],
          description: String(p.description),
          color: p.color || "#dbeafe",
        };
      }
    }

    let backgroundZone: BriefBackgroundZone | undefined;
    if (parsed.backgroundZone && typeof parsed.backgroundZone === "object") {
      const p = parsed.backgroundZone;
      if (Array.isArray(p.box) && p.box.length === 4 && p.description) {
        backgroundZone = {
          box: p.box as [number, number, number, number],
          description: String(p.description),
          color: p.color || "#f5f0eb",
        };
      }
    }

    let headlineCard: BriefHeadlineCard | undefined;
    if (parsed.headlineCard && typeof parsed.headlineCard === "object") {
      const p = parsed.headlineCard;
      if (Array.isArray(p.box) && p.box.length === 4 && p.text) {
        headlineCard = {
          box: p.box as [number, number, number, number],
          text: String(p.text),
          color: p.color || "#e2e8f0",
        };
      }
    }

    let badge: BriefBadge | undefined;
    if (parsed.badge && typeof parsed.badge === "object") {
      const p = parsed.badge;
      if (Array.isArray(p.box) && p.box.length === 4 && p.text) {
        badge = {
          box: p.box as [number, number, number, number],
          shape: p.shape === "rect" ? "rect" : "ellipse",
          text: String(p.text),
          color: p.color || "#fcd34d",
        };
      }
    }

    let subtextCard: BriefSubtextCard | undefined;
    if (parsed.subtextCard && typeof parsed.subtextCard === "object") {
      const p = parsed.subtextCard;
      if (Array.isArray(p.box) && p.box.length === 4 && p.text) {
        subtextCard = {
          box: p.box as [number, number, number, number],
          text: String(p.text),
          color: p.color || "#e2e8f0",
        };
      }
    }

    // 2. Parse featureTags (e.g. side pills: WATER SLIDES, WAVE POOL...)
    let featureTags: BriefFeatureTag[] | undefined;
    if (Array.isArray(parsed.featureTags)) {
      featureTags = parsed.featureTags
        .filter((t: any) => t && typeof t === "object" && t.text && Array.isArray(t.box) && t.box.length === 4)
        .map((t: any) => ({
          text: String(t.text),
          box: t.box as [number, number, number, number],
          color: t.color || "#fed7aa",
        }));
    }

    // 3. Parse brandLogo (e.g. AQUA WORLD)
    let brandLogo: BriefBrandLogo | undefined;
    if (parsed.brandLogo && typeof parsed.brandLogo === "object") {
      const bl = parsed.brandLogo;
      if (Array.isArray(bl.box) && bl.box.length === 4 && bl.text) {
        brandLogo = {
          box: bl.box as [number, number, number, number],
          text: String(bl.text),
          subtext: bl.subtext ? String(bl.subtext) : undefined,
          color: bl.color,
        };
      }
    }

    // 4. Parse footerBar (e.g. bottom feature bar with selling points)
    let footerBar: BriefFooterBar | undefined;
    if (parsed.footerBar && typeof parsed.footerBar === "object") {
      const fb = parsed.footerBar;
      if (Array.isArray(fb.box) && fb.box.length === 4 && Array.isArray(fb.items)) {
        const rawDir = typeof fb.direction === "string" ? fb.direction.toLowerCase() : "";
        const direction =
          rawDir === "column" || rawDir === "vertical" || rawDir === "stack"
            ? "column"
            : rawDir === "row" || rawDir === "horizontal"
              ? "row"
              : undefined;
        footerBar = {
          box: fb.box as [number, number, number, number],
          color: fb.color || "#1e293b",
          direction,
          items: fb.items
            .filter((item: any) => item && (typeof item === "string" || item.text))
            .map((item: any) => {
              if (typeof item === "string") return { text: item };
              return {
                text: String(item.text),
                box: Array.isArray(item.box) && item.box.length === 4 ? item.box : undefined,
              };
            }),
        };
      }
    }

    // 5. Parse general/backward-compatible fields
    const backgroundPartitions: BriefPartition[] = Array.isArray(parsed.backgroundPartitions)
      ? parsed.backgroundPartitions.map((p) => ({
          name: String(p.name || "พื้นที่หลัก"),
          box: Array.isArray(p.box) && p.box.length === 4 ? (p.box as [number, number, number, number]) : [0, 0, 1000, 1000],
          color: String(p.color || "#e0e7ff"),
          labelPlacement: p.labelPlacement || "top-left",
        }))
      : [];

    // Do NOT synthesize partitions from heroSubject / backgroundZone.
    // Those descriptions are scene notes; drawing them as labeled zones
    // puts "Text จาก Background" onto the brief canvas.

    const dividers: BriefDivider[] = Array.isArray(parsed.dividers)
      ? parsed.dividers.map((d) => ({
          start: d.start || [0, 500],
          end: d.end || [1000, 500],
          color: d.color || "#000000",
          strokeWidth: d.strokeWidth || 1.5,
        }))
      : [];

    const focalObjects: BriefObject[] = Array.isArray(parsed.focalObjects)
      ? parsed.focalObjects.map((o) => ({
          name: String(o.name || "วัตถุ"),
          shape: o.shape === "rect" ? "rect" : "ellipse",
          box: Array.isArray(o.box) && o.box.length === 4 ? (o.box as [number, number, number, number]) : [200, 200, 400, 400],
          color: String(o.color || "#fef08a"),
          text: o.text ? String(o.text) : undefined,
          textColor: o.textColor || "#000000",
        }))
      : [];

    // Synthesize focal objects if not explicitly given
    if (focalObjects.length === 0) {
      if (headlineCard) {
        focalObjects.push({
          name: "พาดหัวหลัก",
          shape: "rect",
          box: headlineCard.box,
          color: headlineCard.color || "#e2e8f0",
          text: headlineCard.text,
          textColor: "#0f172a",
        });
      }
      if (badge) {
        focalObjects.push({
          name: "ป้ายโปรโมชัน",
          shape: badge.shape || "ellipse",
          box: badge.box,
          color: badge.color || "#fcd34d",
          text: badge.text,
          textColor: "#0f172a",
        });
      }
      if (subtextCard) {
        focalObjects.push({
          name: "คำโปรย / สโลแกน",
          shape: "rect",
          box: subtextCard.box,
          color: subtextCard.color || "#e2e8f0",
          text: subtextCard.text,
          textColor: "#0f172a",
        });
      }
      if (featureTags) {
        for (const ft of featureTags) {
          focalObjects.push({
            name: ft.text,
            shape: "rect",
            box: ft.box,
            color: ft.color || "#fed7aa",
            text: ft.text,
            textColor: "#0f172a",
          });
        }
      }
    }

    const texts: BriefText[] = Array.isArray(parsed.texts)
      ? parsed.texts.map((t: any) => ({
          text: String(t.text || ""),
          box: Array.isArray(t.box) && t.box.length === 4 ? (t.box as [number, number, number, number]) : [200, 200, 300, 400],
          fontSize: Number(t.fontSize) || 16,
          color: t.color || "#000000",
          align: t.align || "center",
        }))
      : [];

    // Parse intentionalTexts from the new prompt
    if (Array.isArray(parsed.intentionalTexts)) {
      for (const it of parsed.intentionalTexts) {
        if (it && typeof it === "object" && it.text && Array.isArray(it.box) && it.box.length === 4) {
          texts.push({
            text: String(it.text),
            box: it.box as [number, number, number, number],
            fontSize: Number(it.fontSize) || 14,
            color: "#0f172a",
            align: "center",
          });
        }
      }
    }

    const protectedCopy = collectProtectedCopy({
      headlineCard,
      badge,
      subtextCard,
      featureTags,
      brandLogo,
      footerBar,
    });
    const filteredTexts = filterPhotographicBriefTexts(texts, heroSubject, protectedCopy);
    const filteredFocalObjects = focalObjects.filter((object) => {
      const clean = object.text?.trim();
      if (!clean || !heroSubject) return true;
      if (protectedCopy.has(normalizeCopy(clean))) return true;
      const center = boxCenter(object.box);
      return !pointInBox(center.y, center.x, heroSubject.box);
    });

    return {
      aspectRatio,
      heroSubject,
      backgroundZone,
      headlineCard,
      badge,
      subtextCard,
      featureTags,
      brandLogo,
      footerBar,
      backgroundPartitions,
      dividers,
      focalObjects: filteredFocalObjects,
      texts: filteredTexts,
    };
  } catch {
    return null;
  }
}

