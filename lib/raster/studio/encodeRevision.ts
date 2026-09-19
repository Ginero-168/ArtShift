/**
 * Phase 3 revision encode.
 *
 * Prefer @jsquash/png (Squoosh WASM) for baked Smart Object revisions.
 * Fall back to canvas toDataURL so tests, older browsers, and WASM load
 * failures still produce a valid PNG data URL.
 *
 * WebP shares this helper (`encodeImageData({ format: "webp" })`) but Save
 * bake stays PNG by default — persist/cache already accept WebP, yet PNG is
 * the lossless revision format until a later opt-in.
 *
 * Worker-thread `renderElement` preview stays deferred: the renderer needs
 * HTMLImageElement, document canvases, and Rough.js. OffscreenCanvas blit
 * on the main thread remains the safe preview path.
 */

export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
export const WEBP_DATA_URL_PREFIX = "data:image/webp;base64,";

export type RasterEncodeFormat = "png" | "webp";

export type RasterEncodeEncoder = "jsquash-png" | "canvas-png" | "jsquash-webp" | "canvas-webp";

export type RasterEncodeResult = {
  dataURL: string;
  format: RasterEncodeFormat;
  encoder: RasterEncodeEncoder;
};

export type PngEncodeResult = {
  dataURL: string;
  encoder: "jsquash-png" | "canvas-png";
};

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

export function arrayBufferToPngDataUrl(buffer: ArrayBuffer): string {
  return arrayBufferToDataUrl(buffer, "image/png");
}

function canvasFromImageData(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context for PNG fallback encode");
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

async function encodeWithJsquashPng(imageData: ImageData): Promise<string | null> {
  try {
    const { encode } = await import("@jsquash/png");
    const buffer = await encode(imageData);
    if (!buffer || buffer.byteLength === 0) return null;
    return arrayBufferToPngDataUrl(buffer);
  } catch {
    return null;
  }
}

async function encodeWithJsquashWebp(
  imageData: ImageData,
  quality: number,
): Promise<string | null> {
  try {
    const { encode } = await import("@jsquash/webp");
    const buffer = await encode(imageData, { quality });
    if (!buffer || buffer.byteLength === 0) return null;
    return arrayBufferToDataUrl(buffer, "image/webp");
  } catch {
    return null;
  }
}

function encodePngWithCanvas(imageData: ImageData): string {
  return canvasFromImageData(imageData).toDataURL("image/png");
}

function encodeWebpWithCanvas(imageData: ImageData, quality: number): string | null {
  try {
    const dataUrl = canvasFromImageData(imageData).toDataURL(
      "image/webp",
      Math.max(0.01, Math.min(1, quality / 100)),
    );
    if (dataUrl.startsWith(WEBP_DATA_URL_PREFIX)) return dataUrl;
    return null;
  } catch {
    return null;
  }
}

/**
 * Encode raw pixels. PNG is the default (used by Raster Studio Save).
 * WebP is opt-in; if WASM and canvas both fail, falls back to PNG.
 */
export async function encodeImageData(
  imageData: ImageData,
  options?: { format?: RasterEncodeFormat; webpQuality?: number },
): Promise<RasterEncodeResult> {
  const format = options?.format ?? "png";
  const webpQuality = options?.webpQuality ?? 85;
  if (format === "webp") {
    const jsquash = await encodeWithJsquashWebp(imageData, webpQuality);
    if (jsquash) {
      return { dataURL: jsquash, format: "webp", encoder: "jsquash-webp" };
    }
    const canvas = encodeWebpWithCanvas(imageData, webpQuality);
    if (canvas) {
      return { dataURL: canvas, format: "webp", encoder: "canvas-webp" };
    }
  }
  const png = await encodeImageDataToPngDataUrl(imageData);
  return { dataURL: png.dataURL, format: "png", encoder: png.encoder };
}

/**
 * Encode raw pixels as a PNG data URL.
 * Tries @jsquash/png first, then canvas toDataURL.
 */
export async function encodeImageDataToPngDataUrl(imageData: ImageData): Promise<PngEncodeResult> {
  const jsquash = await encodeWithJsquashPng(imageData);
  if (jsquash) return { dataURL: jsquash, encoder: "jsquash-png" };
  return { dataURL: encodePngWithCanvas(imageData), encoder: "canvas-png" };
}

export type BakeSurface = {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  offscreen: boolean;
};

/** OffscreenCanvas when the platform has it; otherwise a document canvas. */
export function createBakeSurface(width: number, height: number): BakeSurface {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (ctx) return { canvas, ctx, offscreen: true };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to acquire 2D context for Raster Studio bake");
  return { canvas, ctx, offscreen: false };
}

/**
 * Blit an OffscreenCanvas composite onto a visible canvas.
 * Prefers ImageBitmap when available; otherwise drawImage(OffscreenCanvas).
 * Does not transfer/consume the source, so the same surface can redraw.
 */
export function blitOffscreenPreview(source: OffscreenCanvas, target: HTMLCanvasElement): boolean {
  const ctx = target.getContext("2d");
  if (!ctx) return false;
  if (target.width !== source.width || target.height !== source.height) {
    target.width = source.width;
    target.height = source.height;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
  return true;
}
