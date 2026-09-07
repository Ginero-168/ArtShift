export type AnchorRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PreviewViewport = {
  left?: number;
  top?: number;
  width: number;
  height: number;
};
export type PreviewPlacement = "top-start" | "bottom-start" | "left-start" | "right-start";

export type PlacedImagePreview = {
  left: number;
  top: number;
  width: number;
  height: number;
  placement: PreviewPlacement;
};

const SAFE_PADDING = 12;
const ANCHOR_GAP = 8;
export const IMAGE_REFERENCE_PREVIEW_MAX_SIZE = 75;

export function placeImagePreview(
  anchor: AnchorRect,
  _requested: { width: number; height: number },
  viewport: PreviewViewport,
): PlacedImagePreview {
  const originLeft = viewport.left ?? 0;
  const originTop = viewport.top ?? 0;
  const maxWidth = Math.max(
    1,
    Math.min(IMAGE_REFERENCE_PREVIEW_MAX_SIZE, viewport.width - SAFE_PADDING * 2),
  );
  const maxHeight = Math.max(
    1,
    Math.min(IMAGE_REFERENCE_PREVIEW_MAX_SIZE, viewport.height - SAFE_PADDING * 2),
  );
  const size = Math.max(1, Math.min(maxWidth, maxHeight));
  const width = size;
  const height = size;
  const left = clamp(
    anchor.left,
    originLeft + SAFE_PADDING,
    Math.max(originLeft + SAFE_PADDING, originLeft + viewport.width - SAFE_PADDING - width),
  );
  const topAbove = anchor.top - ANCHOR_GAP - height;
  if (topAbove >= originTop + SAFE_PADDING) {
    return { left, top: topAbove, width, height, placement: "top-start" };
  }

  const topBelow = anchor.bottom + ANCHOR_GAP;
  const clampedBelow = clamp(
    topBelow,
    originTop + SAFE_PADDING,
    Math.max(originTop + SAFE_PADDING, originTop + viewport.height - SAFE_PADDING - height),
  );
  return {
    left,
    top: clampedBelow,
    width,
    height,
    placement: "bottom-start",
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
