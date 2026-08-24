import {
  markModelFailed,
  markModelLoaded,
  markModelLoading,
  markModelProgress,
  registerModelRuntimeReleaser,
} from "@/lib/ai/modelRegistry";
import type {
  VisionWorkerProgressStage,
  VisionWorkerResponse,
  VisionWorkerResult,
} from "./visionWorkerProtocol";

type PendingVisionJob = {
  resolve: (result: VisionWorkerResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: number, stage: VisionWorkerProgressStage) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, PendingVisionJob>();

registerModelRuntimeReleaser("florence-2", () => {
  for (const job of pending.values()) {
    job.signal?.removeEventListener("abort", job.onAbort);
    job.reject(new Error("Florence-2 runtime released."));
  }
  pending.clear();
  worker?.terminate();
  worker = null;
});

export function canRunVisionWorker(): boolean {
  return typeof Worker !== "undefined" && typeof window !== "undefined";
}

/** Execute Florence-2 outside the browser UI thread. No main-thread fallback is allowed. */
export function executeVisionTaskInWorker(
  imageDataUrl: string,
  taskPrompt: string,
  options: {
    onProgress?: (progress: number, stage: VisionWorkerProgressStage) => void;
    signal?: AbortSignal;
  } = {},
): Promise<VisionWorkerResult> {
  if (!canRunVisionWorker()) {
    return Promise.reject(new Error("This browser does not support the Vision Web Worker."));
  }
  if (options.signal?.aborted) {
    const error = new Error("Vision task was cancelled.");
    error.name = "AbortError";
    return Promise.reject(error);
  }

  const id = ++nextId;
  markModelLoading("florence-2");
  return new Promise<VisionWorkerResult>((resolve, reject) => {
    const onAbort = () => {
      worker?.postMessage({ type: "cancel", id });
      pending.delete(id);
      const error = new Error("Vision task was cancelled.");
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
      getWorker().postMessage({ type: "execute", id, imageDataUrl, taskPrompt });
    } catch (error) {
      pending.delete(id);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error instanceof Error ? error : new Error("Could not start Vision worker."));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./vision.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<VisionWorkerResponse>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    if (message.type === "progress") {
      markModelProgress("florence-2", message.progress);
      job.onProgress?.(message.progress, message.stage);
      return;
    }

    pending.delete(message.id);
    job.signal?.removeEventListener("abort", job.onAbort);
    if (message.type === "error") {
      const error = new Error(message.message);
      error.name = message.name ?? error.name;
      markModelFailed("florence-2", error);
      job.reject(error);
      return;
    }
    markModelLoaded("florence-2");
    job.resolve(message.result);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Vision worker failed.");
    markModelFailed("florence-2", error);
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
