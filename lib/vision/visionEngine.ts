/**
 * Vision Engine — Local Florence-2 for browser-based image understanding.
 * 100% client-side: captioning, OCR, object detection, dense region captioning,
 * and phrase grounding. No images leave the browser.
 */

import type { VisionMask } from "./advancedVision";
import { alphaBoundsFromRgba } from "./foreground";
import { composeInstanceAlpha } from "./instanceMask";
import type { VisionObjectBox } from "./objectBoxes";
import { executeVisionTaskInWorker } from "./visionWorkerClient";
import type { VisionWorkerProgressStage } from "./visionWorkerProtocol";

type VisionProgressCallback = (progress: number, stage?: VisionWorkerProgressStage) => void;

async function runVisionTask(
  imageDataUrl: string,
  taskPrompt: string,
  onProgress?: VisionProgressCallback,
) {
  return executeVisionTaskInWorker(imageDataUrl, taskPrompt, {
    onProgress: (progress, stage) => onProgress?.(progress, stage),
  });
}

export async function visionCaption(
  imageDataUrl: string,
  mode: "short" | "normal" | "detailed" = "normal",
  onProgress?: VisionProgressCallback,
) {
  const task =
    mode === "short"
      ? "<CAPTION>"
      : mode === "detailed"
        ? "<MORE_DETAILED_CAPTION>"
        : "<DETAILED_CAPTION>";
  const { output } = await runVisionTask(imageDataUrl, task, onProgress);
  return typeof output === "string" ? output : JSON.stringify(output);
}

export async function visionDenseCaption(
  imageDataUrl: string,
  onProgress?: VisionProgressCallback,
) {
  const { output } = await runVisionTask(imageDataUrl, "<DENSE_REGION_CAPTION>", onProgress);
  return (
    (output as { labels?: string[]; bboxes?: number[][] }) || {
      labels: [] as string[],
      bboxes: [] as number[][],
    }
  );
}

export async function visionDetect(imageDataUrl: string, onProgress?: VisionProgressCallback) {
  const result = await runVisionTask(imageDataUrl, "<OD>", onProgress);
  return { objects: normalizeVisionObjects(result.output, result.width, result.height) };
}

/** Dense-region recall pass used only when foreground geometry outnumbers OD. */
export async function visionDenseDetect(imageDataUrl: string, onProgress?: VisionProgressCallback) {
  const result = await runVisionTask(imageDataUrl, "<DENSE_REGION_CAPTION>", onProgress);
  return { objects: normalizeVisionObjects(result.output, result.width, result.height) };
}

function normalizeVisionObjects(
  result: unknown,
  width: number,
  height: number,
  fallbackLabel = "object",
): VisionObjectBox[] {
  const typed = result as { bboxes?: number[][]; labels?: string[] } | undefined;
  if (!typed?.bboxes) return [];
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  return typed.bboxes.flatMap((box: number[], index: number) => {
    if (box.length < 4 || !box.slice(0, 4).every(Number.isFinite)) return [];
    return [
      {
        label: typed.labels?.[index] || fallbackLabel,
        x_min: box[0] / safeWidth,
        y_min: box[1] / safeHeight,
        x_max: box[2] / safeWidth,
        y_max: box[3] / safeHeight,
      },
    ];
  });
}

export async function visionGroundPhrase(
  imageDataUrl: string,
  phrase: string,
  onProgress?: VisionProgressCallback,
) {
  const task = `<CAPTION_TO_PHRASE_GROUNDING>${phrase}`;
  const result = await runVisionTask(imageDataUrl, task, onProgress);
  const typed = result.output as { bboxes?: number[][]; labels?: string[] } | undefined;
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
  const objects = bboxes.map((box: number[], i: number) => ({
    label: labels?.[i] || phrase,
    x_min: box[0] / Math.max(1, result.width),
    y_min: box[1] / Math.max(1, result.height),
    x_max: box[2] / Math.max(1, result.width),
    y_max: box[3] / Math.max(1, result.height),
  }));

  return { objects };
}

export async function visionOcr(imageDataUrl: string, onProgress?: VisionProgressCallback) {
  const { output } = await runVisionTask(imageDataUrl, "<OCR>", onProgress);
  if (typeof output === "string") return output;
  if (output && (output as { labels?: string[] }).labels)
    return (output as { labels: string[] }).labels.join(" ");
  return String(output);
}

export async function visionOcrWithRegions(
  imageDataUrl: string,
  onProgress?: VisionProgressCallback,
) {
  const { output } = await runVisionTask(imageDataUrl, "<OCR_WITH_REGION>", onProgress);
  return output;
}

/** Release the cached Florence runtime without deleting downloaded model files. */
export async function releaseVisionRuntime(): Promise<void> {
  const { releaseModelRuntime } = await import("@/lib/ai/modelRegistry");
  await releaseModelRuntime("florence-2");
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
  options: { preserveExistingAlpha?: boolean } = {},
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
      const sourceAlpha = new Uint8ClampedArray(sw * sh);
      const refinementMask = new Uint8ClampedArray(sw * sh);
      for (let y = 0; y < sh; y++) {
        const sourceY = Math.min(mask.height - 1, Math.floor(((sy + y) / naturalH) * mask.height));
        for (let x = 0; x < sw; x++) {
          const sourceX = Math.min(mask.width - 1, Math.floor(((sx + x) / naturalW) * mask.width));
          const pixelOffset = (y * sw + x) * 4;
          sourceAlpha[y * sw + x] = pixels.data[pixelOffset + 3];
          refinementMask[y * sw + x] = mask.data[sourceY * mask.width + sourceX] > 0 ? 255 : 0;
        }
      }
      const composedAlpha = composeInstanceAlpha(sourceAlpha, refinementMask, {
        preserveSourceAlpha: options.preserveExistingAlpha ?? true,
      });
      for (let index = 0; index < composedAlpha.length; index++) {
        pixels.data[index * 4 + 3] = composedAlpha[index];
      }
      context.putImageData(pixels, 0, 0);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: sw, height: sh });
    };
    img.onerror = () => reject(new Error("Failed to load image for masked cropping"));
    img.src = imageDataUrl;
  });
}
