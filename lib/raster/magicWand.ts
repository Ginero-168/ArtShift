/**
 * Pixel flood-fill selection used by the Raster Magic Wand tool.
 *
 * The algorithm is deliberately independent from the canvas/editor so it can
 * be tested without a browser and kept out of React's render path.
 */

import { registerRasterSelectionMask } from "./selectionMask";

export const DEFAULT_MAGIC_WAND_TOLERANCE = 32;
export const MAX_MAGIC_WAND_PIXELS = 2_000_000;

export type RasterPixelData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type RasterAlgorithmOptions = {
  shouldCancel?: () => boolean;
  onProgress?: (progress: number) => void;
  yieldEvery?: number;
};

export class RasterAlgorithmCancelledError extends Error {
  constructor() {
    super("Raster algorithm cancelled.");
    this.name = "RasterAlgorithmCancelledError";
  }
}

/**
 * Select the contiguous region whose RGBA distance from the seed is within
 * tolerance. A four-neighbour flood fill matches Photoshop's contiguous mode.
 */
export function createMagicWandMask(
  imageData: RasterPixelData,
  seedX: number,
  seedY: number,
  tolerance: number,
): Uint8Array {
  const width = Math.max(0, Math.floor(imageData.width));
  const height = Math.max(0, Math.floor(imageData.height));
  const total = width * height;
  const mask = new Uint8Array(total);
  if (!total || imageData.data.length < total * 4) return mask;

  const x = clampInt(seedX, 0, width - 1);
  const y = clampInt(seedY, 0, height - 1);
  const seedOffset = (y * width + x) * 4;
  const seed = imageData.data;
  const sr = seed[seedOffset];
  const sg = seed[seedOffset + 1];
  const sb = seed[seedOffset + 2];
  const sa = seed[seedOffset + 3];
  const maxDistance = Math.max(0, Math.min(255, Number.isFinite(tolerance) ? tolerance : 0));
  const maxDistanceSquared = maxDistance * maxDistance;

  const matches = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const dr = seed[offset] - sr;
    const dg = seed[offset + 1] - sg;
    const db = seed[offset + 2] - sb;
    const da = seed[offset + 3] - sa;
    // Divide by two so the maximum RGBA distance maps naturally to 255.
    return (dr * dr + dg * dg + db * db + da * da) / 4 <= maxDistanceSquared;
  };

  const seedIndex = y * width + x;
  if (!matches(seedIndex)) return mask;

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIndex;
  visited[seedIndex] = 1;
  mask[seedIndex] = 1;

  while (head < tail) {
    const current = queue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);
    const neighbours = [
      currentX > 0 ? current - 1 : -1,
      currentX < width - 1 ? current + 1 : -1,
      currentY > 0 ? current - width : -1,
      currentY < height - 1 ? current + width : -1,
    ];

    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      if (!matches(neighbour)) continue;
      mask[neighbour] = 1;
      queue[tail++] = neighbour;
    }
  }

  return mask;
}

/**
 * Select a connected, color-similar region around a brush stamp.
 *
 * Unlike Magic Wand, Quick Selection limits the flood fill to the circular
 * brush footprint. Repeated stamps can therefore grow a selection naturally
 * while still respecting color boundaries.
 */
