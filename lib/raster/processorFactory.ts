import { getLocalRasterProcessor } from "./localRasterProcessor";
import type { RasterProcessor } from "./processor";

let processor: RasterProcessor | null = null;
let configuredProcessor: RasterProcessor | null = null;

/** Configure a host-provided adapter without exposing provider choice to users. */
export function configureRasterProcessor(next: RasterProcessor | null): void {
  configuredProcessor = next;
}

/**
 * One browser-facing raster entry point. The local Worker/WASM adapter is the
 * safe default; optional server adapters remain behind this seam for future
 * capability-based fallback without exposing a mode switch in the editor.
 */
export function getRasterProcessor(): RasterProcessor {
  if (configuredProcessor) return configuredProcessor;
  processor ??= getLocalRasterProcessor();
  return processor;
}
