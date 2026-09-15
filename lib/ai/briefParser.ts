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

export type BriefFooterBar = {
  box: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0..1000
  color?: string; // e.g. "#1e293b"
  items: BriefFooterItem[];
};

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
Analyze this ad/poster image and return a wireframe brief as ONE JSON object.

Rules:
- Return ONLY valid JSON. No markdown. No code fences. No trailing semicolon.
- Coordinates are normalized 0..1000 as [ymin, xmin, ymax, xmax] (0=top/left, 1000=bottom/right).
- Prefer real text from the image. Thai text must stay Thai.
- Include every major layout block you can see. Omit keys you cannot support.
- Keep the JSON compact but complete.

Required shape:
{
  "aspectRatio": { "width": number, "height": number },
  "heroSubject": { "box": [ymin,xmin,ymax,xmax], "description": "Thai", "color": "#dbeafe" },
  "backgroundZone": { "box": [ymin,xmin,ymax,xmax], "description": "Thai", "color": "#f5f0eb" },
  "headlineCard": { "box": [ymin,xmin,ymax,xmax], "text": "exact text", "color": "#e2e8f0" },
  "badge": { "box": [ymin,xmin,ymax,xmax], "shape": "ellipse"|"rect", "text": "exact text", "color": "#fcd34d" },
  "subtextCard": { "box": [ymin,xmin,ymax,xmax], "text": "exact text", "color": "#e2e8f0" },
  "featureTags": [{ "text": "exact", "box": [ymin,xmin,ymax,xmax], "color": "#fed7aa" }],
  "brandLogo": { "box": [ymin,xmin,ymax,xmax], "text": "brand", "subtext": "optional" },
  "footerBar": { "box": [ymin,xmin,ymax,xmax], "color": "#1e293b", "items": [{ "text": "exact" }] },
  "dividers": [{ "start": [x,y], "end": [x,y], "color": "#000000", "strokeWidth": 1.5 }],
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
        footerBar = {
          box: fb.box as [number, number, number, number],
          color: fb.color || "#1e293b",
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

    // Synthesize partitions from art direction if not explicitly given
    if (backgroundPartitions.length === 0) {
      if (heroSubject) {
        backgroundPartitions.push({
          name: heroSubject.description,
          box: heroSubject.box,
          color: heroSubject.color || "#dbeafe",
          labelPlacement: "center",
        });
      }
      if (backgroundZone) {
        backgroundPartitions.push({
          name: backgroundZone.description,
          box: backgroundZone.box,
          color: backgroundZone.color || "#f5f0eb",
          labelPlacement: "top-center",
        });
      }
    }

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
      focalObjects,
      texts,
    };
  } catch {
    return null;
  }
}

