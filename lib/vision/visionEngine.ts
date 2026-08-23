/**
 * Vision Engine — Local Florence-2 for browser-based image understanding.
 * 100% client-side: captioning, OCR, object detection, dense region captioning,
 * and phrase grounding. No images leave the browser.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  env,
  Florence2ForConditionalGeneration,
  Florence2Processor,
  RawImage,
} from "@huggingface/transformers";
import type { VisionMask } from "./advancedVision";
import { alphaBoundsFromRgba } from "./foreground";

env.allowLocalModels = false;

const PRIMARY_MODEL_ID = "onnx-community/Florence-2-base-ft";
const FALLBACK_MODEL_ID = "Xenova/florence-2-base";

// biome-ignore lint/suspicious/noExplicitAny: third-party Florence-2 model types are complex and not imported here
let model: any = null;
// biome-ignore lint/suspicious/noExplicitAny: third-party Florence-2 processor types are complex and not imported here
let processor: any = null;
let modelLoading = false;

async function ensureModel(onProgress?: (p: number) => void) {
  if (model && processor) return;
  if (modelLoading) {
    while (modelLoading) await new Promise((r) => setTimeout(r, 200));
    return;
  }

  modelLoading = true;

  async function tryLoad(id: string) {
    console.log(
      `[VisionEngine] Loading Florence-2 from ${id} (~230 MB, cached after first use)...`,
    );
    const progressCallback = (progress: { status: string; loaded?: number; total?: number }) => {
      if (onProgress && progress.status === "progress" && progress.total) {
        onProgress((progress.loaded! / progress.total) * 0.5);
      }
    };

    const [m, p] = await Promise.all([
      Florence2ForConditionalGeneration.from_pretrained(id, {
        dtype: "fp32",
        progress_callback: progressCallback,
      }),
      Florence2Processor.from_pretrained(id),
    ]);
    return { model: m, processor: p };
  }

  try {
    const res = await tryLoad(PRIMARY_MODEL_ID);
    model = res.model;
    processor = res.processor;
    console.log("[VisionEngine] Florence-2 loaded successfully");
  } catch {
    console.warn(`[VisionEngine] Primary model failed. Trying fallback...`);
    try {
      const res = await tryLoad(FALLBACK_MODEL_ID);
      model = res.model;
      processor = res.processor;
    } catch (fallbackErr) {
      console.error("[VisionEngine] Failed to load Florence-2:", fallbackErr);
      model = null;
      processor = null;
      throw new Error("VISION_MODEL_LOAD_FAILED: " + (fallbackErr as Error).message);
    }
  } finally {
    modelLoading = false;
  }
}

async function runVisionTask(
  imageDataUrl: string,
  taskPrompt: string,
  onProgress?: (p: number) => void,
) {
  await ensureModel(onProgress);
  if (onProgress) onProgress(0.55);

  const image = await RawImage.fromURL(imageDataUrl);
  if (onProgress) onProgress(0.6);

  const inputs = await processor(image, taskPrompt);
  if (onProgress) onProgress(0.75);

  const outputs = await model.generate({ ...inputs, max_new_tokens: 1024 });
  if (onProgress) onProgress(0.9);

  const generatedText = processor.tokenizer.batch_decode(outputs, {
    skip_special_tokens: false,
  })[0];
  const parsed = processor.post_process_generation(generatedText, taskPrompt, [
    image.height,
    image.width,
  ]);
  if (onProgress) onProgress(1.0);

  return parsed[taskPrompt];
}

export async function visionCaption(
  imageDataUrl: string,
  mode: "short" | "normal" | "detailed" = "normal",
  onProgress?: (p: number) => void,
) {
  const task =
    mode === "short"
      ? "<CAPTION>"
      : mode === "detailed"
        ? "<MORE_DETAILED_CAPTION>"
        : "<DETAILED_CAPTION>";
  const result = await runVisionTask(imageDataUrl, task, onProgress);
  return typeof result === "string" ? result : JSON.stringify(result);
}

export async function visionDenseCaption(imageDataUrl: string, onProgress?: (p: number) => void) {
  const result = await runVisionTask(imageDataUrl, "<DENSE_REGION_CAPTION>", onProgress);
  return (
    (result as { labels?: string[]; bboxes?: number[][] }) || {
      labels: [] as string[],
      bboxes: [] as number[][],
    }
  );
}

export async function visionDetect(imageDataUrl: string, onProgress?: (p: number) => void) {
  const result = await runVisionTask(imageDataUrl, "<OD>", onProgress);
  const typed = result as { bboxes?: number[][]; labels?: string[] } | undefined;
  if (!typed?.bboxes)
    return {
      objects: [] as {
        label: string;
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
      }[],
    };

  const { labels, bboxes } = typed;
  const image = await RawImage.fromURL(imageDataUrl);
  const width = image.width;
  const height = image.height;

  const objects = bboxes.map((box: number[], i: number) => ({
    label: labels?.[i] || "object",
    x_min: box[0] / width,
    y_min: box[1] / height,
    x_max: box[2] / width,
    y_max: box[3] / height,
  }));

  return { objects };
}

export async function visionGroundPhrase(
  imageDataUrl: string,
  phrase: string,
  onProgress?: (p: number) => void,
) {
  const task = `<CAPTION_TO_PHRASE_GROUNDING>${phrase}`;
  const result = await runVisionTask(imageDataUrl, task, onProgress);
  const typed = result as { bboxes?: number[][]; labels?: string[] } | undefined;
  if (!typed?.bboxes)
    return {
      objects: [] as {
        label: string;
        x_min: number;
        y_min: number;
        x_max: number;
        y_max: number;
      }[],
    };

  const { labels, bboxes } = typed;
  const image = await RawImage.fromURL(imageDataUrl);
  const width = image.width;
  const height = image.height;

  const objects = bboxes.map((box: number[], i: number) => ({
    label: labels?.[i] || phrase,
    x_min: box[0] / width,
    y_min: box[1] / height,
    x_max: box[2] / width,
    y_max: box[3] / height,
  }));

  return { objects };
}

export async function visionOcr(imageDataUrl: string, onProgress?: (p: number) => void) {
  const result = await runVisionTask(imageDataUrl, "<OCR>", onProgress);
  if (typeof result === "string") return result;
  if (result && (result as { labels?: string[] }).labels)
    return (result as { labels: string[] }).labels.join(" ");
  return String(result);
}

export async function visionOcrWithRegions(imageDataUrl: string, onProgress?: (p: number) => void) {
  return await runVisionTask(imageDataUrl, "<OCR_WITH_REGION>", onProgress);
}

/**
 * Crops a normalized bounding box region [x_min, y_min, x_max, y_max] from an image data URL
 * and returns the cropped sub-image as a PNG data URL along with width & height.
 */
