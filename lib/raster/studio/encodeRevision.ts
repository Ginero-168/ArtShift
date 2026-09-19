/**
 * Phase 3 revision encode.
 *
 * Prefer @jsquash/png (Squoosh WASM) for baked Smart Object revisions.
 * Fall back to canvas toDataURL so tests, older browsers, and WASM load
 * failures still produce a valid PNG data URL. WebP can share this helper later.
 */

export const PNG_DATA_URL_PREFIX = "data:image/png;base64,";

export function arrayBufferToPngDataUrl(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `${PNG_DATA_URL_PREFIX}${btoa(binary)}`;
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

async function encodeWithJsquash(imageData: ImageData): Promise<string | null> {
  try {
    const { encode } = await import("@jsquash/png");
    const buffer = await encode(imageData);
    if (!buffer || buffer.byteLength === 0) return null;
    return arrayBufferToPngDataUrl(buffer);
  } catch {
    return null;
  }
}

function encodeWithCanvas(imageData: ImageData): string {
  return canvasFromImageData(imageData).toDataURL("image/png");
}

export type PngEncodeResult = {
  dataURL: string;
  encoder: "jsquash-png" | "canvas-png";
};

/**
 * Encode raw pixels as a PNG data URL.
 * Tries @jsquash/png first, then canvas toDataURL.
 */
export async function encodeImageDataToPngDataUrl(imageData: ImageData): Promise<PngEncodeResult> {
  const jsquash = await encodeWithJsquash(imageData);
  if (jsquash) return { dataURL: jsquash, encoder: "jsquash-png" };
  return { dataURL: encodeWithCanvas(imageData), encoder: "canvas-png" };
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
