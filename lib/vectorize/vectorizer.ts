/** Public VTracer WASM entrypoint for browser and Worker runtimes. */

import { markModelFailed, markModelLoaded, markModelLoading } from "@/lib/ai/modelRegistry";
import {
  getVectorizeMaxDimension,
  type VectorizeCallbacks,
  VectorizeCancelledError,
  VectorizeComplexityError,
  type VectorizeOptions,
  type VectorizeProgress,
  type VectorizeResult,
} from "./vectorizerTypes";
import { vectorizeRgbaWithVTracer } from "./vtracerRuntime";

export type {
  VectorizeCallbacks,
  VectorizeClustering,
  VectorizeComposition,
  VectorizeOptions,
  VectorizePreset,
  VectorizeProgress,
  VectorizeProgressStage,
  VectorizeResult,
  VectorizeTraceMode,
  VTracerControls,
} from "./vectorizerTypes";
export {
  VECTORIZE_LIMITS,
  VECTORIZE_PRESET_CONFIGS,
  VectorizeCancelledError,
  VectorizeComplexityError,
} from "./vectorizerTypes";

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
    img.onerror = (error) => reject(new Error("Failed to load image for vectorization: " + error));
    img.src = imageDataUrl;
  });
  if (callbacks.signal?.aborted) throw new VectorizeCancelledError();

  const maxDimension = getVectorizeMaxDimension(options);
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(10, Math.round(img.naturalWidth * scale));
  const height = Math.max(10, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not create canvas context for vectorization");

  context.drawImage(img, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return vectorizeRgbaWithVTracer(imageData.data, width, height, targetBounds, options, callbacks);
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
      finish(() => reject(new Error(event.message || "VTracer worker failed.")));
    worker.postMessage({ imageDataUrl, targetBounds, options });
  });
}

/** Vectorizes a raster image with VTracer WASM without mutating the source image. */
export async function vectorizeImage(
  imageDataUrl: string,
  targetBounds: { x: number; y: number; width: number; height: number },
  options?: VectorizeOptions,
  callbacks: VectorizeCallbacks = {},
): Promise<VectorizeResult> {
  const modelId = "vtracer-wasm";
  markModelLoading(modelId);
  if (typeof Worker !== "undefined" && typeof window !== "undefined") {
    try {
      const result = await vectorizeImageInWorker(imageDataUrl, targetBounds, options, callbacks);
      markModelLoaded(modelId);
      return { ...result, backend: "vtracer-wasm" };
    } catch (error) {
      if (error instanceof VectorizeCancelledError || error instanceof VectorizeComplexityError) {
        throw error;
      }
      markModelFailed(modelId, error);
    }
  }

  try {
    const result = await vectorizeImageOnMainThread(imageDataUrl, targetBounds, options, callbacks);
    markModelLoaded(modelId);
    return { ...result, backend: "vtracer-wasm" };
  } catch (error) {
    markModelFailed(modelId, error);
    throw error;
  }
}
