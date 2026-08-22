import type { ImageElement } from "../engine/types";
import {
  createMagicWandMask,
  createQuickSelectionMask,
  magicWandMaskToDataUrl,
  type RasterPixelData,
  scaledRasterSize,
} from "./magicWand";
import { normalizeImagePoint, type RasterSelectionShape } from "./selection";
import { runMagicWandWorker } from "./selectionWorkerClient";

export type ImageLocalPoint = [number, number];
export type RasterWorldPoint = { x: number; y: number };
export type RasterSelectionToolShape = "rect" | "ellipse" | "lasso" | "polygon";

export function worldToImageLocal(point: RasterWorldPoint, image: ImageElement): ImageLocalPoint {
  const cx = image.x + image.width / 2;
  const cy = image.y + image.height / 2;
  const dx = point.x - cx;
  const dy = point.y - cy;
  const cos = Math.cos(image.angle);
  const sin = Math.sin(image.angle);
  return [dx * cos + dy * sin + image.width / 2, -dx * sin + dy * cos + image.height / 2];
}

export function rasterToolToShape(tool: string): RasterSelectionToolShape {
  switch (tool) {
    case "rasterEllipse":
      return "ellipse";
    case "rasterLasso":
      return "lasso";
    case "rasterPolygonLasso":
      return "polygon";
    default:
      return "rect";
  }
}

export function selectionShapeFromPoints(
  kind: RasterSelectionToolShape,
  points: ImageLocalPoint[],
  width: number,
  height: number,
): RasterSelectionShape {
  const start = points[0] ?? [0, 0];
  const end = points.at(-1) ?? start;
  if (kind === "rect" || kind === "ellipse") {
    const x = Math.min(start[0], end[0]);
    const y = Math.min(start[1], end[1]);
    return {
      kind,
      x: x / Math.max(1, width),
      y: y / Math.max(1, height),
      width: Math.abs(end[0] - start[0]) / Math.max(1, width),
      height: Math.abs(end[1] - start[1]) / Math.max(1, height),
    };
  }

  return {
    kind,
    points: points.map((point) => normalizeImagePoint(point, width, height)),
  };
}

export function createRasterSelectionSample(
  image: ImageElement,
  images: Map<string, HTMLImageElement>,
): RasterPixelData | null {
  const source = images.get(image.fileId);
  if (!source?.complete || !source.naturalWidth || !source.naturalHeight) return null;

  const crop = image.crop ?? {
    x: 0,
    y: 0,
    width: source.naturalWidth,
    height: source.naturalHeight,
  };
  const cropX = Math.max(0, Math.min(source.naturalWidth - 1, crop.x));
  const cropY = Math.max(0, Math.min(source.naturalHeight - 1, crop.y));
  const cropWidth = Math.max(1, Math.min(source.naturalWidth - cropX, crop.width));
  const cropHeight = Math.max(1, Math.min(source.naturalHeight - cropY, crop.height));
  const size = scaledRasterSize(cropWidth, cropHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  try {
    context.drawImage(source, cropX, cropY, cropWidth, cropHeight, 0, 0, size.width, size.height);
    return context.getImageData(0, 0, size.width, size.height);
  } catch {
    // A cross-origin image without CORS headers cannot be sampled safely.
    return null;
  }
}

export function createMagicWandSelectionShape(
  image: ImageElement,
  local: ImageLocalPoint,
  tolerance: number,
  images: Map<string, HTMLImageElement>,
): RasterSelectionShape | null {
  const pixels = createRasterSelectionSample(image, images);
  if (!pixels) return null;
  const seedX = (local[0] / Math.max(1, image.width)) * pixels.width;
  const seedY = (local[1] / Math.max(1, image.height)) * pixels.height;
  const mask = createMagicWandMask(pixels, seedX, seedY, tolerance);
  return { kind: "bitmap", dataUrl: magicWandMaskToDataUrl(mask, pixels.width, pixels.height) };
}

export async function createMagicWandSelectionShapeAsync(
  image: ImageElement,
  local: ImageLocalPoint,
  tolerance: number,
  images: Map<string, HTMLImageElement>,
): Promise<RasterSelectionShape | null> {
  const pixels = createRasterSelectionSample(image, images);
  if (!pixels) return null;
  const seedX = (local[0] / Math.max(1, image.width)) * pixels.width;
  const seedY = (local[1] / Math.max(1, image.height)) * pixels.height;
  try {
    const mask = await runMagicWandWorker(pixels, seedX, seedY, tolerance);
    return { kind: "bitmap", dataUrl: magicWandMaskToDataUrl(mask, pixels.width, pixels.height) };
  } catch {
    return createMagicWandSelectionShape(image, local, tolerance, images);
  }
}

export function quickSelectionMaskForPoint(
  imageData: RasterPixelData,
  image: ImageElement,
  local: ImageLocalPoint,
  brushSize: number,
  tolerance: number,
): Uint8Array {
  const seedX = (local[0] / Math.max(1, image.width)) * imageData.width;
  const seedY = (local[1] / Math.max(1, image.height)) * imageData.height;
  const sampleScaleX = imageData.width / Math.max(1, image.width);
  const sampleScaleY = imageData.height / Math.max(1, image.height);
  return createQuickSelectionMask(
    imageData,
    seedX,
    seedY,
    (Math.max(1, brushSize) * sampleScaleX) / 2,
    (Math.max(1, brushSize) * sampleScaleY) / 2,
    tolerance,
  );
}
