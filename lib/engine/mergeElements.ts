import { renderElement } from "../renderer/canvas";
import { unionBBox } from "./bounds";
import { createImage } from "./factory";
import { getCached, getImageCache, loadDataURL } from "./imageCache";
import type { EngineSlide, ImageElement } from "./types";

/**
 * Merges two or more selected elements (where at least 2 are images) into a single
 * transparent PNG ImageElement, preserving exact positions, layering, transforms,
 * and alpha channel transparency.
 */
export async function mergeSelectedImages(
  slide: EngineSlide,
  ids: string[],
): Promise<ImageElement | null> {
  if (typeof document === "undefined") return null;

  const targets = slide.elements
    .filter((el) => ids.includes(el.id) && !el.isDeleted)
    .sort((a, b) => a.z - b.z);

  if (targets.length < 2) return null;

  const bounds = unionBBox(targets);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;

  // Ensure all image elements are ready in imageCache
  const images = getImageCache();
  for (const el of targets) {
    if (el.type === "image" && !images.get(el.fileId)) {
      const cached = getCached(el.fileId);
      if (cached?.dataURL) {
        try {
          await loadDataURL(cached.dataURL, el.fileId);
        } catch {
          // continue with available imagery
        }
      }
    }
  }

  // Calculate resolution scale for crisp rendering (default 2x for sharp shapes & text)
  let maxScale = 2;
  for (const el of targets) {
    if (el.type === "image") {
      const sx = (el.naturalWidth || el.width) / Math.max(1, el.width);
      const sy = (el.naturalHeight || el.height) / Math.max(1, el.height);
      maxScale = Math.max(maxScale, sx, sy);
    }
  }
  const scale = Math.min(
    Math.max(1, maxScale),
    3,
    4096 / Math.max(1, bounds.width),
    4096 / Math.max(1, bounds.height),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bounds.width * scale));
  canvas.height = Math.max(1, Math.round(bounds.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Keep background transparent (RGBA: 0, 0, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);

  for (const el of targets) {
    renderElement(el, {
      ctx,
      images: getImageCache(),
      deferRasterJobs: false,
    });
  }

  ctx.restore();

  // Export to 32-bit PNG preserving full alpha channel transparency
  const dataUrl = canvas.toDataURL("image/png");
  const cached = await loadDataURL(dataUrl);

  return createImage({
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    fileId: cached.fileId,
    naturalWidth: cached.width,
    naturalHeight: cached.height,
    name: "Merged Image",
    sourceName: "merged-image.png",
  });
}

export const mergeSelectedElements = mergeSelectedImages;
