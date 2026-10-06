import { unionBBox } from "./bounds";
import type { EngineDoc, EngineElement, EngineSlide, SlideKind } from "./types";

/** The only board. Older artwork pages load as this same frameless canvas. */
export const SLIDE_KIND_INFINITY_CANVAS: SlideKind = "infinityCanvas";
/** @deprecated Artwork pages are folded into the infinite canvas on load. */
export const SLIDE_KIND_ARTWORK: SlideKind = "artwork";

export const INFINITY_CANVAS_LABEL = "Infinity Canvas";
export const INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE = "No canvas to export.";

const BOARD_GAP = 160;

export function normalizeSlideKind(_value: unknown): SlideKind {
  return SLIDE_KIND_INFINITY_CANVAS;
}

export function isInfinityCanvasSlide(
  _slide: Pick<EngineSlide, "kind"> | { kind?: unknown } | null | undefined,
): boolean {
  return true;
}

export function isExportableSlide(
  _slide: Pick<EngineSlide, "kind"> | { kind?: unknown } | null | undefined,
): boolean {
  return true;
}

export function mergeBoards(slides: readonly EngineSlide[]): EngineSlide | null {
  const [first, ...rest] = slides;
  if (!first) return null;
  const elements = [...first.elements];
  const layers = first.layers.map((layer) => ({ ...layer, objectIds: [...layer.objectIds] }));
  const seenLayers = new Set(layers.map((layer) => layer.id));
  for (const slide of rest) {
    const dx = nextBoardOffset(elements);
    for (const element of slide.elements) {
      elements.push(dx === 0 ? element : { ...element, x: element.x + dx });
    }
    for (const layer of slide.layers) {
      let id = layer.id;
      if (seenLayers.has(id)) id = `${slide.id}:${id}`;
      seenLayers.add(id);
      layers.push({ ...layer, id, objectIds: [...layer.objectIds] });
    }
  }
  return {
    ...first,
    kind: SLIDE_KIND_INFINITY_CANVAS,
    elements,
    layers,
  };
}

export function collapseToInfinityCanvas(doc: EngineDoc): EngineDoc {
  const board = mergeBoards(doc.slides);
  if (!board) return doc;
  return { ...doc, slides: [board] };
}

/** Grow the page so artwork that sits outside the old frame is still exported. */
export function frameBoard(slide: EngineSlide): EngineSlide {
  const live = slide.elements.filter((element) => !element.isDeleted);
  const box = unionBBox(live);
  if (!box || box.width <= 0 || box.height <= 0) return slide;
  const x0 = Math.min(0, box.x);
  const y0 = Math.min(0, box.y);
  const width = Math.max(slide.width, box.x + box.width) - x0;
  const height = Math.max(slide.height, box.y + box.height) - y0;
  if (x0 === 0 && y0 === 0 && width === slide.width && height === slide.height) return slide;
  return {
    ...slide,
    width,
    height,
    elements: slide.elements.map((element) =>
      x0 === 0 && y0 === 0 ? element : { ...element, x: element.x - x0, y: element.y - y0 },
    ),
  };
}

export function getExportableSlides(doc: Pick<EngineDoc, "slides">): EngineSlide[] {
  const board = mergeBoards(doc.slides);
  return board ? [frameBoard(board)] : [];
}

export function withExportableSlides(doc: EngineDoc): EngineDoc {
  return { ...doc, slides: getExportableSlides(doc) };
}

export function assertExportableSlide(_slide: EngineSlide): void {}

export function requireExportableSlides(doc: EngineDoc): EngineSlide[] {
  const slides = getExportableSlides(doc);
  if (!slides.length) throw new Error(INFINITY_CANVAS_EMPTY_EXPORT_MESSAGE);
  return slides;
}

function nextBoardOffset(elements: readonly EngineElement[]): number {
  let right = 0;
  let any = false;
  for (const element of elements) {
    if (element.isDeleted) continue;
    any = true;
    right = Math.max(right, element.x + element.width);
  }
  return any ? right + BOARD_GAP : 0;
}
