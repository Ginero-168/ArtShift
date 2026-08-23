/**
 * Background Removal Engine — High-precision AI background removal.
 * Primary mode: 100% In-Browser Local RMBG (briaai/RMBG-1.4 via Transformers.js).
 * Fallback mode: Server API (/api/removebg) if configured.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  applyAlphaToImageData,
  normalizeMatteValues,
  resizeMatteToAlpha,
} from "./removeBgPostprocess";
import { canRunRemoveBgWorker, executeRemoveBgInWorker } from "./removeBgWorkerClient";

// biome-ignore lint/suspicious/noExplicitAny: third-party RMBG model type
let rmbgModel: any = null;
// biome-ignore lint/suspicious/noExplicitAny: third-party RMBG processor type
let rmbgProcessor: any = null;
let rmbgLoadPromise: Promise<void> | null = null;

type RmbgImage = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: number;
};

export type RemoveBackgroundOptions = {
  onProgress?: (p: number) => void;
  /** Eco runs locally; Fast sends the job to the configured paid API directly. */
  mode?: "eco" | "fast";
  /** Allow Eco to upload only when a caller explicitly opts into a remote fallback. */
  allowRemoteFallback?: boolean;
  signal?: AbortSignal;
  blackPoint?: number;
  whitePoint?: number;
};

function createAbortError(): Error {
  return Object.assign(new Error("Background removal was cancelled."), { name: "AbortError" });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw createAbortError();
}

function waitFor(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onAbort = () => finish(() => reject(createAbortError()));
    const timer = setTimeout(() => finish(resolve), milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizeOptions(
  onProgressOrOptions?: ((p: number) => void) | RemoveBackgroundOptions,
): RemoveBackgroundOptions {
  if (typeof onProgressOrOptions === "function") return { onProgress: onProgressOrOptions };
  return onProgressOrOptions ?? {};
}

async function loadLocalRMBG(onProgress?: (p: number) => void) {
  if (rmbgModel && rmbgProcessor) return;
  if (rmbgLoadPromise) return rmbgLoadPromise;

  rmbgLoadPromise = (async () => {
    const { AutoModel, AutoProcessor } = await import("@huggingface/transformers");
    const progressCallback = (p: { status: string; loaded?: number; total?: number }) => {
      if (onProgress && p.status === "progress" && p.total) {
        onProgress((p.loaded! / p.total) * 0.7);
      }
    };
    const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");
    const canUseWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
    let model = rmbgModel;
    try {
      model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
        device: canUseWebGpu ? "webgpu" : "wasm",
        dtype: canUseWebGpu ? "fp16" : "q8",
        progress_callback: progressCallback,
      });
    } catch (error) {
      console.warn("Preferred local RMBG runtime failed; retrying with WASM.", error);
      model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
        device: "wasm",
        progress_callback: progressCallback,
      });
    }
    rmbgModel = model;
    rmbgProcessor = processor;
  })();

  try {
    await rmbgLoadPromise;
  } catch (error) {
    rmbgLoadPromise = null;
    throw error;
  }
}

export async function removeBackgroundClient(
  imageDataUrl: string,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
  postprocessOptions: Pick<RemoveBackgroundOptions, "blackPoint" | "whitePoint"> = {},
): Promise<string> {
  throwIfAborted(signal);
  const { RawImage } = await import("@huggingface/transformers");
  const image = await RawImage.fromURL(imageDataUrl);
  throwIfAborted(signal);
  onProgress?.(0.08);

  if (canRunRemoveBgWorker()) {
    try {
      const alpha = await executeRemoveBgInWorker(
        {
          data: new Uint8ClampedArray(image.data),
          width: image.width,
          height: image.height,
          channels: image.channels as 3 | 4,
          ...postprocessOptions,
        },
        {
          signal,
          onProgress: (update) => onProgress?.(0.08 + update.progress * 0.87),
        },
      );
      return composeImageWithAlpha(image, alpha, signal, onProgress);
    } catch (error) {
      throwIfAborted(signal);
      console.warn("Remove BG worker failed, retrying local fallback...", error);
    }
  }

  await loadLocalRMBG(onProgress);
  throwIfAborted(signal);
  onProgress?.(0.75);
  onProgress?.(0.85);

  const { pixel_values } = await rmbgProcessor(image);
  throwIfAborted(signal);
  const { output } = await rmbgModel({ input: pixel_values });
  throwIfAborted(signal);
  onProgress?.(0.95);

  const modelMask = output[0];
  const sourceWidth = Number(modelMask.dims.at(-1));
  const sourceHeight = Number(modelMask.dims.at(-2));
  if (
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1
  ) {
    throw new Error("RMBG returned an invalid matte size.");
  }
  const normalizedMatte = normalizeMatteValues(modelMask.data);
  const maskData = resizeMatteToAlpha(
    normalizedMatte,
    sourceWidth,
    sourceHeight,
    image.width,
    image.height,
    postprocessOptions,
  );

  return composeImageWithAlpha(image, maskData, signal, onProgress);
}

function composeImageWithAlpha(
  image: RmbgImage,
  alpha: Uint8ClampedArray,
  signal?: AbortSignal,
  onProgress?: (p: number) => void,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  const imgData = ctx.createImageData(image.width, image.height);
  imgData.data.set(applyAlphaToImageData(image.data, image.channels, alpha));
  throwIfAborted(signal);
  ctx.putImageData(imgData, 0, 0);
  onProgress?.(1);
  return canvas.toDataURL("image/png");
}

export async function removeBackground(
  imageDataUrl: string,
  onProgressOrOptions?: ((p: number) => void) | RemoveBackgroundOptions,
): Promise<string> {
  const options = normalizeOptions(onProgressOrOptions);
  const { onProgress, signal } = options;
  const mode = options.mode ?? "eco";
  const allowRemoteFallback = options.allowRemoteFallback ?? mode === "fast";

  if (mode === "fast") {
    return removeBackgroundRemote(imageDataUrl, onProgress, signal);
  }

  // Try in-browser local AI first
  try {
    return await removeBackgroundClient(imageDataUrl, onProgress, signal, options);
  } catch (localErr) {
    throwIfAborted(signal);
    if (!allowRemoteFallback) throw localErr;
    console.warn("Local RMBG failed, falling back to server API...", localErr);
  }

  throwIfAborted(signal);
  return removeBackgroundRemote(imageDataUrl, onProgress, signal);
}

async function removeBackgroundRemote(
  imageDataUrl: string,
  onProgress?: (p: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  onProgress?.(0.05);
  // Fallback to server API
  const postRes = await fetch("/api/removebg", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
    signal,
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({ error: "unknown" }));
    throw new Error(err.error || `BG removal failed: ${postRes.status}`);
  }

  const postData = await postRes.json();
  const requestId = postData.id || postData.requestId;
  if (!requestId) {
    throw new Error("BG removal: no requestId returned");
  }

  for (let i = 0; i < 60; i++) {
    throwIfAborted(signal);
    await waitFor(500, signal);
    const statusRes = await fetch(`/api/removebg?requestId=${encodeURIComponent(requestId)}`, {
      signal,
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    onProgress?.(0.05 + ((i + 1) / 60) * 0.9);
    if (statusData.status === "completed" && statusData.output?.image) {
      onProgress?.(1);
      return statusData.output.image as string;
    }
    if (statusData.status === "failed") {
      throw new Error("BG removal: job failed on server");
    }
  }

  throw new Error("BG removal: timeout waiting for result");
}