export function createQuickSelectionMask(
  imageData: RasterPixelData,
  seedX: number,
  seedY: number,
  radiusX: number,
  radiusY: number,
  tolerance: number,
): Uint8Array {
  const width = Math.max(0, Math.floor(imageData.width));
  const height = Math.max(0, Math.floor(imageData.height));
  const total = width * height;
  const mask = new Uint8Array(total);
  if (!total || imageData.data.length < total * 4) return mask;

  const x = clampInt(seedX, 0, width - 1);
  const y = clampInt(seedY, 0, height - 1);
  const safeRadiusX = Math.max(1, Number.isFinite(radiusX) ? radiusX : 1);
  const safeRadiusY = Math.max(1, Number.isFinite(radiusY) ? radiusY : 1);
  const maxDistance = Math.max(0, Math.min(255, Number.isFinite(tolerance) ? tolerance : 0));
  const maxDistanceSquared = maxDistance * maxDistance;
  const seedOffset = (y * width + x) * 4;
  const seed = imageData.data;
  const sr = seed[seedOffset];
  const sg = seed[seedOffset + 1];
  const sb = seed[seedOffset + 2];
  const sa = seed[seedOffset + 3];

  const isInsideBrush = (pixelIndex: number) => {
    const pixelX = pixelIndex % width;
    const pixelY = Math.floor(pixelIndex / width);
    const dx = (pixelX - x) / safeRadiusX;
    const dy = (pixelY - y) / safeRadiusY;
    return dx * dx + dy * dy <= 1;
  };
  const matches = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const dr = seed[offset] - sr;
    const dg = seed[offset + 1] - sg;
    const db = seed[offset + 2] - sb;
    const da = seed[offset + 3] - sa;
    return (dr * dr + dg * dg + db * db + da * da) / 4 <= maxDistanceSquared;
  };

  const seedIndex = y * width + x;
  if (!isInsideBrush(seedIndex) || !matches(seedIndex)) return mask;

  const visited = new Uint8Array(total);
  const queue: number[] = [seedIndex];
  let head = 0;
  visited[seedIndex] = 1;
  mask[seedIndex] = 1;

  while (head < queue.length) {
    const current = queue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);
    const neighbours = [
      currentX > 0 ? current - 1 : -1,
      currentX < width - 1 ? current + 1 : -1,
      currentY > 0 ? current - width : -1,
      currentY < height - 1 ? current + width : -1,
    ];

    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      if (!isInsideBrush(neighbour) || !matches(neighbour)) continue;
      mask[neighbour] = 1;
      queue.push(neighbour);
    }
  }

  return mask;
}

/**
 * Cooperative async variant used by the generic Worker protocol. Yielding to
 * the event loop lets a queued cancel message reach the Worker while a large
 * flood fill is still in progress.
 */
export async function createMagicWandMaskAsync(
  imageData: RasterPixelData,
  seedX: number,
  seedY: number,
  tolerance: number,
  options: RasterAlgorithmOptions = {},
): Promise<Uint8Array> {
  const width = Math.max(0, Math.floor(imageData.width));
  const height = Math.max(0, Math.floor(imageData.height));
  const total = width * height;
  const mask = new Uint8Array(total);
  if (!total || imageData.data.length < total * 4) return mask;

  const x = clampInt(seedX, 0, width - 1);
  const y = clampInt(seedY, 0, height - 1);
  const seedOffset = (y * width + x) * 4;
  const source = imageData.data;
  const sr = source[seedOffset];
  const sg = source[seedOffset + 1];
  const sb = source[seedOffset + 2];
  const sa = source[seedOffset + 3];
  const maxDistance = Math.max(0, Math.min(255, Number.isFinite(tolerance) ? tolerance : 0));
  const maxDistanceSquared = maxDistance * maxDistance;
  const matches = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const dr = source[offset] - sr;
    const dg = source[offset + 1] - sg;
    const db = source[offset + 2] - sb;
    const da = source[offset + 3] - sa;
    return (dr * dr + dg * dg + db * db + da * da) / 4 <= maxDistanceSquared;
  };

  const seedIndex = y * width + x;
  if (!matches(seedIndex)) return mask;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIndex;
  visited[seedIndex] = 1;
  mask[seedIndex] = 1;
  const yieldEvery = Math.max(256, options.yieldEvery ?? 8_192);

  while (head < tail) {
    if (options.shouldCancel?.()) throw new RasterAlgorithmCancelledError();
    const current = queue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);
    const neighbours = [
      currentX > 0 ? current - 1 : -1,
      currentX < width - 1 ? current + 1 : -1,
      currentY > 0 ? current - width : -1,
      currentY < height - 1 ? current + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      if (!matches(neighbour)) continue;
      mask[neighbour] = 1;
      queue[tail++] = neighbour;
    }
    if (head % yieldEvery === 0) {
      options.onProgress?.(head / Math.max(1, total));
      await yieldToEventLoop();
    }
  }
  options.onProgress?.(1);
  return mask;
}

