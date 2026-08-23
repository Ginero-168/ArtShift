import { clearElementCache } from "@/lib/renderer/cache";

type RasterSelectionMaskSource = CanvasImageSource;

const sources = new Map<string, RasterSelectionMaskSource>();
const pending = new Set<string>();

/** Keep a mask source synchronous for the current editing session. */
export function registerRasterSelectionMask(
  dataUrl: string,
  source: RasterSelectionMaskSource,
): void {
  sources.set(dataUrl, source);
}

/**
 * Return a decoded selection mask. Persisted documents may need one async
 * decode the first time they render; the element cache is invalidated when it
 * completes so the clipped edit appears without another user action.
 */
export function getRasterSelectionMaskSource(
  dataUrl: string,
): RasterSelectionMaskSource | undefined {
  const cached = sources.get(dataUrl);
  if (cached) return cached;
  if (pending.has(dataUrl) || typeof Image === "undefined") return undefined;

  pending.add(dataUrl);
  const image = new Image();
  image.onload = () => {
    pending.delete(dataUrl);
    sources.set(dataUrl, image);
    clearElementCache();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("artshift:raster-mask-ready"));
    }
  };
  image.onerror = () => pending.delete(dataUrl);
  image.src = dataUrl;
  return undefined;
}
