import type { EngineDoc, EngineSlide, SlideKind } from "./types";

/** Default promotional Artwork with a fixed page frame. */
export const SLIDE_KIND_ARTWORK: SlideKind = "artwork";
/** Frameless infinite artboard with the same editor tools; never exported. */
export const SLIDE_KIND_INFINITY_CANVAS: SlideKind = "infinityCanvas";

export const INFINITY_CANVAS_LABEL = "Infinity Canvas";
export const INFINITY_CANVAS_EXPORT_NOTE =
  "Infinity Canvas slides are not included in PNG, PDF, PPTX, SVG, or Present.";
export const INFINITY_CANVAS_SKIPPED_MESSAGE = "Infinity Canvas is not included in export.";
export const INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE =
  "No exportable slides. Infinity Canvas slides are excluded from export.";

/**
 * Schema-safe kind. Missing / unknown → artwork.
 * Abandoned Moodboard (`kind: "moodboard"`) documents load as Infinity Canvas
 * because that leftover already meant a frameless infinite artboard.
 */
export function normalizeSlideKind(value: unknown): SlideKind {
  if (value === SLIDE_KIND_INFINITY_CANVAS || value === "moodboard") {
    return SLIDE_KIND_INFINITY_CANVAS;
  }
  return SLIDE_KIND_ARTWORK;
}

export function isInfinityCanvasSlide(
  slide: Pick<EngineSlide, "kind"> | { kind?: unknown } | null | undefined,
): boolean {
  return normalizeSlideKind(slide?.kind) === SLIDE_KIND_INFINITY_CANVAS;
}

export function isExportableSlide(
  slide: Pick<EngineSlide, "kind"> | { kind?: unknown } | null | undefined,
): boolean {
  return !isInfinityCanvasSlide(slide);
}

export function getExportableSlides(doc: Pick<EngineDoc, "slides">): EngineSlide[] {
  return doc.slides.filter(isExportableSlide);
}

export function withExportableSlides(doc: EngineDoc): EngineDoc {
  return { ...doc, slides: getExportableSlides(doc) };
}

export function assertExportableSlide(slide: EngineSlide): void {
  if (isInfinityCanvasSlide(slide)) {
    throw new Error(INFINITY_CANVAS_SKIPPED_MESSAGE);
  }
}

export function requireExportableSlides(doc: EngineDoc): EngineSlide[] {
  const slides = getExportableSlides(doc);
  if (!slides.length) {
    throw new Error(INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE);
  }
  return slides;
}
