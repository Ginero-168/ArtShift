import { nanoid } from "nanoid";
import type { EngineElement, ImageElement, RectElement, TextElement } from "./engine/types";
import { DEFAULT_THAI_FONT_FAMILY } from "./fonts";

/*
 * Deterministic slide templates.
 *
 * Each template takes structured data and returns a fully-positioned array of
 * EngineElements for a 1920 x 1080 canvas. The AI agent calls `apply_template`
 * instead of placing dozens of text/shape objects by hand — this guarantees
 * pixel-perfect alignment regardless of model jitter.
 *
 * All coordinates follow a shared 72px outer margin + 36px gutter grid.
 */

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
const MARGIN = 72;
const GUTTER = 36;

export type TemplateResult = {
  objects: EngineElement[];
  background: string;
};

function nid(): string {
  return nanoid(8);
}

function text(
  partial: Partial<TextElement> & {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    align?: string;
  },
): TextElement {
  return {
    id: nid(),
    type: "text",
    angle: 0,
    opacity: partial.opacity ?? 1,
    strokeColor: partial.strokeColor ?? partial.fill ?? "#111111", // backward compat map
    backgroundColor: "transparent",
    text: partial.text,
    fontSize: partial.fontSize ?? 36,
    fontFamily: partial.fontFamily ?? DEFAULT_THAI_FONT_FAMILY,
    fontStyle: partial.fontStyle ?? "normal",
    textAlign: partial.align === "center" ? "center" : partial.align === "right" ? "right" : "left",
    verticalAlign: "top",
    lineHeight: partial.lineHeight ?? 1.3,
    containerId: null,
    groupIds: [],
    locked: false,
    z: 0,
    version: 1,
    isDeleted: false,
    seed: Math.floor(Math.random() * 1e9),
    strokeWidth: 1,
    strokeStyle: "solid",
    fillStyle: "solid",
    edgeStyle: "sharp",
    roughness: 0,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
  } as TextElement;
}

function rect(
  partial: Partial<RectElement> & {
    x: number;
    y: number;
    width: number;
    height: number;
    fill?: string;
    stroke?: string;
  },
): RectElement {
  return {
    id: nid(),
    type: "rect",
    angle: 0,
    opacity: 1,
    strokeColor: partial.strokeColor ?? partial.stroke ?? "transparent",
    backgroundColor: partial.backgroundColor ?? partial.fill ?? "#ffffff",
    strokeWidth: partial.strokeWidth ?? 0,
    strokeStyle: "solid",
    fillStyle: "solid",
    edgeStyle: "sharp",
    roughness: 0,
    cornerRadius: partial.cornerRadius ?? 16,
    seed: Math.floor(Math.random() * 1e9),
    groupIds: [],
    locked: false,
    z: 0,
    version: 1,
    isDeleted: false,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
  } as RectElement;
}

function image(
  src: string,
  partial: Partial<ImageElement> & {
    x: number;
    y: number;
    width: number;
    height: number;
    alt?: string;
  },
): ImageElement {
  return {
    id: nid(),
    type: "image",
    fileId: src,
    crop: null,
    naturalWidth: partial.width,
    naturalHeight: partial.height,
    status: "loaded",
    angle: 0,
    opacity: 1,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    strokeWidth: 0,
    strokeStyle: "solid",
    fillStyle: "solid",
    edgeStyle: "sharp",
    roughness: 0,
    seed: Math.floor(Math.random() * 1e9),
    groupIds: [],
    locked: false,
    z: 0,
    version: 1,
    isDeleted: false,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
  } as ImageElement;
}

// ---------- Shared palette ----------

type Palette = {
  accent: string;
  accentInk: string;
  cardFill: string;
  cardStroke: string;
  textPrimary: string;
  textMuted: string;
  slideBg: string;
};

function palette(accent: string | undefined): Palette {
  const a = accent ?? "#e8c79a";
  return {
    accent: a,
    accentInk: "#2b1b0a",
    cardFill: "#ffffff",
    cardStroke: "#e8d9c0",
    textPrimary: "#1a1a1a",
    textMuted: "#6b6055",
    slideBg: "#fbf7ee",
  };
}

