import { useEngine } from "@/lib/engine/store";
import type { VectorizedElement } from "@/lib/engine/types";
import { prepareSvgForCanvas } from "@/lib/vectorize/atomicVectorize";

type CachedSvgImage = {
  key: string;
  img: HTMLImageElement;
  ready: boolean;
};

const cache = new Map<string, CachedSvgImage>();

function cacheKey(element: VectorizedElement): string {
  return `${element.id}:${element.version}:${element.svg.length}`;
}

/** Decode the stored SVG as an image so the canvas can draw one blob. */
export function getVectorizedImage(element: VectorizedElement): HTMLImageElement | null {
  const key = cacheKey(element);
  const existing = cache.get(element.id);
  if (existing?.key === key && existing.ready && existing.img.naturalWidth > 0) {
    return existing.img;
  }
  if (existing?.key === key) return existing.ready ? existing.img : null;
  beginDecode(element, key);
  return null;
}

function beginDecode(element: VectorizedElement, key: string) {
  if (typeof Image === "undefined") return;
  const markup = prepareSvgForCanvas(element);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  const img = new Image();
  const entry: CachedSvgImage = { key, img, ready: false };
  cache.set(element.id, entry);
  img.onload = () => {
    const current = cache.get(element.id);
    if (current !== entry) return;
    entry.ready = true;
    useEngine.setState({});
  };
  img.onerror = () => {
    const current = cache.get(element.id);
    if (current === entry) cache.delete(element.id);
  };
  img.src = url;
}
