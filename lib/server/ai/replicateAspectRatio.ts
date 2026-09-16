/**
 * Map ArtShift aspect requests onto values GPT Image accepts on Replicate:
 * named ratios, or custom WIDTHxHEIGHT (edges ÷16, longer:shorter ≤ 3:1).
 */

/** Native ultra-wide / ultra-tall banners (exact 3:1 family used for 60×20cm print briefs). */
export const PANORAMIC_BANNER_SIZE = { width: 2048, height: 688 } as const;
export const SKYSCRAPER_BANNER_SIZE = { width: 688, height: 2048 } as const;

export const PANORAMIC_ASPECT = "2048x688" as const;
export const SKYSCRAPER_ASPECT = "688x2048" as const;

const NAMED_RATIOS = new Set([
  "1:1",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "auto",
]);

export function isCustomPixelAspectRatio(value: string): boolean {
  return /^\d+x\d+$/i.test(value.trim());
}

/** Prefer exact pixels for ultra-wide/tall so Replicate does not collapse to 16:9. */
export function aspectRatioFromDimensions(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const ratio = w / h;

  if (Math.abs(ratio - 1) < 0.08) return "1:1";
  if (ratio >= 2.4) return `${w}x${h}`;
  if (ratio <= 0.42) return `${w}x${h}`;
  if (Math.abs(ratio - 16 / 9) < 0.08) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.08) return "9:16";
  if (ratio >= 1.4) return "3:2";
  if (ratio <= 0.72) return "2:3";
  if (ratio > 1) return "4:3";
  return "3:4";
}

/**
 * Normalize an ArtShift aspect id for the Replicate GPT Image `aspect_ratio` field.
 * Never remaps 3:1 / panoramic custom sizes onto 16:9.
 */
export function normalizeReplicateAspectRatio(ratio: string | undefined): string {
  if (!ratio) return "1:1";
  const trimmed = ratio.trim();
  if (isCustomPixelAspectRatio(trimmed)) {
    const [w, h] = trimmed.toLowerCase().split("x");
    return `${Number(w)}x${Number(h)}`;
  }
  if (trimmed === "3:1" || trimmed === "21:9") return PANORAMIC_ASPECT;
  if (trimmed === "1:3") return SKYSCRAPER_ASPECT;
  if (NAMED_RATIOS.has(trimmed)) return trimmed;
  return "1:1";
}
