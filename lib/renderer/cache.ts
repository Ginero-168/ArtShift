/**
 * Offscreen element cache used by the canvas renderer.
 *
 * Kept in a separate module so store-level code can invalidate the cache
 * without pulling in the full renderer (and therefore rough.js) in tests.
 */

import type { EngineElement } from "../engine/types";

const _elementCache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE_SIZE = 300;

function getCacheKey(el: EngineElement): string {
  return `${el.id}:${el.version}`;
}

export function getCachedElement(el: EngineElement): HTMLCanvasElement | undefined {
  return _elementCache.get(getCacheKey(el));
}

export function setCachedElement(el: EngineElement, canvas: HTMLCanvasElement) {
  if (_elementCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(_elementCache.entries());
    // Remove oldest half.
    for (let i = 0; i < Math.floor(entries.length / 2); i++) {
      _elementCache.delete(entries[i][0]);
    }
  }
  _elementCache.set(getCacheKey(el), canvas);
}

export function clearElementCache() {
  _elementCache.clear();
}
