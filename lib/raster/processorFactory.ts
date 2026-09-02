import { getLocalRasterProcessor } from "./localRasterProcessor";
import type { RasterProcessor } from "./processor";

let processor: RasterProcessor | null = null;

/**
 * One browser-facing raster entry point. The local Worker/WASM adapter is the
 * safe default; optional server adapters remain behind this seam for future
 * capability-based fallback without exposing a mode switch in the editor.
 */
export function getRasterProcessor(): RasterProcessor {
  processor ??= getLocalRasterProcessor();
  return processor;
}
