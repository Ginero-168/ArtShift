import {
  type RasterJob,
  RasterJobCancelledError,
  type RasterJobOptions,
  type RasterJobProgress,
  type RasterResult,
} from "./processor";

type SerializedJob = Omit<RasterJob, "pixels" | "mask"> & {
  pixels: { width: number; height: number; data: ArrayBuffer };
  mask?: ArrayBuffer;
};

type WorkerMessage =
  | { type: "progress"; id: number; progress: number; stage: string }
  | {
      type: "result";
      id: number;
      result: {
        kind: RasterResult["kind"];
        width: number;
        height: number;
        data?: ArrayBuffer;
        mask?: ArrayBuffer;
      };
    }
  | { type: "error"; id: number; name?: string; message: string };

type Pending = {
  resolve: (result: RasterResult) => void;
  reject: (error: Error) => void;
  onProgress?: (update: RasterJobProgress) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

let worker: Worker | null = null;
let nextJobId = 1;
const pending = new Map<number, Pending>();

export function canRunRasterWorker(): boolean {
  return typeof Worker !== "undefined";
}

export function executeRasterJobInWorker(
  job: RasterJob,
  options: RasterJobOptions = {},
): Promise<RasterResult> {
  if (!canRunRasterWorker()) {
    return Promise.reject(new Error("Raster workers are unavailable."));
  }
  if (options.signal?.aborted) return Promise.reject(new RasterJobCancelledError());

  const id = nextJobId++;
  const selectionWorker = getWorker();
  const serialized = serializeJob(job);
  const transfer: Transferable[] = [serialized.pixels.data];
  if (serialized.mask) transfer.push(serialized.mask);

  return new Promise<RasterResult>((resolve, reject) => {
    const onAbort = () => {
      pending.delete(id);
      selectionWorker.postMessage({ type: "cancel", id });
      reject(new RasterJobCancelledError());
    };
    pending.set(id, {
      resolve,
      reject,
      onProgress: options.onProgress,
      signal: options.signal,
      onAbort,
    });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      selectionWorker.postMessage({ type: "execute", id, job: serialized }, transfer);
    } catch (error) {
      pending.delete(id);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error instanceof Error ? error : new Error("Could not transfer raster job."));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./raster.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    if (message.type === "progress") {
      job.onProgress?.({
        progress: Math.max(0, Math.min(1, message.progress)),
        stage: message.stage as RasterJobProgress["stage"],
      });
      return;
    }
    pending.delete(message.id);
    job.signal?.removeEventListener("abort", job.onAbort);
    if (message.type === "error") {
      const error = new Error(message.message);
      error.name = message.name ?? error.name;
      job.reject(error);
      return;
    }
    const result = message.result;
    if (result.kind === "mask" && result.mask) {
      job.resolve({
        kind: "mask",
        width: result.width,
        height: result.height,
        mask: new Uint8Array(result.mask),
      });
    } else if (result.kind === "pixels" && result.data) {
      job.resolve({
        kind: "pixels",
        width: result.width,
        height: result.height,
        data: new Uint8ClampedArray(result.data),
      });
    } else {
      job.reject(new Error("Raster worker returned an invalid result."));
    }
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Raster worker failed.");
    for (const job of pending.values()) {
      job.signal?.removeEventListener("abort", job.onAbort);
      job.reject(error);
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

function serializeJob(job: RasterJob): SerializedJob {
  const pixels = { ...job.pixels, data: job.pixels.data.slice().buffer };
  if (job.kind === "selectionMask") {
    return { ...job, pixels, mask: job.mask.slice().buffer };
  }
  return { ...job, pixels } as SerializedJob;
}
