import { ApiRasterProcessor } from "./apiRasterProcessor";
import { getLocalRasterProcessor } from "./localRasterProcessor";
import type { RasterProcessor } from "./processor";

export type RasterExecutionMode = "eco" | "fast";

let apiProcessor: ApiRasterProcessor | null = null;

/** Keep the UI choice behind one seam so a future desktop transport can replace it. */
export function getRasterProcessor(mode: RasterExecutionMode): RasterProcessor {
  if (mode === "eco") return getLocalRasterProcessor();
  apiProcessor ??= new ApiRasterProcessor();
  return apiProcessor;
}
