import { AutoModel, AutoProcessor, env, RawImage } from "@huggingface/transformers";
import sharp from "sharp";
import {
  applyAlphaToImageData,
  normalizeMatteValues,
  resizeMatteToAlpha,
} from "@/lib/ai/removeBgPostprocess";

export const SERVER_RMBG_MODEL = "briaai/RMBG-1.4";
export const SERVER_RMBG_MAX_IMAGE_DIMENSION = 4_096;
export const SERVER_RMBG_MAX_IMAGE_PIXELS = 16_000_000;
export const SERVER_RMBG_MAX_QUEUE = 2;

// biome-ignore lint/suspicious/noExplicitAny: third-party Transformers.js runtime types are generated at runtime.
type RmbgRuntime = { model: any; processor: any };
export type ServerRmbgStatus = {
  state: "cold" | "loading" | "ready" | "failed";
  model: string;
};
export type ServerRmbgResult = {
  dataUrl: string;
  width: number;
  height: number;
};
export type ServerRmbgOptions = {
  blackPoint?: number;
  whitePoint?: number;
};

// Transformers.js keeps model files in a VPS-local cache; no user credential is involved.
env.allowRemoteModels = true;
env.allowLocalModels = true;
env.cacheDir = process.env.ARTSHIFT_MODEL_CACHE_DIR ?? "/opt/artshift/.model-cache";

let runtimePromise: Promise<RmbgRuntime> | null = null;
let status: ServerRmbgStatus["state"] = "cold";
let queuedJobs = 0;
let jobQueue = Promise.resolve();

export function getServerRmbgStatus(): ServerRmbgStatus {
  return { state: status, model: SERVER_RMBG_MODEL };
}

export function executeServerRmbg(
  imageDataUrl: string,
  signal?: AbortSignal,
  options: ServerRmbgOptions = {},
): Promise<ServerRmbgResult> {
  if (queuedJobs >= SERVER_RMBG_MAX_QUEUE) {
    return Promise.reject(new Error("Server RMBG queue is busy."));
  }

  queuedJobs += 1;
  const job = jobQueue.then(() => executeRmbg(imageDataUrl, signal, options));
  jobQueue = job
    .catch(() => undefined)
    .then(() => {
      queuedJobs -= 1;
    });
  return job;
}

async function executeRmbg(
  imageDataUrl: string,
  signal?: AbortSignal,
  options: ServerRmbgOptions = {},
): Promise<ServerRmbgResult> {
  throwIfAborted(signal);
  const { bytes, mimeType } = decodeImageDataUrl(imageDataUrl);
  const metadata = await readSafeMetadata(bytes);
  const runtime = await loadRuntime(signal);
  throwIfAborted(signal);

  const image = await RawImage.fromBlob(new Blob([new Uint8Array(bytes)], { type: mimeType }));
  const { pixel_values: pixelValues } = await runtime.processor(image);
  throwIfAborted(signal);
  const { output } = await runtime.model({ input: pixelValues });
  throwIfAborted(signal);

  const modelMask = output?.[0];
  const sourceWidth = Number(modelMask?.dims?.at(-1));
  const sourceHeight = Number(modelMask?.dims?.at(-2));
  if (
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1
  ) {
    throw new Error("RMBG returned an invalid matte size.");
  }

  const alpha = resizeMatteToAlpha(
    normalizeMatteValues(modelMask.data),
    sourceWidth,
    sourceHeight,
    metadata.width,
    metadata.height,
    options,
  );
  throwIfAborted(signal);

  const decoded = await sharp(bytes, { limitInputPixels: SERVER_RMBG_MAX_IMAGE_PIXELS })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const rgba = applyAlphaToImageData(decoded.data, 4, alpha);
  const png = await sharp(Buffer.from(rgba), {
    raw: { width: metadata.width, height: metadata.height, channels: 4 },
  })
    .png()
    .toBuffer();

  return {
    dataUrl: `data:image/png;base64,${png.toString("base64")}`,
    width: metadata.width,
    height: metadata.height,
  };
}

async function loadRuntime(signal?: AbortSignal): Promise<RmbgRuntime> {
  if (runtimePromise) return runtimePromise;
  status = "loading";
  runtimePromise = Promise.all([
    AutoProcessor.from_pretrained(SERVER_RMBG_MODEL),
    AutoModel.from_pretrained(SERVER_RMBG_MODEL, { dtype: "q8" }),
  ])
    .then(([processor, model]) => {
      status = "ready";
      return { model, processor };
    })
    .catch((error) => {
      runtimePromise = null;
      status = "failed";
      throw error;
    });
  throwIfAborted(signal);
  return runtimePromise;
}

async function readSafeMetadata(bytes: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(bytes, {
    limitInputPixels: SERVER_RMBG_MAX_IMAGE_PIXELS,
  }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    width < 1 ||
    height < 1 ||
    width > SERVER_RMBG_MAX_IMAGE_DIMENSION ||
    height > SERVER_RMBG_MAX_IMAGE_DIMENSION ||
    width * height > SERVER_RMBG_MAX_IMAGE_PIXELS
  ) {
    throw new Error("Image dimensions exceed the server RMBG limit.");
  }
  return { width, height };
}

function decodeImageDataUrl(dataUrl: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Invalid image data URL.");
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Server RMBG task was cancelled.", "AbortError");
}
