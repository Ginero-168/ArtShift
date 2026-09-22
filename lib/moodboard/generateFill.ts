import {
  MOODBOARD_GENERATE_CONCURRENCY,
  MOODBOARD_GENERATE_MAX_COST_USD,
  MOODBOARD_IMAGE_COUNT,
  MOODBOARD_IMAGE_HEIGHT,
  MOODBOARD_IMAGE_MODEL_ALIAS,
  MOODBOARD_IMAGE_WIDTH,
} from "./constants";
import type { MoodboardImagePrompt } from "./expandSchema";

export type MoodboardGeneratedImage = {
  index: number;
  label: string;
  role: string;
  prompt: string;
  dataUrl: string;
  width: number;
  height: number;
};

export type MoodboardGenerateFailure = {
  index: number;
  label: string;
  prompt: string;
  message: string;
};

export type MoodboardGenerateBatchResult = {
  images: MoodboardGeneratedImage[];
  failures: MoodboardGenerateFailure[];
};

export type MoodboardGenerateOneFn = (input: {
  prompt: string;
  signal?: AbortSignal;
}) => Promise<{ dataUrl: string; width: number; height: number }>;

/**
 * Generate up to 9 images (one per expanded prompt). Partial failures are
 * collected; successful images still return so the board can place what worked.
 */
export async function generateMoodboardImages(
  prompts: MoodboardImagePrompt[],
  options: {
    generateOne: MoodboardGenerateOneFn;
    concurrency?: number;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<MoodboardGenerateBatchResult> {
  const selected = prompts.slice(0, MOODBOARD_IMAGE_COUNT);
  const total = selected.length;
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? MOODBOARD_GENERATE_CONCURRENCY, total),
  );
  const images: MoodboardGeneratedImage[] = [];
  const failures: MoodboardGenerateFailure[] = [];
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < total) {
      if (options.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const index = cursor;
      cursor += 1;
      const item = selected[index];
      if (!item) continue;
      try {
        const result = await options.generateOne({
          prompt: item.prompt,
          signal: options.signal,
        });
        images.push({
          index,
          label: item.label,
          role: item.role,
          prompt: item.prompt,
          dataUrl: result.dataUrl,
          width: result.width,
          height: result.height,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        failures.push({
          index,
          label: item.label,
          prompt: item.prompt,
          message: error instanceof Error ? error.message : "Image generation failed.",
        });
      } finally {
        done += 1;
        options.onProgress?.(done, total);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  images.sort((a, b) => a.index - b.index);
  failures.sort((a, b) => a.index - b.index);
  return { images, failures };
}

/** POST /api/moodboard/generate — one flux-schnell image per call. */
export async function requestMoodboardImageGeneration(input: {
  prompt: string;
  cloudConsent: true;
  signal?: AbortSignal;
}): Promise<{ dataUrl: string; width: number; height: number; model?: string }> {
  const response = await fetch("/api/moodboard/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      cloudConsent: true,
      width: MOODBOARD_IMAGE_WIDTH,
      height: MOODBOARD_IMAGE_HEIGHT,
      modelAlias: MOODBOARD_IMAGE_MODEL_ALIAS,
      maxCostUsd: MOODBOARD_GENERATE_MAX_COST_USD,
    }),
    signal: input.signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Moodboard generate returned an invalid response.");
  }

  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const error = isRecord(record.error) ? record.error : record;
    const message =
      (typeof error.message === "string" && error.message) ||
      (typeof error.error === "string" && error.error) ||
      "Moodboard image generation failed.";
    throw new Error(message);
  }

  const execution = isRecord(payload) ? payload.execution : null;
  const output = isRecord(execution) ? execution.output : isRecord(payload) ? payload.output : null;
  const dataUrl = isRecord(output) && typeof output.dataUrl === "string" ? output.dataUrl : null;
  if (!dataUrl) {
    throw new Error("Moodboard generate returned no image.");
  }
  const width =
    isRecord(output) && typeof output.width === "number" && output.width > 0
      ? output.width
      : MOODBOARD_IMAGE_WIDTH;
  const height =
    isRecord(output) && typeof output.height === "number" && output.height > 0
      ? output.height
      : MOODBOARD_IMAGE_HEIGHT;
  const model =
    isRecord(execution) &&
    isRecord(execution.metadata) &&
    typeof execution.metadata.model === "string"
      ? execution.metadata.model
      : undefined;
  return { dataUrl, width, height, model };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
