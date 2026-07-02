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
