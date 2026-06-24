/**
 * Shared in-memory cache for loaded <img> elements so that repeat renders
 * (thumbnails, export passes, etc.) decode each source only once.
 */
const _cache = new Map<string, Promise<HTMLImageElement>>();

export function loadCachedImage(src: string): Promise<HTMLImageElement> {
  const existing = _cache.get(src);
  if (existing) return existing;
  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => {
      _cache.delete(src); // allow retry on next call
      reject(e instanceof Error ? e : new Error("image failed to load"));
    };
    img.src = src;
  });
  _cache.set(src, p);
  return p;
}

export function clearImageCache() {
  _cache.clear();
}