// ---------- Template: three-column-cards ----------

export type ThreeColumnCardsData = {
  title: string;
  subtitle?: string;
  accent?: string;
  background?: string;
  columns: Array<{
    icon?: string;
    header: string;
    body: { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };
  }>;
};

function threeColumnCards(d: ThreeColumnCardsData): TemplateResult {
  const pal = palette(d.accent);
  const cols = d.columns.slice(0, 3); // max 3
  const n = cols.length;
  const objects: EngineElement[] = [];

  // 1. Title bar band
  const barH = 96;
  objects.push(
    rect({
      x: 0,
      y: 0,
      width: CANVAS_W,
      height: barH,
      fill: pal.accent,
      cornerRadius: 0,
    }),
  );
  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: 20,
      width: CANVAS_W - MARGIN * 2,
      height: barH - 20,
      fontSize: 64,
      fontStyle: "bold",
      align: "center",
      fill: pal.accentInk,
    }),
  );

  // 2. Optional centered subtitle under the bar
  let cardsTop = barH + 36;
  if (d.subtitle) {
    const subH = 32;
    objects.push(
      text({
        text: d.subtitle,
        x: MARGIN,
        y: barH + 18,
        width: CANVAS_W - MARGIN * 2,
        height: subH,
        fontSize: 32,
        fontStyle: "italic",
        align: "center",
        fill: pal.textMuted,
      }),
    );
    cardsTop = barH + 18 + subH + 20;
  }

  // 3. Card grid
  const availableW = CANVAS_W - MARGIN * 2;
  const colW = (availableW - GUTTER * (n - 1)) / n;
  const cardH = CANVAS_H - cardsTop - MARGIN;

  for (let i = 0; i < n; i++) {
    const col = cols[i];
    const cx = MARGIN + i * (colW + GUTTER);

    objects.push(
      rect({
        x: cx,
        y: cardsTop,
        width: colW,
        height: cardH,
        fill: pal.cardFill,
        stroke: pal.cardStroke,
        strokeWidth: 1,
        cornerRadius: 14,
      }),
    );

    const pad = 20;
    const headerText = col.icon ? `${col.icon}  ${col.header}` : col.header;
    objects.push(
      text({
        text: headerText,
        x: cx + pad,
        y: cardsTop + pad,
        width: colW - pad * 2,
        height: 40,
        fontSize: 36,
        fontStyle: "bold",
        align: "left",
        fill: pal.textPrimary,
      }),
    );

    const bodyTop = cardsTop + pad + 40 + 12;
    const bodyH = cardH - (bodyTop - cardsTop) - pad;
    const bodyText =
      col.body.kind === "paragraph"
        ? col.body.text
        : col.body.items.map((it) => `•  ${it}`).join("\n");

    objects.push(
      text({
        text: bodyText,
        x: cx + pad,
        y: bodyTop,
        width: colW - pad * 2,
        height: bodyH,
        fontSize: 28,
        fontStyle: "normal",
        align: "left",
        fill: pal.textPrimary,
        lineHeight: 1.55,
      }),
    );
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: title-bullets ----------

export type TitleBulletsData = {
  title: string;
  subtitle?: string;
  bullets: string[];
  accent?: string;
  background?: string;
};

function titleBullets(d: TitleBulletsData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];

  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: 72,
      width: CANVAS_W - MARGIN * 2,
      height: 72,
      fontSize: 84,
      fontStyle: "bold",
      align: "left",
      fill: pal.textPrimary,
    }),
  );

  // Accent underline
  objects.push(
    rect({
      x: MARGIN,
      y: 72 + 72 + 6,
      width: 96,
      height: 6,
      fill: pal.accent,
      cornerRadius: 3,
    }),
  );

  let bulletsTop = 72 + 72 + 6 + 32;

  if (d.subtitle) {
    objects.push(
      text({
        text: d.subtitle,
        x: MARGIN,
        y: bulletsTop,
        width: CANVAS_W - MARGIN * 2,
        height: 36,
        fontSize: 36,
        fontStyle: "italic",
        align: "left",
        fill: pal.textMuted,
      }),
    );
    bulletsTop += 48;
  }

  const bulletsBody = d.bullets.map((b) => `•  ${b}`).join("\n");
  objects.push(
    text({
      text: bulletsBody,
      x: MARGIN,
      y: bulletsTop,
      width: CANVAS_W - MARGIN * 2,
      height: CANVAS_H - bulletsTop - MARGIN,
      fontSize: 48,
      fontStyle: "normal",
      align: "left",
      fill: pal.textPrimary,
      lineHeight: 1.55,
    }),
  );

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: hero ----------

