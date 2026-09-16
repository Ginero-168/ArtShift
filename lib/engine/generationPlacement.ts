import type { CanvasViewportSnapshot } from "./canvasViewport";
import { PROCESSING_PREVIEW_GAP } from "./processingPreview";

export type WorldBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getVisibleWorldBounds(
  viewport: CanvasViewportSnapshot,
): WorldBounds {
  const scale = Math.max(0.0001, viewport.scale);
  const left = Math.max(0, (0 - viewport.tx) / scale);
  const top = Math.max(0, (0 - viewport.ty) / scale);
  const right = Math.min(
    viewport.slideWidth,
    (viewport.width - viewport.tx) / scale,
  );
  const bottom = Math.min(
    viewport.slideHeight,
    (viewport.height - viewport.ty) / scale,
  );
  if (right <= left || bottom <= top) {
    return {
      x: viewport.slideWidth / 2,
      y: viewport.slideHeight / 2,
      width: 0,
      height: 0,
    };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function getGenerationPreviewBounds(
  viewport: CanvasViewportSnapshot,
  output: { width: number; height: number },
): WorldBounds {
  const scale = Math.max(0.0001, viewport.scale);
  // Size from the screen frustum in world units (stable under pan).
  // Visible intersection shrinks to ~0 when panned off-slide and must not drive size.
  const screenWorldWidth = viewport.width / scale;
  const screenWorldHeight = viewport.height / scale;
  const visible = getVisibleWorldBounds(viewport);
  const maxWidth = Math.min(viewport.slideWidth * 0.5, screenWorldWidth * 0.72);
  const maxHeight = Math.min(
    viewport.slideHeight * 0.5,
    screenWorldHeight * 0.72,
  );
  const ratio = Math.min(
    maxWidth / Math.max(1, output.width),
    maxHeight / Math.max(1, output.height),
  );
  const width = Math.max(1, Math.round(output.width * Math.max(0, ratio)));
  const height = Math.max(1, Math.round(output.height * Math.max(0, ratio)));
  const anchorX =
    visible.width > 0 ? visible.x + visible.width / 2 : viewport.slideWidth / 2;
  const anchorY =
    visible.height > 0
      ? visible.y + visible.height / 2
      : viewport.slideHeight / 2;
  const x = clamp(
    anchorX - width / 2,
    0,
    Math.max(0, viewport.slideWidth - width),
  );
  const y = clamp(
    anchorY - height / 2,
    0,
    Math.max(0, viewport.slideHeight - height),
  );
  return {
    x,
    y,
    width: Math.min(width, viewport.slideWidth),
    height: Math.min(height, viewport.slideHeight),
  };
}

/**
 * Place a generate preview beside a source image — same pattern as remove-bg /
 * vectorize / upscale preloads (right of source, matching footprint + output aspect).
 */
export function getGenerationPreviewBesideSource(
  source: WorldBounds,
  output: { width: number; height: number },
): WorldBounds {
  const outRatio = Math.max(0.01, output.width / Math.max(1, output.height));
  const sourceArea = Math.max(1, source.width * source.height);
  // Start from source height (sits flush beside friends), then normalize area.
  let height = Math.max(48, source.height);
  let width = Math.max(48, Math.round(height * outRatio));
  const scale = Math.sqrt(sourceArea / Math.max(1, width * height));
  width = Math.max(48, Math.round(width * scale));
  height = Math.max(48, Math.round(height * scale));
  return {
    x: source.x + source.width + PROCESSING_PREVIEW_GAP,
    y: source.y,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