export async function cropImageRegion(
  imageDataUrl: string,
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number },
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const sx = Math.max(0, Math.round(bbox.x_min * naturalW));
      const sy = Math.max(0, Math.round(bbox.y_min * naturalH));
      const sw = Math.min(naturalW - sx, Math.round((bbox.x_max - bbox.x_min) * naturalW));
      const sh = Math.min(naturalH - sy, Math.round((bbox.y_max - bbox.y_min) * naturalH));

      if (sw <= 0 || sh <= 0) {
        resolve({ dataUrl: imageDataUrl, width: naturalW, height: naturalH });
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        width: sw,
        height: sh,
      });
    };
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = imageDataUrl;
  });
}

/** Tighten a transparent crop so extracted objects do not retain empty margins. */
export async function trimTransparentRegion(
  imageDataUrl: string,
  padding = 2,
): Promise<{ dataUrl: string; width: number; height: number; offsetX: number; offsetY: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not inspect transparent crop."));
        return;
      }

      context.drawImage(img, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const bounds = alphaBoundsFromRgba(imageData.data, width, height, 8, padding);
      if (
        !bounds ||
        (bounds.x === 0 && bounds.y === 0 && bounds.width === width && bounds.height === height)
      ) {
        resolve({ dataUrl: imageDataUrl, width, height, offsetX: 0, offsetY: 0 });
        return;
      }

      const trimmed = document.createElement("canvas");
      trimmed.width = bounds.width;
      trimmed.height = bounds.height;
      const trimmedContext = trimmed.getContext("2d");
      if (!trimmedContext) {
        reject(new Error("Could not create transparent crop."));
        return;
      }
      trimmedContext.drawImage(
        canvas,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      resolve({
        dataUrl: trimmed.toDataURL("image/png"),
        width: bounds.width,
        height: bounds.height,
        offsetX: bounds.x,
        offsetY: bounds.y,
      });
    };
    img.onerror = () => reject(new Error("Failed to load transparent crop."));
    img.src = imageDataUrl;
  });
}

/** Crop a foreground image while applying a full-image segmentation mask. */
export async function cropImageRegionWithMask(
  imageDataUrl: string,
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number },
  mask: VisionMask,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const sx = Math.max(0, Math.round(bbox.x_min * naturalW));
      const sy = Math.max(0, Math.round(bbox.y_min * naturalH));
      const sw = Math.min(naturalW - sx, Math.round((bbox.x_max - bbox.x_min) * naturalW));
      const sh = Math.min(naturalH - sy, Math.round((bbox.y_max - bbox.y_min) * naturalH));
      if (sw <= 0 || sh <= 0) {
        resolve({ dataUrl: imageDataUrl, width: naturalW, height: naturalH });
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not get masked crop context"));
        return;
      }
      context.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const pixels = context.getImageData(0, 0, sw, sh);
      for (let y = 0; y < sh; y++) {
        const sourceY = Math.min(mask.height - 1, Math.floor(((sy + y) / naturalH) * mask.height));
        for (let x = 0; x < sw; x++) {
          const sourceX = Math.min(mask.width - 1, Math.floor(((sx + x) / naturalW) * mask.width));
          if (mask.data[sourceY * mask.width + sourceX] === 0) {
            pixels.data[(y * sw + x) * 4 + 3] = 0;
          }
        }
      }
      context.putImageData(pixels, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: sw, height: sh });
    };
    img.onerror = () => reject(new Error("Failed to load image for masked cropping"));
    img.src = imageDataUrl;
  });
}