export type HeroData = {
  title: string;
  subtitle?: string;
  cta?: string;
  accent?: string;
  background?: string;
  imageUrl?: string;
};

function hero(d: HeroData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];

  if (d.imageUrl) {
    objects.push(
      image(d.imageUrl, {
        x: 0,
        y: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        alt: d.title,
      }),
    );
    // Dark overlay for legibility
    objects.push(
      rect({
        x: 0,
        y: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        fill: "#000000",
        opacity: 0.45,
        cornerRadius: 0,
      } as Partial<RectElement> & { x: number; y: number; width: number; height: number }),
    );
  }

  const centerY = CANVAS_H / 2;
  const textColor = d.imageUrl ? "#ffffff" : pal.textPrimary;
  const subColor = d.imageUrl ? "#f0e6d6" : pal.textMuted;

  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: centerY - 80,
      width: CANVAS_W - MARGIN * 2,
      height: 120,
      fontSize: 100,
      fontStyle: "bold",
      align: "center",
      fill: textColor,
    }),
  );

  if (d.subtitle) {
    objects.push(
      text({
        text: d.subtitle,
        x: MARGIN,
        y: centerY + 50,
        width: CANVAS_W - MARGIN * 2,
        height: 44,
        fontSize: 36,
        fontStyle: "normal",
        align: "center",
        fill: subColor,
      }),
    );
  }

  if (d.cta) {
    const ctaW = 240;
    const ctaH = 56;
    const ctaX = (CANVAS_W - ctaW) / 2;
    const ctaY = centerY + 120;
    objects.push(
      rect({
        x: ctaX,
        y: ctaY,
        width: ctaW,
        height: ctaH,
        fill: pal.accent,
        cornerRadius: 28,
      }),
    );
    objects.push(
      text({
        text: d.cta,
        x: ctaX,
        y: ctaY + 14,
        width: ctaW,
        height: ctaH - 14,
        fontSize: 28,
        fontStyle: "bold",
        align: "center",
        fill: pal.accentInk,
      }),
    );
  }

  return { objects, background: d.background ?? (d.imageUrl ? "#000000" : pal.slideBg) };
}

// ---------- Template: comparison ----------

export type ComparisonData = {
  title: string;
  accent?: string;
  background?: string;
  left: { header: string; items: string[]; tone?: "good" | "bad" | "neutral" };
  right: { header: string; items: string[]; tone?: "good" | "bad" | "neutral" };
};

