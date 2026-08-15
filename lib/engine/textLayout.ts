import type { TextElement } from "./types";

const MIN_TEXT_PADDING = 6;
const FONT_PADDING_RATIO = 0.12;

type TextMetrics = Pick<TextElement, "fontSize" | "lineHeight" | "padding">;

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
