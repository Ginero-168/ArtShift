"use client";

import { ensureCloudConsent } from "@/lib/ai/cloudConsent";
import { createImage } from "@/lib/engine/factory";
import { loadDataURL } from "@/lib/engine/imageCache";
import { isInfinityCanvasSlide } from "@/lib/engine/slideKind";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  MOODBOARD_AI_BATCH_COUNT,
  MOODBOARD_AI_CONSENT_PROMPT,
  MOODBOARD_BATCH_USD,
  MOODBOARD_REPLICATE_MODEL,
} from "./constants";
import type { MoodboardExpandPack, MoodboardIdeaPrompt } from "./expandSchema";
import { parseMoodboardExpandJson } from "./expandSchema";
import {
  findMoodboardGridOrigin,
  fitImageInCell,
  moodboardGridCells,
  occupiedRectsFromElements,
} from "./gridPlacement";
import { searchStockPhotos } from "./stock";

export type MoodboardProgressStage = "idle" | "expand" | "generate" | "place" | "stock" | "done";

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
    }
  | { ok: false; message: string; placed?: number; failed?: number; errors?: string[] };

export type MoodboardStockFillResult =
  | { ok: true; placed: number }
  | { ok: false; message: string; placed?: number };

/**
 * Expand ideas → 9 distinct prompts → Replicate flux-schnell ×9 → 3×3 grid.
 * Partial failure is OK: successful images still land on the board.
 */
export async function runMoodboardAiBatch(
  keyword: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: MoodboardProgress) => void;
  } = {},
): Promise<MoodboardAiBatchResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { ok: false, message: "Enter a short prompt, keyword, or vibe." };

  const slide = useEngine.getState().currentSlide();
  if (!slide || !isInfinityCanvasSlide(slide)) {
    return { ok: false, message: "Switch to an Infinity Canvas (Moodboard) slide first." };
  }

  const cloudConsent = ensureCloudConsent(MOODBOARD_AI_CONSENT_PROMPT);
  if (!cloudConsent) {
    return { ok: false, message: "Cloud consent is required for Moodboard AI." };
  }

  const emit = (progress: MoodboardProgress) => options.onProgress?.(progress);

  emit({
    stage: "expand",
    message: "Expanding design ideas…",
    completed: 0,
    failed: 0,
    total: MOODBOARD_AI_BATCH_COUNT,
    errors: [],
  });

  const pack = await expandMoodboardIdeas(trimmed, cloudConsent, options.signal);
  if (!pack.ok) {
    return { ok: false, message: pack.message };
  }

  emit({
    stage: "generate",
    message: `Generating 0/${MOODBOARD_AI_BATCH_COUNT} with ${MOODBOARD_REPLICATE_MODEL}…`,
    completed: 0,
    failed: 0,
    total: MOODBOARD_AI_BATCH_COUNT,
    errors: [],
  });

  const origin = findMoodboardGridOrigin(occupiedRectsFromElements(slide.elements));
  const cells = moodboardGridCells(origin, MOODBOARD_AI_BATCH_COUNT);
  const errors: string[] = [];
  let completed = 0;
  let failed = 0;
  const placedElements: ImageElement[] = [];

  const staggerMs = process.env.NODE_ENV === "test" ? 0 : 400;

  await Promise.all(
    pack.pack.prompts.map(async (idea, offset) => {
      if (options.signal?.aborted) return;
      if (offset > 0 && staggerMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, offset * staggerMs));
      }
      if (options.signal?.aborted) return;

      try {
        const generated = await generateMoodboardImage(idea, cloudConsent, options.signal);
        if (!generated.ok) {
          failed += 1;
          errors.push(`#${idea.index}: ${generated.message}`);
          emit({
            stage: "generate",
            message: `Generating… ${completed} ok · ${failed} failed`,
            completed,
            failed,
            total: MOODBOARD_AI_BATCH_COUNT,
            errors: [...errors],
          });
          return;
        }

        const cached = await loadDataURL(generated.dataUrl);
        const cell = cells[idea.index - 1] ?? cells[offset];
        if (!cell) {
          failed += 1;
          errors.push(`#${idea.index}: missing grid cell`);
          return;
        }
        const fitted = fitImageInCell(cell, cached.width, cached.height);
        placedElements.push(
          createImage({
            ...fitted,
            fileId: cached.fileId,
            naturalWidth: cached.width,
            naturalHeight: cached.height,
            name: `Moodboard ${idea.index}`,
            sourceName: idea.prompt.slice(0, 80),
          }),
        );
        completed += 1;
        emit({
          stage: "generate",
          message: `Generating… ${completed} ok · ${failed} failed`,
          completed,
          failed,
          total: MOODBOARD_AI_BATCH_COUNT,
          errors: [...errors],
        });
      } catch (error) {
        if (options.signal?.aborted || (error as Error).name === "AbortError") return;
        failed += 1;
        errors.push(
          `#${idea.index}: ${error instanceof Error ? error.message : "generation failed"}`,
        );
        emit({
          stage: "generate",
          message: `Generating… ${completed} ok · ${failed} failed`,
          completed,
          failed,
          total: MOODBOARD_AI_BATCH_COUNT,
          errors: [...errors],
        });
      }
    }),
  );

  if (options.signal?.aborted) {
    return { ok: false, message: "Cancelled.", placed: 0, failed, errors };
  }

  if (placedElements.length > 0) {
    emit({
      stage: "place",
      message: `Placing ${placedElements.length} images in a 3×3 grid…`,
      completed,
      failed,
      total: MOODBOARD_AI_BATCH_COUNT,
      errors: [...errors],
    });
    // Upright: createImage defaults angle to 0. Do not touch unrelated artwork.
    useEngine.getState().addElements(placedElements, "moodboard AI 3×3 grid");
    useEngine.getState().selectOnly(placedElements.map((el) => el.id));
  }

  emit({
    stage: "done",
    message:
      placedElements.length > 0
        ? `Placed ${placedElements.length}/${MOODBOARD_AI_BATCH_COUNT} · ~$${MOODBOARD_BATCH_USD} est.`
        : "No images were generated.",
    completed,
    failed,
    total: MOODBOARD_AI_BATCH_COUNT,
    errors: [...errors],
  });

  if (placedElements.length === 0) {
    return {
      ok: false,
      message: errors[0] || "Moodboard AI batch failed.",
      placed: 0,
      failed,
      errors,
    };
  }

  return {
    ok: true,
    placed: placedElements.length,
    failed,
    errors,
    estimatedUsd: Math.round(placedElements.length * 0.003 * 1000) / 1000,
    model: MOODBOARD_REPLICATE_MODEL,
  };
}

