import type { AssetAnalysisInput, AssetAnalysisResult } from "./assetAnalysis";
import type { AssetAnalysisWorkerResponse } from "./assetAnalysisWorkerProtocol";

type PendingJob = {
  resolve: (result: AssetAnalysisResult) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, PendingJob>();

export function canRunAssetAnalysisWorker(): boolean {
  return typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined";
}

export function analyzeAssetInWorker(
  input: AssetAnalysisInput,
  options: { signal?: AbortSignal; maxDimension?: number } = {},
): Promise<AssetAnalysisResult> {
  if (!canRunAssetAnalysisWorker()) {
    return Promise.reject(new Error("Asset analysis Worker is unavailable."));
  }

  const id = ++nextId;
  return new Promise<AssetAnalysisResult>((resolve, reject) => {
    if (options.signal?.aborted) {
      const error = new Error("Asset analysis was cancelled.");
      error.name = "AbortError";
      reject(error);
      return;
    }

    const onAbort = () => {
      worker?.postMessage({ type: "cancel", id });
      pending.delete(id);
      const error = new Error("Asset analysis was cancelled.");
      error.name = "AbortError";
      reject(error);
    };
    pending.set(id, { resolve, reject, signal: options.signal, onAbort });
    options.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      getWorker().postMessage({
        type: "analyze",
        id,
        fileId: input.fileId,
        dataURL: input.dataURL,
        sourceWidth: input.width,
        sourceHeight: input.height,
        maxDimension: options.maxDimension ?? 768,
      });
    } catch (error) {
      pending.delete(id);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error instanceof Error ? error : new Error("Could not start asset analysis."));
    }
  });
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./assetAnalysis.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<AssetAnalysisWorkerResponse>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;
    pending.delete(message.id);
    job.signal?.removeEventListener("abort", job.onAbort);
    if (message.type === "error") {
      const error = new Error(message.message);
      error.name = message.name ?? error.name;
      job.reject(error);
      return;
    }
    job.resolve(message.result);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || "Asset analysis Worker failed.");
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