function comparison(d: ComparisonData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];

  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: 56,
      width: CANVAS_W - MARGIN * 2,
      height: 64,
      fontSize: 60,
      fontStyle: "bold",
      align: "center",
      fill: pal.textPrimary,
    }),
  );

  const toneFill = (t?: string): string => {
    if (t === "good") return "#e9f6ec";
    if (t === "bad") return "#fbeceb";
    return "#ffffff";
  };
  const toneStroke = (t?: string): string => {
    if (t === "good") return "#8cc79a";
    if (t === "bad") return "#d99a94";
    return pal.cardStroke;
  };
  const toneHeaderFill = (t?: string): string => {
    if (t === "good") return "#1f7a3a";
    if (t === "bad") return "#a8342a";
    return pal.textPrimary;
  };

  const cardsTop = 160;
  const cardH = CANVAS_H - cardsTop - MARGIN;
  const colW = (CANVAS_W - MARGIN * 2 - GUTTER) / 2;

  for (let i = 0; i < 2; i++) {
    const col = i === 0 ? d.left : d.right;
    const cx = MARGIN + i * (colW + GUTTER);
    const pad = 24;

    objects.push(
      rect({
        x: cx,
        y: cardsTop,
        width: colW,
        height: cardH,
        fill: toneFill(col.tone),
        stroke: toneStroke(col.tone),
        strokeWidth: 2,
        cornerRadius: 16,
      }),
    );

    objects.push(
      text({
        text: col.header,
        x: cx + pad,
        y: cardsTop + pad,
        width: colW - pad * 2,
        height: 48,
        fontSize: 40,
        fontStyle: "bold",
        align: "left",
        fill: toneHeaderFill(col.tone),
      }),
    );

    const bodyY = cardsTop + pad + 48 + 16;
    objects.push(
      text({
        text: col.items.map((it) => `•  ${it}`).join("\n"),
        x: cx + pad,
        y: bodyY,
        width: colW - pad * 2,
        height: cardH - (bodyY - cardsTop) - pad,
        fontSize: 32,
        fontStyle: "normal",
        align: "left",
        fill: pal.textPrimary,
        lineHeight: 1.6,
      }),
    );
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: image-text-split ----------

export type ImageTextSplitData = {
  title: string;
  body: string;
  imageUrl: string;
  imageSide?: "left" | "right";
  accent?: string;
  background?: string;
  caption?: string;
};

function imageTextSplit(d: ImageTextSplitData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];
  const imgW = 560;
  const imgH = CANVAS_H - MARGIN * 2;
  const side = d.imageSide ?? "left";
  const imgX = side === "left" ? MARGIN : CANVAS_W - MARGIN - imgW;
  const textX = side === "left" ? MARGIN + imgW + 40 : MARGIN;
  const textW = CANVAS_W - MARGIN - (side === "left" ? imgX + imgW + 40 : MARGIN + imgW + 40);

  // Image with rounded frame shadow (accent border strip behind)
  objects.push(
    rect({
      x: imgX - 8,
      y: MARGIN - 8 + 8,
      width: imgW + 16,
      height: imgH + 16,
      fill: pal.accent,
      cornerRadius: 20,
    }),
  );
  objects.push(image(d.imageUrl, { x: imgX, y: MARGIN, width: imgW, height: imgH, alt: d.title }));

  // Title
  objects.push(
    text({
      text: d.title,
      x: textX,
      y: MARGIN + 40,
      width: textW,
      height: 120,
      fontSize: 64,
      fontStyle: "bold",
      align: "left",
      fill: pal.textPrimary,
      lineHeight: 1.2,
    }),
  );
  // Accent underline
  objects.push(
    rect({
      x: textX,
      y: MARGIN + 40 + 120 + 4,
      width: 72,
      height: 5,
      fill: pal.accent,
      cornerRadius: 3,
    }),
  );

  // Body
  objects.push(
    text({
      text: d.body,
      x: textX,
      y: MARGIN + 40 + 120 + 4 + 5 + 28,
      width: textW,
      height: 340,
      fontSize: 32,
      align: "left",
      fill: pal.textPrimary,
      lineHeight: 1.6,
    }),
  );

  if (d.caption) {
    objects.push(
      text({
        text: d.caption,
        x: textX,
        y: CANVAS_H - MARGIN - 40,
        width: textW,
        height: 32,
        fontSize: 24,
        fontStyle: "italic",
        align: "left",
        fill: pal.textMuted,
      }),
    );
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: stat-grid ----------

export type StatGridData = {
  title: string;
  subtitle?: string;
  accent?: string;
  background?: string;
  stats: Array<{ value: string; label: string }>; // 2, 3, or 4
};

function statGrid(d: StatGridData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];
  const stats = d.stats.slice(0, 4);

  // Title
  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: 56,
      width: CANVAS_W - MARGIN * 2,
      height: 60,
      fontSize: 60,
      fontStyle: "bold",
      align: "center",
      fill: pal.textPrimary,
    }),
  );
  if (d.subtitle) {
    objects.push(
      text({
        text: d.subtitle,
        x: MARGIN,
        y: 56 + 60 + 6,
        width: CANVAS_W - MARGIN * 2,
        height: 32,
        fontSize: 32,
        fontStyle: "italic",
        align: "center",
        fill: pal.textMuted,
      }),
    );
  }

  const gridTop = d.subtitle ? 220 : 190;
  const gridH = CANVAS_H - gridTop - MARGIN;
  const n = stats.length;
  // Use a single row if 2 or 3, 2x2 grid if 4.
  const cols = n === 4 ? 2 : n;
  const rows = n === 4 ? 2 : 1;
  const cellW = (CANVAS_W - MARGIN * 2 - GUTTER * (cols - 1)) / cols;
  const cellH = (gridH - GUTTER * (rows - 1)) / rows;

  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = MARGIN + c * (cellW + GUTTER);
    const cy = gridTop + r * (cellH + GUTTER);
    objects.push(
      rect({
        x: cx,
        y: cy,
        width: cellW,
        height: cellH,
        fill: pal.cardFill,
        stroke: pal.cardStroke,
        strokeWidth: 1,
        cornerRadius: 18,
      }),
    );
    // Accent top strip
    objects.push(
      rect({
        x: cx,
        y: cy,
        width: cellW,
        height: 6,
        fill: pal.accent,
        cornerRadius: 3,
      }),
    );
    objects.push(
      text({
        text: stats[i].value,
        x: cx,
        y: cy + cellH / 2 - 60,
        width: cellW,
        height: 80,
        fontSize: 90,
        fontStyle: "bold",
        align: "center",
        fill: pal.textPrimary,
        lineHeight: 1.1,
      }),
    );
    objects.push(
      text({
        text: stats[i].label,
        x: cx + 16,
        y: cy + cellH / 2 + 36,
        width: cellW - 32,
        height: cellH / 2 - 32,
        fontSize: 28,
        align: "center",
        fill: pal.textMuted,
        lineHeight: 1.4,
      }),
    );
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: quote ----------

