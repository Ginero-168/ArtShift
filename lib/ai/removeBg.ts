/**
 * Background Removal Engine — High-precision AI background removal.
 * 100% In-Browser Local RMBG (briaai/RMBG-1.4 via Transformers.js).
 * Image data never leaves the browser through this module.
 */

import {
  markModelFailed,
  markModelLoaded,
  markModelLoading,
  markModelProgress,
  registerModelRuntimeReleaser,
} from "./modelRegistry";
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

registerModelRuntimeReleaser("rmbg-1.4", () => {
  rmbgModel = null;
  rmbgProcessor = null;
  rmbgLoadPromise = null;
});

type RmbgImage = {
  data: ArrayLike<number>;
  width: number;
  height: number;
  channels: number;
};

export type RemoveBackgroundOptions = {
  onProgress?: (p: number) => void;
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

function normalizeOptions(
  onProgressOrOptions?: ((p: number) => void) | RemoveBackgroundOptions,
): RemoveBackgroundOptions {
  if (typeof onProgressOrOptions === "function") return { onProgress: onProgressOrOptions };
  return onProgressOrOptions ?? {};
}

async function loadLocalRMBG(onProgress?: (p: number) => void) {
  if (rmbgModel && rmbgProcessor) return;
  if (rmbgLoadPromise) return rmbgLoadPromise;

  markModelLoading("rmbg-1.4");
  rmbgLoadPromise = (async () => {
    const { AutoModel, AutoProcessor } = await import("@huggingface/transformers");
    const progressCallback = (p: { status: string; loaded?: number; total?: number }) => {
      if (onProgress && p.status === "progress" && p.total) {
        const value = (p.loaded! / p.total) * 0.7;
        onProgress(value);
        markModelProgress("rmbg-1.4", value);
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
    markModelLoaded("rmbg-1.4");
  })();

  try {
    await rmbgLoadPromise;
  } catch (error) {
    markModelFailed("rmbg-1.4", error);
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
  return removeBackgroundClient(imageDataUrl, onProgress, signal, options);
}
