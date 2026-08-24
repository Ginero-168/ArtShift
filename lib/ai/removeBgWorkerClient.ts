import {
  markModelFailed,
  markModelLoaded,
  markModelLoading,
  markModelProgress,
  registerModelRuntimeReleaser,
} from "./modelRegistry";

export type RemoveBgWorkerInput = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: 3 | 4;
  blackPoint?: number;
  whitePoint?: number;
};

export type RemoveBgWorkerProgress = {
  progress: number;
  stage: "loading" | "decoding" | "inference" | "postprocess";
};

type WorkerResponse =
  | { type: "progress"; id: number; progress: number; stage: RemoveBgWorkerProgress["stage"] }
  | { type: "result"; id: number; alpha: ArrayBuffer }
  | { type: "error"; id: number; name?: string; message: string };

type PendingJob = {
  resolve: (alpha: Uint8ClampedArray) => void;
  reject: (error: Error) => void;
  onProgress?: (update: RemoveBgWorkerProgress) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, PendingJob>();

registerModelRuntimeReleaser("rmbg-1.4", () => {
  for (const job of pending.values()) {
    job.signal?.removeEventListener("abort", job.onAbort);
    job.reject(new Error("RMBG runtime released."));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
});

export function canRunRemoveBgWorker(): boolean {
  return typeof Worker !== "undefined";
}

export function executeRemoveBgInWorker(
  input: RemoveBgWorkerInput,
  options: {
    onProgress?: (update: RemoveBgWorkerProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<Uint8ClampedArray> {
  const id = ++nextId;
  markModelLoading("rmbg-1.4");
  // The caller owns this temporary pixel buffer; transfer it directly so a
  // large image is not copied a second time before entering the worker.
  const source = input.data;

  return new Promise<Uint8ClampedArray>((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error("Background removal was cancelled.");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const onAbort = () => {
      worker?.postMessage({ type: "cancel", id });
      pending.delete(id);
      const error = new Error("Background removal was cancelled.");
      error.name = "AbortError";
      reject(error);
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
      getWorker().postMessage(
        {
          type: "remove",
          id,
          pixels: source.buffer,
          width: input.width,
          height: input.height,
          channels: input.channels,
          blackPoint: input.blackPoint,
          whitePoint: input.whitePoint,
        },
        [source.buffer],
      );
    } catch (error) {
      pending.delete(id);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error instanceof Error ? error : new Error("Could not start Remove BG worker."));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./removeBg.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    if (message.type === "progress") {
      job.onProgress?.({ progress: message.progress, stage: message.stage });
      markModelProgress("rmbg-1.4", message.progress / 0.7);
      return;
    }

    pending.delete(message.id);
    job.signal?.removeEventListener("abort", job.onAbort);
    if (message.type === "error") {
      const error = new Error(message.message);
      error.name = message.name ?? error.name;
      markModelFailed("rmbg-1.4", error);
      job.reject(error);
      return;
    }
    markModelLoaded("rmbg-1.4");
    job.resolve(new Uint8ClampedArray(message.alpha));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Remove BG worker failed.");
    markModelFailed("rmbg-1.4", error);
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
