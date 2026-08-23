import {
  executeRasterJobLocallyAsync,
  type RasterCapabilities,
  type RasterJob,
  RasterJobBudgetError,
  RasterJobCancelledError,
  type RasterJobOptions,
  type RasterProcessor,
  type RasterResult,
} from "./processor";
import { canRunRasterWorker, executeRasterJobInWorker } from "./rasterWorkerClient";
import { recordRasterJob } from "./telemetry";

let processor: LocalRasterProcessor | null = null;

export class LocalRasterProcessor implements RasterProcessor {
  execute(job: RasterJob, options: RasterJobOptions = {}): Promise<RasterResult> {
    const started = now();
    const execute = canRunRasterWorker()
      ? executeRasterJobInWorker(job, options).catch((error) => {
          if (error instanceof RasterJobBudgetError || error instanceof RasterJobCancelledError) {
            throw error;
          }
          return executeRasterJobLocallyAsync(job, options);
        })
      : executeRasterJobLocallyAsync(job, options);
    return execute.then(
      (result) => {
        recordRasterJob(job.kind, now() - started, true);
        return result;
      },
      (error) => {
        recordRasterJob(job.kind, now() - started, false);
        throw error;
      },
    );
  }

  capabilities(): RasterCapabilities {
    return {
      worker: canRunRasterWorker(),
      offscreenCanvas: typeof OffscreenCanvas !== "undefined",
      cancellation: canRunRasterWorker(),
      progress: true,
      maxPixels: 2_000_000,
      maxBytes: 64 * 1024 * 1024,
      jobKinds: ["magicWand", "quickSelection", "selectionMask", "filter", "thumbnail"],
    };
  }
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

export function getLocalRasterProcessor(): LocalRasterProcessor {
  processor ??= new LocalRasterProcessor();
  return processor;
}
