/**
 * Bake an ImageElement's visible pixel content into a PNG data URL.
 *
 * Uses the same renderer path as PPTX rasterization so crop, adjustments,
 * blur, geometric mask, rasterMask, and rasterEdits match the editor.
 * Placement (x/y/angle) is temporarily zeroed and restored.
 *
 * Phase 3: composite on OffscreenCanvas when available, then encode with
 * @jsquash/png (canvas toDataURL fallback). WebP shares `encodeImageData`
 * but bake stays PNG so revisions remain lossless by default.
 * Worker-thread `renderElement` is deferred (DOM images + Rough.js).
 * so fat rasterEdits dataUrls leave the document JSON. Old projects that still
 * carry overlays stay readable until the user Saves in Studio.
 */

import type { ImageElement } from "@/lib/engine/types";
import { type RenderCtx, renderElement } from "@/lib/renderer/canvas";
import { createBakeSurface, encodeImageDataToPngDataUrl } from "./encodeRevision";

export type BakedRasterRevision = {
  dataURL: string;
  width: number;
  height: number;
  encoder: "jsquash-png" | "canvas-png";
  offscreen: boolean;
};

/**
 * Bake canvas size. Save writes these as `naturalWidth` / `naturalHeight`.
 * They are pixel resolution (display × scale), not the placed Smart Object box.
 */
export function bakeRevisionPixelSize(
  element: Pick<ImageElement, "width" | "height">,
  scale = 2,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(element.width * scale)),
    height: Math.max(1, Math.round(element.height * scale)),
  };
}

export async function bakeImageElementRevision(
  element: ImageElement,
  images?: Map<string, HTMLImageElement>,
  scale = 2,
): Promise<BakedRasterRevision> {
  const { width, height } = bakeRevisionPixelSize(element, scale);
  const surface = createBakeSurface(width, height);
  const ctx = surface.ctx;

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

  const imageData = ctx.getImageData(0, 0, width, height);
  const encoded = await encodeImageDataToPngDataUrl(imageData);
  return {
    dataURL: encoded.dataURL,
    width,
    height,
    encoder: encoded.encoder,
    offscreen: surface.offscreen,
  };
}
