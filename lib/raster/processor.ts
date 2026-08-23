import type { ColorAdjustments } from "../color/adjustments";
import { applyColorAdjustments } from "../color/adjustments";
import { createMagicWandMask, createQuickSelectionMask, type RasterPixelData } from "./magicWand";

export const RASTER_JOB_LIMITS = {
  maxPixels: 2_000_000,
  maxBytes: 64 * 1024 * 1024,
  maxDimension: 8_192,
} as const;

export type RasterPixelBuffer = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type RasterJob =
  | {
      kind: "magicWand";
      pixels: RasterPixelBuffer;
      seedX: number;
      seedY: number;
      tolerance: number;
    }
  | {
      kind: "quickSelection";
      pixels: RasterPixelBuffer;
      seedX: number;
      seedY: number;
      radiusX: number;
      radiusY: number;
      tolerance: number;
    }
  | {
      kind: "selectionMask";
      pixels: RasterPixelBuffer;
      mask: Uint8Array;
      mode: "keep" | "erase";
    }
  | {
      kind: "filter";
      pixels: RasterPixelBuffer;
      adjustments: Partial<ColorAdjustments>;
    }
  | {
      kind: "thumbnail";
      pixels: RasterPixelBuffer;
      width: number;
      height: number;
    };

export type RasterJobProgress = {
  progress: number;
  stage: "queued" | "sampling" | "processing" | "encoding" | "complete";
};

export type RasterJobOptions = {
  signal?: AbortSignal;
  onProgress?: (update: RasterJobProgress) => void;
  maxPixels?: number;
  maxBytes?: number;
};

export type RasterResult =
  | { kind: "mask"; width: number; height: number; mask: Uint8Array }
  | { kind: "pixels"; width: number; height: number; data: Uint8ClampedArray };

export type RasterCapabilities = {
  worker: boolean;
  offscreenCanvas: boolean;
  cancellation: boolean;
  progress: boolean;
  maxPixels: number;
  jobKinds: readonly RasterJob["kind"][];
};

export interface RasterProcessor {
  execute(job: RasterJob, options?: RasterJobOptions): Promise<RasterResult>;
  capabilities(): RasterCapabilities;
}

export class RasterJobCancelledError extends Error {
  constructor() {
    super("Raster job cancelled.");
    this.name = "RasterJobCancelledError";
  }
}

export class RasterJobBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RasterJobBudgetError";
  }
}

export function assertRasterJobBudget(job: RasterJob, options: RasterJobOptions = {}): void {
  const width = job.pixels.width;
  const height = job.pixels.height;
  const pixels = width * height;
  const maxPixels = options.maxPixels ?? RASTER_JOB_LIMITS.maxPixels;
  const maxBytes = options.maxBytes ?? RASTER_JOB_LIMITS.maxBytes;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > RASTER_JOB_LIMITS.maxDimension ||
    height > RASTER_JOB_LIMITS.maxDimension
  ) {
    throw new RasterJobBudgetError("Raster job dimensions exceed the safe limit.");
  }
  if (pixels > maxPixels) {
    throw new RasterJobBudgetError(
      `Raster job exceeds the ${maxPixels.toLocaleString()} pixel limit.`,
    );
  }
  if (job.pixels.data.byteLength > maxBytes) {
    throw new RasterJobBudgetError("Raster job pixel buffer exceeds the memory limit.");
  }
  if (job.kind === "selectionMask" && job.mask.length !== pixels) {
    throw new RasterJobBudgetError("Raster selection mask dimensions do not match the image.");
  }
}

export function executeRasterJobLocally(
  job: RasterJob,
  options: RasterJobOptions = {},
): RasterResult {
  assertRasterJobBudget(job, options);
  throwIfCancelled(options.signal);
  options.onProgress?.({ progress: 0.05, stage: "processing" });

  let result: RasterResult;
  switch (job.kind) {
    case "magicWand":
      result = {
        kind: "mask",
        width: job.pixels.width,
        height: job.pixels.height,
        mask: createMagicWandMask(
          job.pixels as RasterPixelData,
          job.seedX,
          job.seedY,
          job.tolerance,
        ),
      };
      break;
    case "quickSelection":
      result = {
        kind: "mask",
        width: job.pixels.width,
        height: job.pixels.height,
        mask: createQuickSelectionMask(
          job.pixels as RasterPixelData,
          job.seedX,
          job.seedY,
          job.radiusX,
          job.radiusY,
          job.tolerance,
        ),
      };
      break;
    case "selectionMask": {
      const data = job.pixels.data.slice();
      for (let index = 0; index < job.mask.length; index++) {
        if (!job.mask[index]) continue;
        const alpha = index * 4 + 3;
        if (job.mode === "erase") data[alpha] = 0;
        else data[alpha] = Math.round((data[alpha] * job.mask[index]) / 255);
      }
      result = { kind: "pixels", width: job.pixels.width, height: job.pixels.height, data };
      break;
    }
    case "filter": {
      const data = job.pixels.data.slice();
      applyColorAdjustments(
        { data, width: job.pixels.width, height: job.pixels.height } as ImageData,
        job.adjustments,
      );
      result = { kind: "pixels", width: job.pixels.width, height: job.pixels.height, data };
      break;
    }
    case "thumbnail":
      result = resizeRasterPixels(job.pixels, job.width, job.height);
      break;
  }

  throwIfCancelled(options.signal);
  options.onProgress?.({ progress: 1, stage: "complete" });
  return result;
}

function resizeRasterPixels(
  source: RasterPixelBuffer,
  width: number,
  height: number,
): RasterResult {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = Math.max(1, Math.floor(height));
  const data = new Uint8ClampedArray(safeWidth * safeHeight * 4);
  for (let y = 0; y < safeHeight; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((y / safeHeight) * source.height));
    for (let x = 0; x < safeWidth; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((x / safeWidth) * source.width));
      const from = (sourceY * source.width + sourceX) * 4;
      const to = (y * safeWidth + x) * 4;
      data[to] = source.data[from] ?? 0;
      data[to + 1] = source.data[from + 1] ?? 0;
      data[to + 2] = source.data[from + 2] ?? 0;
      data[to + 3] = source.data[from + 3] ?? 0;
    }
  }
  return { kind: "pixels", width: safeWidth, height: safeHeight, data };
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new RasterJobCancelledError();
}
