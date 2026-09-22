"use client";

import { ensureCloudConsent } from "@/lib/ai/cloudConsent";
import { getCanvasViewport } from "@/lib/engine/canvasViewport";
import { createImage } from "@/lib/engine/factory";
import { getVisibleWorldBounds } from "@/lib/engine/generationPlacement";
import { loadDataURL } from "@/lib/engine/imageCache";
import { clearProcessingPreview } from "@/lib/engine/processingPreview";
import { enqueueProcessingJob } from "@/lib/engine/processingQueue";
import { isInfinityCanvasSlide } from "@/lib/engine/slideKind";
import { useEngine } from "@/lib/engine/store";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import {
  MOODBOARD_CELL_SIZE,
  MOODBOARD_GENERATE_CONCURRENCY,
  MOODBOARD_GRID_GAP,
  MOODBOARD_IMAGE_COUNT,
} from "./constants";
import { MOODBOARD_CLOUD_CONSENT_PROMPT } from "./expandPrompt";
import { type MoodboardExpandPack, parseMoodboardExpandJson } from "./expandSchema";
import { generateMoodboardImages, requestMoodboardImageGeneration } from "./generateFill";
import { layoutMoodboard3x3 } from "./layoutGrid";
import { findMoodboardStagingOrigin } from "./stagingOrigin";

export type MoodboardExpandClientResult =
  | {
      ok: true;
      placedCount: number;
      failedCount: number;
      pack: MoodboardExpandPack;
    }
  | { ok: false; message: string };

/**
 * Infinity Canvas / Moodboard: keyword → LLM expand → 9 Replicate images → 3×3 grid.
 * Stock / Unsplash paths stay untouched.
 */
