import { decodeRasterResult, type EncodedRasterResult, encodeRasterJob } from "./jobPayload";
import {
  assertRasterJobBudget,
  type RasterCapabilities,
  type RasterJob,
  type RasterJobOptions,
  type RasterProcessor,
  type RasterResult,
} from "./processor";

export class RasterApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RasterApiError";
  }
}

export class ApiRasterProcessor implements RasterProcessor {
  constructor(
    private readonly endpoint = "/api/raster/process",
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async execute(job: RasterJob, options: RasterJobOptions = {}): Promise<RasterResult> {
    assertRasterJobBudget(job, options);
    if (options.signal?.aborted) throw new DOMException("Raster job cancelled.", "AbortError");
    options.onProgress?.({ progress: 0.05, stage: "queued" });
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: encodeRasterJob(job) }),
      signal: options.signal,
    });
    if (!response.ok)
      throw new RasterApiError(
        `Raster API failed with status ${response.status}.`,
        response.status,
      );
    const payload = (await response.json()) as { result?: EncodedRasterResult };
    const result = decodeRasterResult(payload.result);
    if (!result) throw new RasterApiError("Raster API returned an invalid result.");
    options.onProgress?.({ progress: 1, stage: "complete" });
    return result;
  }

  capabilities(): RasterCapabilities {
    return {
      worker: false,
      offscreenCanvas: false,
      cancellation: true,
      progress: true,
      maxPixels: 2_000_000,
      jobKinds: ["magicWand", "quickSelection", "selectionMask", "filter", "thumbnail"],
    };
  }
}