/** Existing keyword → stock path (Unsplash / Pexels). Unrelated to Replicate AI. */
export async function runMoodboardStockFill(
  keyword: string,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: MoodboardProgress) => void;
  } = {},
): Promise<MoodboardStockFillResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { ok: false, message: "Enter a keyword for stock search." };

  const slide = useEngine.getState().currentSlide();
  if (!slide || !isInfinityCanvasSlide(slide)) {
    return { ok: false, message: "Switch to an Infinity Canvas (Moodboard) slide first." };
  }

  options.onProgress?.({
    stage: "stock",
    message: "Searching stock photos…",
    completed: 0,
    failed: 0,
    total: MOODBOARD_AI_BATCH_COUNT,
    errors: [],
  });

  const hits = await searchStockPhotos(trimmed, MOODBOARD_AI_BATCH_COUNT);
  if (!hits.length) {
    return { ok: false, message: "No stock photos found for that keyword." };
  }

  const origin = findMoodboardGridOrigin(occupiedRectsFromElements(slide.elements));
  const cells = moodboardGridCells(origin, hits.length);
  const placed: ImageElement[] = [];

  for (let i = 0; i < hits.length; i += 1) {
    if (options.signal?.aborted) break;
    const hit = hits[i];
    const cell = cells[i];
    if (!hit || !cell) continue;
    try {
      const response = await fetch(hit.src, { signal: options.signal });
      if (!response.ok) continue;
      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      const cached = await loadDataURL(dataUrl);
      const fitted = fitImageInCell(cell, cached.width, cached.height);
      placed.push(
        createImage({
          ...fitted,
          fileId: cached.fileId,
          naturalWidth: cached.width,
          naturalHeight: cached.height,
          name: `Stock ${i + 1}`,
          sourceName: hit.credit?.photographer || trimmed,
        }),
      );
      options.onProgress?.({
        stage: "stock",
        message: `Placing stock ${placed.length}/${hits.length}…`,
        completed: placed.length,
        failed: 0,
        total: hits.length,
        errors: [],
      });
    } catch {
      // Partial stock fill is OK.
    }
  }

  if (!placed.length) {
    return { ok: false, message: "Could not load stock images." };
  }

  useEngine.getState().addElements(placed, "moodboard stock fill");
  useEngine.getState().selectOnly(placed.map((el) => el.id));
  options.onProgress?.({
    stage: "done",
    message: `Placed ${placed.length} stock images.`,
    completed: placed.length,
    failed: 0,
    total: hits.length,
    errors: [],
  });
  return { ok: true, placed: placed.length };
}

async function expandMoodboardIdeas(
  keyword: string,
  cloudConsent: boolean,
  signal?: AbortSignal,
): Promise<{ ok: true; pack: MoodboardExpandPack } | { ok: false; message: string }> {
  const response = await fetch("/api/moodboard/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, cloudConsent }),
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
  const parsed = parseMoodboardExpandJson(isRecord(payload) ? (payload.pack ?? payload) : payload);
  if (!parsed.ok) return { ok: false, message: parsed.reason };
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(blob);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