export async function expandIdeasOntoMoodboard(
  keyword: string,
  options: { signal?: AbortSignal } = {},
): Promise<MoodboardExpandClientResult> {
  const trimmed = keyword.trim();
  if (!trimmed) return { ok: false, message: "ใส่คำค้นหรือ vibe สั้นๆ ก่อนขยายไอเดีย" };

  const slide = useEngine.getState().currentSlide();
  if (!slide || !isInfinityCanvasSlide(slide)) {
    return {
      ok: false,
      message: "สลับไป Infinity Canvas (Moodboard) ก่อน แล้วค่อยขยายไอเดีย",
    };
  }

  const cloudConsent = ensureCloudConsent(MOODBOARD_CLOUD_CONSENT_PROMPT);
  if (!cloudConsent) {
    return { ok: false, message: "ต้องอนุญาต cloud AI ก่อนขยายไอเดียบน Moodboard" };
  }

  const viewport = getCanvasViewport();
  const visible = viewport ? getVisibleWorldBounds(viewport) : null;
  const existing = slide.elements
    .filter((el) => !el.isDeleted)
    .map((el) => ({ x: el.x, y: el.y, width: el.width, height: el.height }));
  const origin = findMoodboardStagingOrigin(existing, visible);
  const layout = layoutMoodboard3x3(origin, {
    cellWidth: MOODBOARD_CELL_SIZE,
    cellHeight: MOODBOARD_CELL_SIZE,
    gap: MOODBOARD_GRID_GAP,
  });

  const resultHolder: { current: MoodboardExpandClientResult | null } = { current: null };

  const job = enqueueProcessingJob({
    signal: options.signal,
    concurrent: true,
    preview: {
      kind: "generate",
      label: "Moodboard · 9 images",
      x: layout.bounds.x,
      y: layout.bounds.y,
      width: layout.bounds.width,
      height: layout.bounds.height,
      progress: 0,
      message: "กำลังขยายไอเดียสำหรับดีไซเนอร์…",
      phase: "analyzing",
    },
    run: async (context) => {
      context.update({
        progress: 0.05,
        message: "กำลังขยายไอเดีย (Subject / Setting / Prop / Mood / Color)…",
        phase: "analyzing",
      });

      const pack = await requestMoodboardExpand(trimmed, context.signal);
      context.update({
        progress: 0.2,
        message: `ได้ ${pack.imagePrompts.length} ทิศทาง — กำลังสร้างภาพผ่าน Replicate…`,
        phase: "generating",
      });

      const batch = await generateMoodboardImages(pack.imagePrompts, {
        concurrency: MOODBOARD_GENERATE_CONCURRENCY,
        signal: context.signal,
        generateOne: async ({ prompt, signal }) =>
          requestMoodboardImageGeneration({ prompt, cloudConsent: true, signal }),
        onProgress: (done, total) => {
          const ratio = 0.2 + (done / Math.max(1, total)) * 0.7;
          context.update({
            progress: Math.min(0.9, ratio),
            message: `สร้างภาพ Moodboard ${done}/${total}…`,
            phase: "generating",
          });
        },
      });

      if (batch.images.length === 0) {
        const first = batch.failures[0]?.message ?? "สร้างภาพ Moodboard ไม่สำเร็จ";
        throw new Error(first);
      }

      context.update({
        progress: 0.92,
        message: `วางภาพ ${batch.images.length} ใบลงบนบอร์ด…`,
        phase: "committing",
      });

      const elements = [];
      for (const image of batch.images) {
        if (context.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const cell = layout.cells[image.index];
        if (!cell) continue;
        const cached = await loadDataURL(image.dataUrl);
        const name = image.label || `Moodboard ${image.index + 1}`;
        elements.push({
          ...createImage({
            x: cell.x,
            y: cell.y,
            width: cell.width,
            height: cell.height,
            ...createCachedImageAsset(cached),
            name,
            sourceName: name,
          }),
          // Upright only — never inherit tilted scrapbook aesthetics.
          angle: 0,
        });
      }

      if (elements.length === 0) {
        throw new Error("ไม่มีภาพที่วางบน Moodboard ได้");
      }

      useEngine.getState().addElements(elements, "moodboard expand ideas 3x3");
      useEngine.getState().selectOnly(elements.map((el) => el.id));

      context.update({
        progress: 1,
        message:
          batch.failures.length > 0
            ? `วาง ${elements.length}/${MOODBOARD_IMAGE_COUNT} ภาพ (บางใบล้มเหลว)`
            : `วางภาพ Moodboard ${elements.length} ใบแล้ว`,
        phase: "committing",
      });

      resultHolder.current = {
        ok: true,
        placedCount: elements.length,
        failedCount: batch.failures.length,
        pack,
      };
    },
  });

  try {
    await job.promise;
    clearProcessingPreview(job.id);
    if (resultHolder.current?.ok) return resultHolder.current;
    return { ok: false, message: "Moodboard expand ไม่สำเร็จ" };
  } catch (error) {
    clearProcessingPreview(job.id);
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return { ok: false, message: "ยกเลิกการขยายไอเดีย Moodboard แล้ว" };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Moodboard expand ไม่สำเร็จ",
    };
  }
}

async function requestMoodboardExpand(
  keyword: string,
  signal?: AbortSignal,
): Promise<MoodboardExpandPack> {
  const response = await fetch("/api/moodboard/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keyword, cloudConsent: true }),
    signal,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Moodboard expand returned an invalid response.");
  }

  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    const error = isRecord(record.error) ? record.error : record;
    const message =
      (typeof error.message === "string" && error.message) ||
      (typeof error.error === "string" && error.error) ||
      "Moodboard expand failed.";
    throw new Error(message);
  }

  const parsed = parseMoodboardExpandJson(isRecord(payload) ? (payload.pack ?? payload) : payload);
  if (!parsed.ok) throw new Error(parsed.reason);
  if (parsed.pack.imagePrompts.length !== MOODBOARD_IMAGE_COUNT) {
    throw new Error(`Expand must return exactly ${MOODBOARD_IMAGE_COUNT} image prompts.`);
  }
  return parsed.pack;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
