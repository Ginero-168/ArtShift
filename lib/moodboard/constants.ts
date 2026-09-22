/** Supported Moodboard AI batch sizes. Each count is a square grid. */
export const MOODBOARD_BATCH_COUNTS = [9, 16, 25] as const;

export type MoodboardBatchCount = (typeof MOODBOARD_BATCH_COUNTS)[number];

/** Default when the user has not picked a count: 9 images, 3×3. */
export const MOODBOARD_DEFAULT_BATCH_COUNT = 9 satisfies MoodboardBatchCount;

/** @see MOODBOARD_DEFAULT_BATCH_COUNT */
export const MOODBOARD_AI_BATCH_COUNT = MOODBOARD_DEFAULT_BATCH_COUNT;

export const MOODBOARD_GRID_COLS = 3 as const;
export const MOODBOARD_GRID_ROWS = 3 as const;

/** Display cell size on the Infinity Canvas (images stay upright). */
export const MOODBOARD_CELL_SIZE = 320;

export const MOODBOARD_CELL_GAP = 24;

/**
 * Official Replicate model for Moodboard AI batches.
 * `openai/gpt-image-2.5-flare` at `quality: "medium"` (~$0.047 / image).
 * A 9-pack is ~$0.42 (9 × $0.047 = $0.423). 16 ≈ $0.75. 25 ≈ $1.18.
 * Schnell was rejected for quality. Recraft v3 was not adopted.
 * Do not substitute Ideogram / FLUX Pro / Imagen Ultra / Sunburst / GPT Image 2 as this default.
 * Chat image generation stays on Sunburst; this alias is Moodboard-only.
 */
export const MOODBOARD_REPLICATE_MODEL = "openai/gpt-image-2.5-flare";
export const MOODBOARD_REPLICATE_MODEL_ALIAS = "gpt-image-2.5-flare";

/** Locked provider quality. Schema default is `auto`, which is not a stable price. */
export const MOODBOARD_IMAGE_QUALITY = "medium" as const;

/** Square cells. Flare's schema default is already `1:1`; we send it explicitly. */
export const MOODBOARD_ASPECT_RATIO = "1:1" as const;

export const MOODBOARD_PER_IMAGE_USD = 0.047;

export function isMoodboardBatchCount(value: unknown): value is MoodboardBatchCount {
  return value === 9 || value === 16 || value === 25;
}

/** Square side length: 9 → 3, 16 → 4, 25 → 5. */
export function moodboardGridSide(count: MoodboardBatchCount): 3 | 4 | 5 {
  if (count === 16) return 4;
  if (count === 25) return 5;
  return 3;
}

/** Exact estimate in USD, rounded to the nearest tenth of a cent (9 → 0.423). */
export function moodboardBatchUsd(count: MoodboardBatchCount): number {
  return Math.round(MOODBOARD_PER_IMAGE_USD * count * 1000) / 1000;
}

/** Default 9-pack estimate ($0.423). User-facing copy may round this to ~$0.42. */
export const MOODBOARD_BATCH_USD = moodboardBatchUsd(MOODBOARD_DEFAULT_BATCH_COUNT);

export function moodboardAiConsentPrompt(count: MoodboardBatchCount): string {
  const side = moodboardGridSide(count);
  const batch = moodboardBatchUsd(count).toFixed(2);
  return `Moodboard AI จะ:
1) ขยายคำค้น/ไวบ์ด้วย Gemini Flash เป็น ${count} ทิศทางภาพที่ต่างกัน (Subject / Setting / Prop / Mood / Color style) — ไม่ใช่คัดลอกคำค้น ${count} ครั้ง
2) สร้าง ${count} ภาพผ่าน Replicate ${MOODBOARD_REPLICATE_MODEL} ที่ quality medium (~$${MOODBOARD_PER_IMAGE_USD}/ภาพ ≈ ~$${batch} ต่อชุด ${side}×${side})

ใช้คีย์ Replicate ของบัญชีคุณ (BYOK) สำหรับขั้นสร้างภาพ อนุญาตให้ส่งคำค้นออกนอกเครื่องในเซสชันนี้หรือไม่?`;
}

export const MOODBOARD_AI_CONSENT_PROMPT = moodboardAiConsentPrompt(MOODBOARD_DEFAULT_BATCH_COUNT);
