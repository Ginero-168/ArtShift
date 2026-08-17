import type { TextElement } from "./types";

const MIN_TEXT_PADDING = 6;
const FONT_PADDING_RATIO = 0.12;

type TextMetrics = Pick<TextElement, "fontSize" | "lineHeight" | "padding">;

export type RichTextSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
};

export type TextLine = {
  /** Markdown-lite source without the bullet prefix. */
  text: string;
  /** Draw a bullet on this line. Continuation lines retain the indent only. */
  bullet: boolean;
  bulletIndent: number;
};

export type TextMeasure = (text: string, style: Pick<RichTextSegment, "bold" | "italic">) => number;

export type TextLayout = {
  lines: TextLine[];
  padding: number;
  lineHeight: number;
  contentHeight: number;
  minimumHeight: number;
};

/**
 * Canvas text is cached into a bitmap with the exact element bounds. Keeping
 * a font-relative inset prevents italic overhangs and Thai marks from being
 * clipped by that bitmap even when a document requests zero padding.
 */
export function getTextSafePadding(fontSize: number, requestedPadding = 0): number {
  const fontInset = Math.ceil(Math.max(0, fontSize) * FONT_PADDING_RATIO);
  return Math.max(MIN_TEXT_PADDING, fontInset, Math.max(0, requestedPadding));
}

/** Clamp the preferred inset when an element has been resized extremely small. */
export function getTextRenderPadding(
  element: Pick<TextElement, "fontSize" | "padding" | "width" | "height">,
): number {
  const preferred = getTextSafePadding(element.fontSize, element.padding ?? 0);
  const available = Math.max(0, (Math.min(element.width, element.height) - 2) / 2);
  return Math.min(preferred, available);
}

export function getTextMinimumHeight(metrics: TextMetrics, lineCount = 1): number {
  const padding = getTextSafePadding(metrics.fontSize, metrics.padding ?? 0);
  return Math.max(1, lineCount) * metrics.fontSize * metrics.lineHeight + padding * 2;
}

/**
 * Canonical text layout used by the renderer, inspector and Block auto-grow.
 * Thai words are segmented with Intl.Segmenter when available. A token that is
 * wider than the box is split by grapheme, so unspaced copy can never silently
 * render beyond its bitmap bounds.
 */
export function layoutText(
  element: Pick<
    TextElement,
    "text" | "fontSize" | "fontFamily" | "fontStyle" | "lineHeight" | "padding" | "width" | "height"
  >,
  measure: TextMeasure = (text) => estimateTextWidth(text, element.fontSize),
): TextLayout {
  const padding = getTextSafePadding(element.fontSize, element.padding ?? 0);
  const availableWidth = Math.max(1, element.width - padding * 2);
  const lines = element.text
    .split("\n")
    .flatMap((rawLine) => wrapExplicitLine(rawLine, availableWidth, element.fontSize, measure));
  const lineHeight = element.fontSize * element.lineHeight;
  const contentHeight = Math.max(1, lines.length) * lineHeight;
  return {
    lines,
    padding,
    lineHeight,
    contentHeight,
    minimumHeight: contentHeight + padding * 2,
  };
}

export function measureTextElementHeight(
  element: Pick<
    TextElement,
    "text" | "fontSize" | "fontFamily" | "fontStyle" | "lineHeight" | "padding" | "width" | "height"
  >,
  measure?: TextMeasure,
): number {
  if (measure) return layoutText(element, measure).minimumHeight;
  const context = browserMeasureContext();
  if (!context) return layoutText(element).minimumHeight;
  return layoutText(element, createCanvasTextMeasure(context, element)).minimumHeight;
}

/** Reduce typography only when a fixed template box cannot safely contain it. */
export function fitTextElementToBox(element: TextElement, minimumFontSize = 8): TextElement {
  let next = { ...element, padding: getTextSafePadding(element.fontSize, element.padding ?? 0) };
  for (let attempt = 0; attempt < 24; attempt++) {
    const required = measureTextElementHeight(next);
    if (required <= next.height || next.fontSize <= minimumFontSize) return next;
    const ratio = Math.max(0.72, Math.min(0.96, next.height / required));
    const fontSize = Math.max(minimumFontSize, next.fontSize * ratio);
    next = {
      ...next,
      fontSize,
      padding: getTextSafePadding(fontSize, Math.min(next.padding ?? 0, fontSize * 0.35)),
    };
  }
  return next;
}

