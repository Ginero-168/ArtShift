import {
  executeRasterJobLocally,
  type RasterCapabilities,
  type RasterJob,
  RasterJobBudgetError,
  RasterJobCancelledError,
  type RasterJobOptions,
  type RasterProcessor,
  type RasterResult,
} from "./processor";
import { canRunRasterWorker, executeRasterJobInWorker } from "./rasterWorkerClient";

let processor: LocalRasterProcessor | null = null;

export class LocalRasterProcessor implements RasterProcessor {
  execute(job: RasterJob, options: RasterJobOptions = {}): Promise<RasterResult> {
    if (canRunRasterWorker()) {
      return executeRasterJobInWorker(job, options).catch((error) => {
        if (error instanceof RasterJobBudgetError || error instanceof RasterJobCancelledError) {
          throw error;
        }
        return executeRasterJobLocally(job, options);
      });
    }
    return Promise.resolve().then(() => executeRasterJobLocally(job, options));
  }

  capabilities(): RasterCapabilities {
    return {
      worker: canRunRasterWorker(),
      offscreenCanvas: typeof OffscreenCanvas !== "undefined",
      cancellation: canRunRasterWorker(),
      progress: true,
      maxPixels: 2_000_000,
      jobKinds: ["magicWand", "quickSelection", "selectionMask", "filter", "thumbnail"],
    };
  }
}

export function getLocalRasterProcessor(): LocalRasterProcessor {
  processor ??= new LocalRasterProcessor();
  return processor;
}