export type QuoteData = {
  quote: string;
  attribution?: string;
  accent?: string;
  background?: string;
};

function quote(d: QuoteData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];

  // Giant left quote mark
  objects.push(
    text({
      text: "\u201C",
      x: MARGIN,
      y: 40,
      width: 160,
      height: 180,
      fontSize: 260,
      fontStyle: "bold",
      align: "left",
      fill: pal.accent,
      lineHeight: 1,
    }),
  );

  // Quote body centered block
  objects.push(
    text({
      text: d.quote,
      x: MARGIN + 40,
      y: 200,
      width: CANVAS_W - MARGIN * 2 - 80,
      height: 300,
      fontSize: 48,
      fontStyle: "italic",
      align: "center",
      fill: pal.textPrimary,
      lineHeight: 1.4,
    }),
  );

  // Accent bar
  objects.push(
    rect({
      x: CANVAS_W / 2 - 40,
      y: 540,
      width: 80,
      height: 4,
      fill: pal.accent,
      cornerRadius: 2,
    }),
  );

  if (d.attribution) {
    objects.push(
      text({
        text: `— ${d.attribution}`,
        x: MARGIN,
        y: 564,
        width: CANVAS_W - MARGIN * 2,
        height: 40,
        fontSize: 20,
        align: "center",
        fill: pal.textMuted,
      }),
    );
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Template: timeline ----------

export type TimelineData = {
  title: string;
  accent?: string;
  background?: string;
  steps: Array<{ label: string; description?: string }>; // 3-5
};

function timeline(d: TimelineData): TemplateResult {
  const pal = palette(d.accent);
  const objects: EngineElement[] = [];
  const steps = d.steps.slice(0, 5);
  const n = steps.length;

  // Title
  objects.push(
    text({
      text: d.title,
      x: MARGIN,
      y: 64,
      width: CANVAS_W - MARGIN * 2,
      height: 60,
      fontSize: 60,
      fontStyle: "bold",
      align: "center",
      fill: pal.textPrimary,
    }),
  );

  // Horizontal track
  const trackY = CANVAS_H / 2 + 10;
  const trackLeft = MARGIN + 40;
  const trackRight = CANVAS_W - MARGIN - 40;
  objects.push(
    rect({
      x: trackLeft,
      y: trackY - 2,
      width: trackRight - trackLeft,
      height: 4,
      fill: pal.accent,
      cornerRadius: 2,
    }),
  );

  // Dots + labels
  const dotR = 18;
  for (let i = 0; i < n; i++) {
    const cx =
      n === 1 ? (trackLeft + trackRight) / 2 : trackLeft + (i * (trackRight - trackLeft)) / (n - 1);
    // Outer ring
    objects.push(
      rect({
        x: cx - dotR,
        y: trackY - dotR,
        width: dotR * 2,
        height: dotR * 2,
        fill: pal.accent,
      }),
    );
    // Inner white circle
    objects.push(
      rect({
        x: cx - 8,
        y: trackY - 8,
        width: 16,
        height: 16,
        fill: "#ffffff",
      }),
    );
    // Number above
    objects.push(
      text({
        text: String(i + 1),
        x: cx - 60,
        y: trackY - dotR - 60,
        width: 120,
        height: 40,
        fontSize: 32,
        fontStyle: "bold",
        align: "center",
        fill: pal.accent,
      }),
    );
    // Label below
    objects.push(
      text({
        text: steps[i].label,
        x: cx - 120,
        y: trackY + dotR + 16,
        width: 240,
        height: 36,
        fontSize: 28,
        fontStyle: "bold",
        align: "center",
        fill: pal.textPrimary,
      }),
    );
    if (steps[i].description) {
      objects.push(
        text({
          text: steps[i].description as string,
          x: cx - 130,
          y: trackY + dotR + 16 + 36 + 4,
          width: 260,
          height: 100,
          fontSize: 22,
          align: "center",
          fill: pal.textMuted,
          lineHeight: 1.45,
        }),
      );
    }
  }

  return { objects, background: d.background ?? pal.slideBg };
}

// ---------- Registry ----------

export type TemplateName =
  | "three-column-cards"
  | "title-bullets"
  | "hero"
  | "comparison"
  | "image-text-split"
  | "stat-grid"
  | "quote"
  | "timeline";

// TemplateResult is defined at the top of the file

export type TemplatePayload =
  | { template: "three-column-cards"; data: ThreeColumnCardsData }
  | { template: "title-bullets"; data: TitleBulletsData }
  | { template: "hero"; data: HeroData }
  | { template: "comparison"; data: ComparisonData }
  | { template: "image-text-split"; data: ImageTextSplitData }
  | { template: "stat-grid"; data: StatGridData }
  | { template: "quote"; data: QuoteData }
  | { template: "timeline"; data: TimelineData };

export function runTemplate(payload: TemplatePayload): TemplateResult | null {
  switch (payload.template) {
    case "three-column-cards":
      return threeColumnCards(payload.data);
    case "title-bullets":
      return titleBullets(payload.data);
    case "hero":
      return hero(payload.data);
    case "comparison":
      return comparison(payload.data);
    case "image-text-split":
      return imageTextSplit(payload.data);
    case "stat-grid":
      return statGrid(payload.data);
    case "quote":
      return quote(payload.data);
    case "timeline":
      return timeline(payload.data);
    default:
      return null;
  }
}

// Short manifest we advertise to the LLM in the system prompt.
export const TEMPLATE_MANIFEST = {
  "three-column-cards": {
    description:
      "Title bar + optional centered subtitle + 1-3 equal-width cards, each with icon, header, and either paragraph or bullet-list body. Use for overview/summary slides like feature grids, tri-fold explainers.",
    required: ["title", "columns"],
    sample: {
      title: "น้ำเต้าหู้",
      subtitle: "เครื่องดื่มเพื่อสุขภาพจากถั่วเหลือง",
      columns: [
        {
          icon: "🥛",
          header: "คืออะไร?",
          body: { kind: "paragraph", text: "น้ำเต้าหู้คือ..." },
        },
        {
          icon: "💪",
          header: "ประโยชน์",
          body: { kind: "list", items: ["โปรตีนสูง", "ลดคอเลสเตอรอล"] },
        },
      ],
    },
  },
  "title-bullets": {
    description:
      "Single big title with an accent underline and a vertical bullet list beneath. Use for agenda, key points, roadmap items.",
    required: ["title", "bullets"],
    sample: {
      title: "Roadmap Q4",
      subtitle: "Three milestones to ship",
      bullets: ["Ship beta", "Onboard 10 clients", "Publish case studies"],
    },
  },
  hero: {
    description:
      "Centered massive title with optional subtitle and pill-shaped CTA, optional full-bleed background image with dark overlay. Use for opening slides or section dividers.",
    required: ["title"],
    sample: { title: "Welcome", subtitle: "A new way to brief", cta: "Let's go" },
  },
  comparison: {
    description:
      "Title on top + two side-by-side cards (left vs right). Each card has tone: 'good' | 'bad' | 'neutral' that tints the fill/border/header. Use for pros-vs-cons, before-vs-after.",
    required: ["title", "left", "right"],
    sample: {
      title: "Before vs After",
      left: { header: "Before", tone: "bad", items: ["Slow", "Manual"] },
      right: { header: "After", tone: "good", items: ["Fast", "Automated"] },
    },
  },
  "image-text-split": {
    description:
      "Hero photo on one side (560px wide) with accent-bordered frame, title + body copy + optional caption on the other. Use for feature explainers, product intros, any slide that benefits from a single strong image. `imageUrl` is REQUIRED — obtain it via search_image first.",
    required: ["title", "body", "imageUrl"],
    sample: {
      title: "วัฒนธรรมไทย",
      body: "ดินแดนแห่งรอยยิ้มและวัฒนธรรมที่มีรากฐานจากพุทธศาสนามากว่าพันปี ประเพณีงดงามสืบทอดจากรุ่นสู่รุ่น",
      imageUrl: "https://images.unsplash.com/photo-...",
      imageSide: "left",
      caption: "วัดพระแก้ว กรุงเทพฯ",
    },
  },
  "stat-grid": {
    description:
      "Title + 2, 3, or 4 big-number stat cards (auto 1-row or 2x2 grid). Each card shows a huge value and a short label. Use for metrics, KPI, impact numbers.",
    required: ["title", "stats"],
    sample: {
      title: "ผลกระทบของโครงการ",
      subtitle: "ปี 2567",
      stats: [
        { value: "12M+", label: "ผู้ใช้งาน" },
        { value: "98%", label: "ความพึงพอใจ" },
        { value: "35", label: "ประเทศ" },
        { value: "4.9★", label: "คะแนนเฉลี่ย" },
      ],
    },
  },
  quote: {
    description:
      "Giant decorative quote mark + centered italic quote + accent divider + attribution. Use for testimonials, famous sayings, section pauses.",
    required: ["quote"],
    sample: {
      quote: "การออกแบบที่ดีคือการแก้ปัญหาให้หายไป ไม่ใช่ให้สวยขึ้น",
      attribution: "Dieter Rams",
    },
  },
  timeline: {
    description:
      "Title + horizontal track with 3-5 numbered dots, each with label and optional description. Use for roadmap, history, process steps, journey.",
    required: ["title", "steps"],
    sample: {
      title: "Roadmap 2568",
      steps: [
        { label: "วิจัย", description: "สัมภาษณ์ผู้ใช้ 30 คน" },
        { label: "ต้นแบบ", description: "สร้าง MVP" },
        { label: "เปิดตัว", description: "ปล่อย beta Q2" },
        { label: "ขยาย", description: "เพิ่มฟีเจอร์และตลาด" },
      ],
    },
  },
} as const;