export function createCanvasTextMeasure(
  context: CanvasRenderingContext2D,
  element: Pick<TextElement, "fontSize" | "fontFamily" | "fontStyle">,
): TextMeasure {
  return (text, style) => {
    setCanvasTextFont(context, element, style.bold, style.italic);
    return context.measureText(text).width;
  };
}

export function setCanvasTextFont(
  context: CanvasRenderingContext2D,
  element: Pick<TextElement, "fontSize" | "fontFamily" | "fontStyle">,
  bold: boolean,
  italic: boolean,
) {
  const weight = bold || element.fontStyle.includes("bold") ? "bold" : "normal";
  const style = italic || element.fontStyle.includes("italic") ? "italic" : "normal";
  context.font = `${weight} ${style} ${element.fontSize}px ${element.fontFamily}`;
}

export function parseRichText(text: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  let i = 0;
  let bold = false;
  let italic = false;
  let current = "";

  function flush() {
    if (!current) return;
    segments.push({ text: current, bold, italic });
    current = "";
  }

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      flush();
      bold = !bold;
      i += 2;
    } else if (text[i] === "*") {
      flush();
      italic = !italic;
      i += 1;
    } else {
      current += text[i];
      i += 1;
    }
  }
  flush();
  if (!segments.length) segments.push({ text, bold: false, italic: false });
  return segments;
}

export function measureRichText(text: string, measure: TextMeasure): number {
  return parseRichText(text).reduce((width, segment) => width + measure(segment.text, segment), 0);
}

function wrapExplicitLine(
  rawLine: string,
  availableWidth: number,
  fontSize: number,
  measure: TextMeasure,
): TextLine[] {
  const hasBullet = rawLine.startsWith("- ") || rawLine.startsWith("• ");
  const content = hasBullet ? rawLine.slice(2) : rawLine;
  const bulletIndent = hasBullet ? fontSize * 0.8 : 0;
  const maxWidth = Math.max(1, availableWidth - bulletIndent);
  if (!content) return [{ text: "", bullet: hasBullet, bulletIndent }];

  const tokens = segmentWords(content);
  const wrapped: string[] = [];
  let current = "";

  for (const token of tokens) {
    const candidate = `${current}${token}`;
    if (measureRichText(candidate, measure) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) {
      wrapped.push(current.trimEnd());
      current = "";
    }

    const cleanToken = token.trimStart();
    if (measureRichText(cleanToken, measure) <= maxWidth) {
      current = cleanToken;
      continue;
    }

    const chunks = splitOversizedToken(cleanToken, maxWidth, measure);
    wrapped.push(...chunks.slice(0, -1));
    current = chunks.at(-1) ?? "";
  }

  if (current || !wrapped.length) wrapped.push(current.trimEnd());
  return wrapped.map((text, index) => ({
    text,
    bullet: hasBullet && index === 0,
    bulletIndent,
  }));
}

function splitOversizedToken(token: string, maxWidth: number, measure: TextMeasure): string[] {
  const graphemes = segmentGraphemes(token);
  const chunks: string[] = [];
  let current = "";
  for (const grapheme of graphemes) {
    const candidate = `${current}${grapheme}`;
    if (current && measureRichText(candidate, measure) > maxWidth) {
      chunks.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }
  if (current || !chunks.length) chunks.push(current);
  return chunks;
}

function segmentWords(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter("th", { granularity: "word" }).segment(text),
      (part) => part.segment,
    );
  }
  return text.split(/(\s+)/).filter(Boolean);
}

function segmentGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text),
      (part) => part.segment,
    );
  }
  return Array.from(text);
}

function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce(
    (width, character) => width + fontSize * (/\s/u.test(character) ? 0.32 : 0.58),
    0,
  );
}

let measurementCanvas: HTMLCanvasElement | null = null;

function browserMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  measurementCanvas ??= document.createElement("canvas");
  return measurementCanvas.getContext("2d");
}
