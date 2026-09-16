/**
 * Print-size helpers for generation → optional Upscale follow-up.
 * Generation locks aspect; Upscale (Pruna target megapixels) preserves that ratio.
 */

export type PhysicalPrintSizeCm = {
  widthCm: number;
  heightCm: number;
};

/** Detect explicit physical print size like 60x20cm / 60 x 20 ซม. */
export function extractPhysicalPrintSizeCm(text?: string): PhysicalPrintSizeCm | null {
  if (!text) return null;
  const match =
    /(?:ขนาด\s*)?(\d+(?:\.\d+)?)\s*(?:x|×|by)\s*(\d+(?:\.\d+)?)\s*(?:cm|ซม\.?|ซม)/iu.exec(
      text,
    );
  if (!match) return null;
  const widthCm = Number(match[1]);
  const heightCm = Number(match[2]);
  if (!(widthCm > 0 && heightCm > 0)) return null;
  return { widthCm, heightCm };
}

/** Approximate DPI when printing `outputWidthPx` across `widthCm`. */
export function estimatePrintDpi(outputWidthPx: number, widthCm: number): number {
  const inches = widthCm / 2.54;
  if (inches <= 0) return 0;
  return Math.round(outputWidthPx / inches);
}

/**
 * Recommend Pruna target megapixels so long edge ≈ targetDpi at print width.
 * Presets are 8 / 16 / 32 MP (aspect preserved by upscale_mode=target).
 */
export function recommendUpscaleMegapixelsForPrint(
  widthCm: number,
  heightCm: number,
  targetDpi = 150,
): 8 | 16 | 32 {
  const longCm = Math.max(widthCm, heightCm);
  const shortCm = Math.min(widthCm, heightCm);
  const longPx = (longCm / 2.54) * targetDpi;
  const shortPx = (shortCm / 2.54) * targetDpi;
  const megapixels = (longPx * shortPx) / 1_000_000;
  if (megapixels <= 8) return 8;
  if (megapixels <= 16) return 16;
  return 32;
}

export function formatPrintUpscaleHint(
  size: PhysicalPrintSizeCm,
  outputWidthPx: number,
): string {
  const dpi = estimatePrintDpi(outputWidthPx, size.widthCm);
  const targetMp = recommendUpscaleMegapixelsForPrint(size.widthCm, size.heightCm, 150);
  return [
    `หมายเหตุงานพิมพ์ ${size.widthCm}×${size.heightCm} ซม.: ตอนนี้ยาวด้านยาวประมาณ ${outputWidthPx}px (~${dpi} DPI) — ดูบนจอโอเค แต่พิมพ์ใกล้ๆ อาจไม่คม`,
    `ถ้าจะพิมพ์จริง ใช้ Upscale ต่อ (แนะนำเป้า ~${targetMp} MP) สัดส่วน 3:1 จะคงเดิม ไม่ต้องครอป`,
  ].join("\n");
}
