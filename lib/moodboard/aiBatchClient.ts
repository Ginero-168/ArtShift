"use client";

import { ensureCloudConsent } from "@/lib/ai/cloudConsent";
import { getCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { loadDataURL } from "@/lib/engine/imageCache";
import { getProcessingPreviewPlacement } from "@/lib/engine/processingPreview";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { isInfinityCanvasSlide } from "@/lib/engine/slideKind";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  isMoodboardBatchCount,
  MOODBOARD_DEFAULT_BATCH_COUNT,
  MOODBOARD_PER_IMAGE_USD,
  MOODBOARD_REPLICATE_MODEL,
  type MoodboardBatchCount,
  moodboardAiConsentPrompt,
  moodboardBatchUsd,
  moodboardGridSide,
} from "./constants";
import type { MoodboardExpandPack, MoodboardIdeaPrompt } from "./expandSchema";
import { parseMoodboardExpandJson } from "./expandSchema";
import { fitImageInCell, moodboardGridCells, occupiedRectsFromElements } from "./gridPlacement";
import { resolveMoodboardPreloadBounds } from "./preloadPlacement";

export type MoodboardProgressStage = "idle" | "expand" | "generate" | "place" | "done";

export type MoodboardProgress = {
  stage: MoodboardProgressStage;
  message: string;
  completed: number;
  failed: number;
  total: number;
  errors: string[];
};

export type MoodboardAiBatchResult =
  | {
      ok: true;
      placed: number;
      failed: number;
      errors: string[];
      estimatedUsd: number;
      model: string;
      count: MoodboardBatchCount;
    }
  | { ok: false; message: string; placed?: number; failed?: number; errors?: string[] };

/**
 * Expand ideas → N distinct prompts → Replicate gpt-image-2.5-flare ×N → N×N grid.
 * The grid is anchored on a draggable Preload card (same placement helper as
 * Upscale, Remove BG, Extract, and Layer). Partial failure still lands successes.
 */
export async function runMoodboardAiBatch(
  keyword: string,
  options: {
    count?: MoodboardBatchCount;
    signal?: AbortSignal;
    onProgress?: (progress: MoodboardProgress) => void;
  } = {},
): Promise<MoodboardAiBatchResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { ok: false, message: "Enter a short prompt, keyword, or vibe." };

  const count = isMoodboardBatchCount(options.count)
    ? options.count
    : MOODBOARD_DEFAULT_BATCH_COUNT;
  const side = moodboardGridSide(count);

  const slide = useEngine.getState().currentSlide();
  if (!slide || !isInfinityCanvasSlide(slide)) {
    return { ok: false, message: "Switch to an Infinity Canvas (Moodboard) slide first." };
  }

  const cloudConsent = ensureCloudConsent(moodboardAiConsentPrompt(count));
  if (!cloudConsent) {
    return { ok: false, message: "Cloud consent is required for Moodboard AI." };
  }

  const selectedId = [...useEngine.getState().selectedIds][0];
  const selectedElement = selectedId
    ? slide.elements.find((element) => element.id === selectedId && !element.isDeleted)
    : undefined;
  const initialBounds = resolveMoodboardPreloadBounds({
    count,
    occupied: occupiedRectsFromElements(slide.elements),
    selected: selectedElement
      ? {
          x: selectedElement.x,
          y: selectedElement.y,
          width: selectedElement.width,
          height: selectedElement.height,
        }
      : null,
    viewport: getCanvasViewport(),
  });

  const emit = (progress: MoodboardProgress) => options.onProgress?.(progress);
  let result: MoodboardAiBatchResult = {
    ok: false,
    message: "Moodboard AI batch failed.",
  };

  const job = enqueueProcessingJob({
    signal: options.signal,
    concurrent: true,
    preview: {
      kind: "generate",
      label: `Moodboard ${side}×${side}`,
      x: initialBounds.x,
      y: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      progress: 0.04,
      phase: "analyzing",
      message: "Expanding design ideas…",
    },
    run: async (context) => {
      emit({
        stage: "expand",
        message: "Expanding design ideas…",
        completed: 0,
        failed: 0,
        total: count,
        errors: [],
      });

      const pack = await expandMoodboardIdeas(trimmed, count, cloudConsent, context.signal);
      if (!pack.ok) {
        result = { ok: false, message: pack.message };
        throw new Error(pack.message);
      }
      if (context.signal.aborted) {
        result = { ok: false, message: "Cancelled." };
        return;
      }

      context.update({
        phase: "generating",
        progress: 0.12,
        message: `Generating 0/${count} with ${MOODBOARD_REPLICATE_MODEL}…`,
      });
      emit({
        stage: "generate",
        message: `Generating 0/${count} with ${MOODBOARD_REPLICATE_MODEL}…`,
        completed: 0,
        failed: 0,
        total: count,
        errors: [],
      });

      const errors: string[] = [];
      let completed = 0;
      let failed = 0;
      const pending: Array<{
        slot: number;
        naturalWidth: number;
        naturalHeight: number;
        fileId: string;
        name: string;
        sourceName: string;
      }> = [];
      const staggerMs = process.env.NODE_ENV === "test" ? 0 : 400;

      await Promise.all(
        pack.pack.prompts.map(async (idea, offset) => {
          if (context.signal.aborted) return;
          if (offset > 0 && staggerMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, offset * staggerMs));
          }
          if (context.signal.aborted) return;

          try {
            const generated = await generateMoodboardImage(idea, cloudConsent, context.signal);
            if (!generated.ok) {
              failed += 1;
              errors.push(`#${idea.index}: ${generated.message}`);
              reportGenerate(context, emit, count, completed, failed, errors);
              return;
            }

            const cached = await loadDataURL(generated.dataUrl);
            pending.push({
              slot: idea.index - 1,
              naturalWidth: cached.width,
              naturalHeight: cached.height,
              fileId: cached.fileId,
              name: `Moodboard ${idea.index}`,
              sourceName: idea.prompt.slice(0, 80),
            });
            completed += 1;
            reportGenerate(context, emit, count, completed, failed, errors);
          } catch (error) {
            if (context.signal.aborted || (error as Error).name === "AbortError") return;
            failed += 1;
            errors.push(
              `#${idea.index}: ${error instanceof Error ? error.message : "generation failed"}`,
            );
            reportGenerate(context, emit, count, completed, failed, errors);
          }
        }),
      );

      if (context.signal.aborted) {
        result = { ok: false, message: "Cancelled.", placed: 0, failed, errors };
        return;
      }

      if (pending.length === 0) {
        result = {
          ok: false,
          message: errors[0] || "Moodboard AI batch failed.",
          placed: 0,
          failed,
          errors,
        };
        throw new Error(result.message);
      }

      // Read the Preload card inside the job. The queue clears it when run returns,
      // which would drop a user drag and fall back to the original anchor.
      const anchor = getProcessingPreviewPlacement(context.id, initialBounds);
      const cells = moodboardGridCells({ x: anchor.x, y: anchor.y }, count, { cols: side });
      const positioned: ImageElement[] = [];
      for (const item of pending) {
        const cell = cells[item.slot] ?? cells[0];
        if (!cell) continue;
        const fitted = fitImageInCell(cell, item.naturalWidth, item.naturalHeight);
        positioned.push(
          createImage({
            ...fitted,
            fileId: item.fileId,
            naturalWidth: item.naturalWidth,
            naturalHeight: item.naturalHeight,
            name: item.name,
            sourceName: item.sourceName,
          }),
        );
      }

      context.update({
        phase: "committing",
        progress: 0.96,
        message: `Placing ${positioned.length} images in a ${side}×${side} grid…`,
      });
      emit({
        stage: "place",
        message: `Placing ${positioned.length} images in a ${side}×${side} grid…`,
        completed,
        failed,
        total: count,
        errors: [...errors],
      });

      useEngine.getState().addElements(positioned, `moodboard AI ${side}×${side} grid`);
      useEngine.getState().selectOnly(positioned.map((el) => el.id));

      const estimatedUsd = Math.round(positioned.length * MOODBOARD_PER_IMAGE_USD * 1000) / 1000;
      emit({
        stage: "done",
        message: `Placed ${positioned.length}/${count} · ~$${moodboardBatchUsd(count).toFixed(2)} est.`,
        completed,
        failed,
        total: count,
        errors: [...errors],
      });
      result = {
        ok: true,
        placed: positioned.length,
        failed,
        errors,
        estimatedUsd,
        model: MOODBOARD_REPLICATE_MODEL,
        count,
      };
    },
  });

  try {
    await job.promise;
    if (options.signal?.aborted) {
      return { ok: false, message: "Cancelled." };
    }
    return result;
  } catch (error) {
    if (options.signal?.aborted || (error as Error).name === "AbortError") {
      return { ok: false, message: "Cancelled." };
    }
    if (!result.ok) return result;
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Moodboard AI batch failed.",
    };
  }
}

