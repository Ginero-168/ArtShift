/**
 * Public vectorizer entrypoint. Heavy pixel processing lives in vectorizer-core.ts
 * so the browser Worker bundle does not form a circular dependency.
 */

import {
  getVectorizeMaxDimension,
  type VectorizeCallbacks,
  VectorizeCancelledError,
  VectorizeComplexityError,
  type VectorizeOptions,
  type VectorizeProgress,
  type VectorizeResult,
  vectorizeImageData,
} from "./vectorizer-core";

export type {
  VectorizeCallbacks,
  VectorizeOptions,
  VectorizePreset,
  VectorizeProgress,
  VectorizeProgressStage,
  VectorizeResult,
} from "./vectorizer-core";
export {
  VECTORIZE_LIMITS,
  VECTORIZE_PRESET_CONFIGS,
  VectorizeCancelledError,
  VectorizeComplexityError,
  vectorizeImageData,
} from "./vectorizer-core";

async function vectorizeImageOnMainThread(
  imageDataUrl: string,
  targetBounds: { x: number; y: number; width: number; height: number },
  options: VectorizeOptions | undefined,
  callbacks: VectorizeCallbacks,
): Promise<VectorizeResult> {
  callbacks.onProgress?.({ progress: 0.02, stage: "loading" });
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(new Error("Failed to load image for vectorization: " + e));
    img.src = imageDataUrl;
  });
  if (callbacks.signal?.aborted) throw new VectorizeCancelledError();

  const maxDimension = getVectorizeMaxDimension(options);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(10, Math.round(img.naturalWidth * scale));
  const h = Math.max(10, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create canvas context for vectorization");

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  return vectorizeImageData(imgData.data, w, h, targetBounds, options, callbacks);
}

type WorkerMessage =
  | { type: "progress"; update: VectorizeProgress }
  | { type: "result"; result: VectorizeResult }
  | { type: "error"; name?: string; message: string };

async function vectorizeImageInWorker(
  imageDataUrl: string,
  targetBounds: { x: number; y: number; width: number; height: number },
  options: VectorizeOptions | undefined,
  callbacks: VectorizeCallbacks,
): Promise<VectorizeResult> {
  if (callbacks.signal?.aborted) throw new VectorizeCancelledError();
  const worker = new Worker(new URL("./vectorizer.worker.ts", import.meta.url), { type: "module" });

  return new Promise<VectorizeResult>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      callbacks.signal?.removeEventListener("abort", onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fn();
    };
    const onAbort = () => finish(() => reject(new VectorizeCancelledError()));

    callbacks.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        callbacks.onProgress?.(message.update);
      } else if (message.type === "result") {
        finish(() => resolve(message.result));
      } else {
        const error =
          message.name === "VectorizeComplexityError"
            ? new VectorizeComplexityError(message.message)
            : new Error(message.message);
        error.name = message.name ?? error.name;
        finish(() => reject(error));
      }
    };
    worker.onerror = (event) =>
      finish(() => reject(new Error(event.message || "Vectorizer worker failed.")));
    worker.postMessage({ imageDataUrl, targetBounds, options });
  });
}

/** Vectorizes a raster image without blocking the browser UI when Workers are available. */
export async function vectorizeImage(
  imageDataUrl: string,
  targetBounds: { x: number; y: number; width: number; height: number },
  options?: VectorizeOptions,
  callbacks: VectorizeCallbacks = {},
): Promise<VectorizeResult> {
  if (typeof Worker !== "undefined" && typeof window !== "undefined") {
    try {
      return await vectorizeImageInWorker(imageDataUrl, targetBounds, options, callbacks);
    } catch (error) {
      if (error instanceof VectorizeCancelledError || error instanceof VectorizeComplexityError) {
        throw error;
      }
      console.warn("Vectorizer worker unavailable; falling back to main thread.", error);
    }
  }

  return vectorizeImageOnMainThread(imageDataUrl, targetBounds, options, callbacks);
}
