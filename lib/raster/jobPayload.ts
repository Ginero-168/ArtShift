import type { ColorAdjustments } from "@/lib/color/adjustments";
import type { RasterJob, RasterPixelBuffer, RasterResult } from "./processor";

export type EncodedRasterJob = Omit<RasterJob, "pixels" | "mask"> & {
  pixels: Omit<RasterPixelBuffer, "data"> & { data: string };
  mask?: string;
};

export type EncodedRasterResult =
  | { kind: "mask"; width: number; height: number; mask: string }
  | { kind: "pixels"; width: number; height: number; data: string };

export function encodeRasterJob(job: RasterJob): EncodedRasterJob {
  return {
    ...job,
    pixels: { ...job.pixels, data: bytesToBase64(job.pixels.data) },
    ...(job.kind === "selectionMask" ? { mask: bytesToBase64(job.mask) } : {}),
  } as EncodedRasterJob;
}

export function decodeRasterJob(input: unknown): RasterJob | null {
  if (!isRecord(input) || !isRecord(input.pixels)) return null;
  const pixels = decodePixels(input.pixels);
  if (!pixels) return null;
  const kind = input.kind;
  const seedX = numberValue(input, "seedX");
  const seedY = numberValue(input, "seedY");
  const tolerance = numberValue(input, "tolerance");
  if (
    kind === "magicWand" &&
    seedX !== undefined &&
    seedY !== undefined &&
    tolerance !== undefined
  ) {
    return { kind, pixels, seedX, seedY, tolerance };
  }
  const radiusX = numberValue(input, "radiusX");
  const radiusY = numberValue(input, "radiusY");
  if (
    kind === "quickSelection" &&
    seedX !== undefined &&
    seedY !== undefined &&
    radiusX !== undefined &&
    radiusY !== undefined &&
    tolerance !== undefined
  ) {
    return {
      kind,
      pixels,
      seedX,
      seedY,
      radiusX,
      radiusY,
      tolerance,
    };
  }
  if (kind === "selectionMask" && (input.mode === "keep" || input.mode === "erase")) {
    const mask = typeof input.mask === "string" ? base64ToBytes(input.mask) : null;
    return mask ? { kind, pixels, mask, mode: input.mode } : null;
  }
  if (kind === "filter" && isRecord(input.adjustments)) {
    return { kind, pixels, adjustments: input.adjustments as Partial<ColorAdjustments> };
  }
  const thumbnailWidth = numberValue(input, "width");
  const thumbnailHeight = numberValue(input, "height");
  if (kind === "thumbnail" && thumbnailWidth !== undefined && thumbnailHeight !== undefined) {
    return { kind, pixels, width: thumbnailWidth, height: thumbnailHeight };
  }
  return null;
}

export function encodeRasterResult(result: RasterResult): EncodedRasterResult {
  return result.kind === "mask"
    ? { kind: "mask", width: result.width, height: result.height, mask: bytesToBase64(result.mask) }
    : {
        kind: "pixels",
        width: result.width,
        height: result.height,
        data: bytesToBase64(result.data),
      };
}

export function decodeRasterResult(input: unknown): RasterResult | null {
  if (!isRecord(input)) return null;
  const width = numberValue(input, "width");
  const height = numberValue(input, "height");
  if (width === undefined || height === undefined) return null;
  if (input.kind === "mask" && typeof input.mask === "string") {
    const mask = base64ToBytes(input.mask);
    return mask ? { kind: "mask", width, height, mask } : null;
  }
  if (input.kind === "pixels" && typeof input.data === "string") {
    const data = base64ToBytes(input.data);
    return data
      ? {
          kind: "pixels",
          width,
          height,
          data: new Uint8ClampedArray(data),
        }
      : null;
  }
  return null;
}

function decodePixels(input: Record<string, unknown>): RasterPixelBuffer | null {
  const width = numberValue(input, "width");
  const height = numberValue(input, "height");
  if (width === undefined || height === undefined || typeof input.data !== "string") return null;
  const data = base64ToBytes(input.data);
  if (!data || data.length !== width * height * 4) return null;
  return { width, height, data: new Uint8ClampedArray(data) };
}

function numberValue(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToBase64(bytes: ArrayLike<number>): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk: number[] = [];
    for (let offset = index; offset < Math.min(bytes.length, index + chunkSize); offset++) {
      chunk.push(bytes[offset]);
    }
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}
