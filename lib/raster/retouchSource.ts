import { clearElementCache } from "@/lib/renderer/cache";

type RasterRetouchSource = CanvasImageSource;

const sources = new Map<string, RasterRetouchSource>();
const pending = new Set<string>();

export function registerRasterRetouchSource(dataUrl: string, source: RasterRetouchSource): void {
  sources.set(dataUrl, source);
}

export function getRasterRetouchSource(dataUrl: string): RasterRetouchSource | undefined {
  const cached = sources.get(dataUrl);
  if (cached) return cached;
  if (pending.has(dataUrl) || typeof Image === "undefined") return undefined;

  pending.add(dataUrl);
  const image = new Image();
  image.onload = () => {
    pending.delete(dataUrl);
    sources.set(dataUrl, image);
    clearElementCache();
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("artshift:raster-mask-ready"));
  };
  image.onerror = () => pending.delete(dataUrl);
  image.src = dataUrl;
  return undefined;
}
