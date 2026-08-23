import type { ColorAdjustments } from "@/lib/color/adjustments";
import { applyColorAdjustments } from "@/lib/color/adjustments";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";
import { clearElementCache } from "./cache";

export type AdjustedImage = {
  canvas: HTMLCanvasElement;
  scaleX: number;
  scaleY: number;
};

const cache = new Map<string, AdjustedImage>();
const pending = new Set<string>();
const MAX_ENTRIES = 24;
const syncCache = new Map<string, AdjustedImage>();

/** Request pixel adjustments outside the render call stack; Worker when available. */
export function getRasterAdjustedImage(
  fileId: string,
  image: HTMLImageElement,
  adjustments: Partial<ColorAdjustments>,
): AdjustedImage | undefined {
  const cacheKey = `${fileId}:${stableStringify(adjustments)}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  if (!pending.has(cacheKey)) void requestAdjustedImage(cacheKey, image, adjustments);
  return undefined;
}

/** Synchronous path reserved for deterministic export/thumbnail rendering. */
export function getRasterAdjustedImageSync(
  fileId: string,
  image: HTMLImageElement,
  adjustments: Partial<ColorAdjustments>,
): AdjustedImage | undefined {
  const cacheKey = `${fileId}:${stableStringify(adjustments)}`;
  const cached = syncCache.get(cacheKey);
  if (cached) return cached;
  try {
    const maxDimension = 4096;
    const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    applyColorAdjustments(data, adjustments);
    context.putImageData(data, 0, 0);
    const result = {
      canvas,
      scaleX: canvas.width / Math.max(1, image.naturalWidth),
      scaleY: canvas.height / Math.max(1, image.naturalHeight),
    };
    syncCache.set(cacheKey, result);
    return result;
  } catch {
    return undefined;
  }
}

async function requestAdjustedImage(
  cacheKey: string,
  image: HTMLImageElement,
  adjustments: Partial<ColorAdjustments>,
): Promise<void> {
  pending.add(cacheKey);
  try {
    const maxDimension = 4096;
    const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * ratio));
    const height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const sourceContext = source.getContext("2d");
    if (!sourceContext) return;
    sourceContext.drawImage(image, 0, 0, width, height);
    const imageData = sourceContext.getImageData(0, 0, width, height);
    const result = await getLocalRasterProcessor().execute({
      kind: "filter",
      pixels: { width, height, data: imageData.data },
      adjustments,
    });
    if (result.kind !== "pixels") return;
    const canvas = document.createElement("canvas");
    canvas.width = result.width;
    canvas.height = result.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const resultImage = new ImageData(result.width, result.height);
    resultImage.data.set(result.data);
    context.putImageData(resultImage, 0, 0);
    cache.set(cacheKey, {
      canvas,
      scaleX: result.width / Math.max(1, image.naturalWidth),
      scaleY: result.height / Math.max(1, image.naturalHeight),
    });
    while (cache.size > MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (!oldest) break;
      cache.delete(oldest);
    }
    clearElementCache();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("artshift:raster-mask-ready"));
  } catch {
    // Cross-origin images stay renderable without a filtered cache.
  } finally {
    pending.delete(cacheKey);
  }
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  const record = value as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = record[key];
        return result;
      }, {}),
  );
}
