/**
 * Bake an ImageElement's visible pixel content into a PNG data URL.
 *
 * Uses the same renderer path as PPTX rasterization so crop, adjustments,
 * blur, geometric mask, rasterMask, and rasterEdits match the editor.
 * Placement (x/y/angle) is temporarily zeroed and restored.
 */

import type { ImageElement } from "@/lib/engine/types";
import { type RenderCtx, renderElement } from "@/lib/renderer/canvas";

export type BakedRasterRevision = {
  dataURL: string;
  width: number;
  height: number;
};

export async function bakeImageElementRevision(
  element: ImageElement,
  images?: Map<string, HTMLImageElement>,
  scale = 2,
): Promise<BakedRasterRevision> {
  const width = Math.max(1, Math.round(element.width * scale));
  const height = Math.max(1, Math.round(element.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context for Raster Studio bake");

  ctx.scale(scale, scale);

  const origX = element.x;
  const origY = element.y;
  const origAngle = element.angle;
  const origOpacity = element.opacity;
  element.x = 0;
  element.y = 0;
  element.angle = 0;
  // Bake pixels at full opacity; object opacity stays on the placed Smart Object.
  element.opacity = 1;
  try {
    renderElement(element, { ctx, images } as RenderCtx);
  } finally {
    element.x = origX;
    element.y = origY;
    element.angle = origAngle;
    element.opacity = origOpacity;
  }

  const dataURL = canvas.toDataURL("image/png");
  return {
    dataURL,
    width,
    height,
  };
}