function reportGenerate(
  context: { update: (patch: { progress: number; message: string; phase: "generating" }) => void },
  emit: (progress: MoodboardProgress) => void,
  count: MoodboardBatchCount,
  completed: number,
  failed: number,
  errors: string[],
) {
  const ratio = Math.min(1, (completed + failed) / count);
  context.update({
    phase: "generating",
    progress: 0.12 + ratio * 0.8,
    message: `Generating… ${completed} ok · ${failed} failed`,
  });
  emit({
    stage: "generate",
    message: `Generating… ${completed} ok · ${failed} failed`,
    completed,
    failed,
    total: count,
    errors: [...errors],
  });
}

async function expandMoodboardIdeas(
  keyword: string,
  count: MoodboardBatchCount,
  cloudConsent: boolean,
  signal?: AbortSignal,
): Promise<{ ok: true; pack: MoodboardExpandPack } | { ok: false; message: string }> {
  const response = await fetch("/api/moodboard/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, count, cloudConsent }),
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: "Moodboard expand returned an invalid response." };
  }
  if (!response.ok) {
    return { ok: false, message: extractErrorMessage(payload, "Moodboard expand failed.") };
  }
  const parsed = parseMoodboardExpandJson(
    isRecord(payload) ? (payload.pack ?? payload) : payload,
    count,
  );
  if (!parsed.ok) return { ok: false, message: parsed.reason };
  if (parsed.pack.prompts.length !== count) {
    return {
      ok: false,
      message: `Expand returned ${parsed.pack.prompts.length} ideas, expected ${count}.`,
    };
  }
  return { ok: true, pack: parsed.pack };
}

async function generateMoodboardImage(
  idea: MoodboardIdeaPrompt,
  cloudConsent: boolean,
  signal?: AbortSignal,
): Promise<{ ok: true; dataUrl: string } | { ok: false; message: string }> {
  const response = await fetch("/api/moodboard/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: idea.prompt,
      index: idea.index,
      cloudConsent,
    }),
    signal,
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, message: "Invalid generate response." };
  }
  if (!response.ok) {
    return { ok: false, message: extractErrorMessage(payload, "Generate failed.") };
  }
  const dataUrl = isRecord(payload) ? payload.dataUrl : null;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return { ok: false, message: "Generate returned no image." };
  }
  return { ok: true, dataUrl };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  const error = isRecord(payload.error) ? payload.error : payload;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error === "string" && error.error.trim()) return error.error;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
