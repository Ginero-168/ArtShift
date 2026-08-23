/**
 * Offscreen element cache used by the canvas renderer.
 *
 * Kept in a separate module so store-level code can invalidate the cache
 * without pulling in the full renderer (and therefore rough.js) in tests.
 */

import type { EngineElement } from "../engine/types";

export type CachedElement = {
  canvas: HTMLCanvasElement;
  pad: number;
};

const _elementCache = new Map<string, CachedElement>();
const MAX_CACHE_SIZE = 300;

function getCacheKey(el: EngineElement): string {
  return `${el.type}:${el.id}:${el.version}`;
}

export function getCachedElement(el: EngineElement): CachedElement | undefined {
  return _elementCache.get(getCacheKey(el));
}

export function setCachedElement(el: EngineElement, cached: CachedElement) {
  if (_elementCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(_elementCache.entries());
    // Remove oldest half.
    for (let i = 0; i < Math.floor(entries.length / 2); i++) {
      _elementCache.delete(entries[i][0]);
    }
  }
  _elementCache.set(getCacheKey(el), cached);
}

export function clearElementCache() {
  _elementCache.clear();
}
