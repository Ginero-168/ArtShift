/**
 * Map ArtShift aspect requests onto values GPT Image accepts on Replicate:
 * named ratios, or custom WIDTHxHEIGHT (edges ÷16, longer:shorter ≤ 3:1).
 */

import {
  isPixelAspectToken,
  resolveGenerationSizeFromRatio,
} from "@/lib/ai/generationSize";

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

/** Prefer exact pixels for non-standard sizes so Replicate does not collapse ratios. */
export function aspectRatioFromDimensions(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const ratio = w / h;

  if (Math.abs(ratio - 1) < 0.02) return "1:1";
  if (Math.abs(ratio - 16 / 9) < 0.02) return "16:9";
  if (Math.abs(ratio - 9 / 16) < 0.02) return "9:16";
  if (Math.abs(ratio - 3 / 2) < 0.02) return "3:2";
  if (Math.abs(ratio - 2 / 3) < 0.02) return "2:3";
  if (Math.abs(ratio - 4 / 3) < 0.02) return "4:3";
  if (Math.abs(ratio - 3 / 4) < 0.02) return "3:4";
  return `${w}x${h}`;
}

/**
 * Normalize an ArtShift aspect id for the Replicate GPT Image `aspect_ratio` field.
 * Custom WIDTHxHEIGHT always passes through. Arbitrary A:B maps to native pixels.
 */
export function normalizeReplicateAspectRatio(ratio: string | undefined): string {
  if (!ratio) return "1:1";
  const trimmed = ratio.trim();
  if (isPixelAspectToken(trimmed)) {
    const [w, h] = trimmed.toLowerCase().split("x");
    return `${Number(w)}x${Number(h)}`;
  }
  if (NAMED_RATIOS.has(trimmed)) return trimmed;
  const colon = /^(\d+)\s*:\s*(\d+)$/u.exec(trimmed);
  if (colon) {
    const rw = Number(colon[1]);
    const rh = Number(colon[2]);
    if (rw > 0 && rh > 0) {
      return resolveGenerationSizeFromRatio(rw, rh).aspectRatio;
    }
  }
  return "1:1";
}

export const PANORAMIC_ASPECT = "2048x688" as const;
export const SKYSCRAPER_ASPECT = "688x2048" as const;
export const PANORAMIC_BANNER_SIZE = { width: 2048, height: 688 } as const;
export const SKYSCRAPER_BANNER_SIZE = { width: 688, height: 2048 } as const;
