import type { CanvasViewportSnapshot } from "./canvasViewport";
import { PROCESSING_PREVIEW_GAP } from "./processingPreview";

export type WorldBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Full camera frustum in world space (not clipped to the slide/canvas). */
export function getVisibleWorldBounds(viewport: CanvasViewportSnapshot): WorldBounds {
  const scale = Math.max(0.0001, viewport.scale);
  return {
    x: (0 - viewport.tx) / scale,
    y: (0 - viewport.ty) / scale,
    width: viewport.width / scale,
    height: viewport.height / scale,
  };
}

export function getGenerationPreviewBounds(
  viewport: CanvasViewportSnapshot,
  output: { width: number; height: number },
): WorldBounds {
  const visible = getVisibleWorldBounds(viewport);
  // Fit to what's on screen — do not clamp into the slide rectangle.
  const maxWidth = Math.max(48, visible.width * 0.72);
  const maxHeight = Math.max(48, visible.height * 0.72);
  const ratio = Math.min(
    maxWidth / Math.max(1, output.width),
    maxHeight / Math.max(1, output.height),
  );
  const width = Math.max(1, Math.round(output.width * Math.max(0, ratio)));
  const height = Math.max(1, Math.round(output.height * Math.max(0, ratio)));
  const anchorX = visible.x + visible.width / 2;
  const anchorY = visible.y + visible.height / 2;
  return {
    x: anchorX - width / 2,
    y: anchorY - height / 2,
    width,
    height,
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
