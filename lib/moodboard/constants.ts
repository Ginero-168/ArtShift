/** Exactly nine AI images per Moodboard batch (3×3 grid). */
export const MOODBOARD_AI_BATCH_COUNT = 9 as const;

export const MOODBOARD_GRID_COLS = 3 as const;
export const MOODBOARD_GRID_ROWS = 3 as const;

/** Display cell size on the Infinity Canvas (images stay upright). */
export const MOODBOARD_CELL_SIZE = 320;

export const MOODBOARD_CELL_GAP = 24;

/**
 * Official Replicate model for Moodboard AI batches.
 * ~$0.003 / image ≈ $0.027 per 9-pack (OK quality, hard cost ceiling).
 * Do not substitute Ideogram / FLUX Pro / Imagen Ultra / GPT Image as the default.
 */
export const MOODBOARD_REPLICATE_MODEL = "black-forest-labs/flux-schnell";
export const MOODBOARD_REPLICATE_MODEL_ALIAS = "flux-schnell";

export const MOODBOARD_PER_IMAGE_USD = 0.003;
export const MOODBOARD_BATCH_USD =
  Math.round(MOODBOARD_PER_IMAGE_USD * MOODBOARD_AI_BATCH_COUNT * 1000) / 1000;

export const MOODBOARD_AI_CONSENT_PROMPT = `Moodboard AI จะ:
1) ขยายคำค้น/ไวบ์ด้วย Gemini Flash เป็น 9 ทิศทางภาพที่ต่างกัน (Subject / Setting / Prop / Mood / Color style) — ไม่ใช่คัดลอกคำค้น 9 ครั้ง
2) สร้าง 9 ภาพผ่าน Replicate ${MOODBOARD_REPLICATE_MODEL} (~$${MOODBOARD_PER_IMAGE_USD}/ภาพ ≈ ~$${MOODBOARD_BATCH_USD} ต่อชุด)

ใช้คีย์ Replicate ของบัญชีคุณ (BYOK) สำหรับขั้นสร้างภาพ อนุญาตให้ส่งคำค้นออกนอกเครื่องในเซสชันนี้หรือไม่?`;