export async function createQuickSelectionMaskAsync(
  imageData: RasterPixelData,
  seedX: number,
  seedY: number,
  radiusX: number,
  radiusY: number,
  tolerance: number,
  options: RasterAlgorithmOptions = {},
): Promise<Uint8Array> {
  const width = Math.max(0, Math.floor(imageData.width));
  const height = Math.max(0, Math.floor(imageData.height));
  const total = width * height;
  const mask = new Uint8Array(total);
  if (!total || imageData.data.length < total * 4) return mask;

  const x = clampInt(seedX, 0, width - 1);
  const y = clampInt(seedY, 0, height - 1);
  const safeRadiusX = Math.max(1, Number.isFinite(radiusX) ? radiusX : 1);
  const safeRadiusY = Math.max(1, Number.isFinite(radiusY) ? radiusY : 1);
  const maxDistance = Math.max(0, Math.min(255, Number.isFinite(tolerance) ? tolerance : 0));
  const maxDistanceSquared = maxDistance * maxDistance;
  const source = imageData.data;
  const seedOffset = (y * width + x) * 4;
  const sr = source[seedOffset];
  const sg = source[seedOffset + 1];
  const sb = source[seedOffset + 2];
  const sa = source[seedOffset + 3];
  const isInsideBrush = (pixelIndex: number) => {
    const pixelX = pixelIndex % width;
    const pixelY = Math.floor(pixelIndex / width);
    const dx = (pixelX - x) / safeRadiusX;
    const dy = (pixelY - y) / safeRadiusY;
    return dx * dx + dy * dy <= 1;
  };
  const matches = (pixelIndex: number) => {
    const offset = pixelIndex * 4;
    const dr = source[offset] - sr;
    const dg = source[offset + 1] - sg;
    const db = source[offset + 2] - sb;
    const da = source[offset + 3] - sa;
    return (dr * dr + dg * dg + db * db + da * da) / 4 <= maxDistanceSquared;
  };

  const seedIndex = y * width + x;
  if (!isInsideBrush(seedIndex) || !matches(seedIndex)) return mask;
  const visited = new Uint8Array(total);
  const queue: number[] = [seedIndex];
  let head = 0;
  visited[seedIndex] = 1;
  mask[seedIndex] = 1;
  const yieldEvery = Math.max(256, options.yieldEvery ?? 8_192);

  while (head < queue.length) {
    if (options.shouldCancel?.()) throw new RasterAlgorithmCancelledError();
    const current = queue[head++];
    const currentX = current % width;
    const currentY = Math.floor(current / width);
    const neighbours = [
      currentX > 0 ? current - 1 : -1,
      currentX < width - 1 ? current + 1 : -1,
      currentY > 0 ? current - width : -1,
      currentY < height - 1 ? current + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || visited[neighbour]) continue;
      visited[neighbour] = 1;
      if (!isInsideBrush(neighbour) || !matches(neighbour)) continue;
      mask[neighbour] = 1;
      queue.push(neighbour);
    }
    if (head % yieldEvery === 0) {
      options.onProgress?.(head / Math.max(1, total));
      await yieldToEventLoop();
    }
  }
  options.onProgress?.(1);
  return mask;
}

/** Convert a binary mask to a blue, transparent PNG for the selection overlay. */
export function magicWandMaskToDataUrl(mask: Uint8Array, width: number, height: number): string {
  if (typeof document === "undefined") {
    throw new Error("Magic Wand mask rendering requires a browser environment.");
  }
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const canvas = document.createElement("canvas");
  canvas.width = safeWidth;
  canvas.height = safeHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create Magic Wand mask canvas.");

  const output = context.createImageData(safeWidth, safeHeight);
  for (let i = 0; i < safeWidth * safeHeight; i++) {
    const offset = i * 4;
    output.data[offset] = 37;
    output.data[offset + 1] = 99;
    output.data[offset + 2] = 235;
    output.data[offset + 3] = mask[i] ? 255 : 0;
  }
  context.putImageData(output, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  registerRasterSelectionMask(dataUrl, canvas);
  return dataUrl;
}

export function scaledRasterSize(width: number, height: number, maxPixels = MAX_MAGIC_WAND_PIXELS) {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const scale = Math.min(1, Math.sqrt(Math.max(1, maxPixels) / (safeWidth * safeHeight)));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : min)));
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
