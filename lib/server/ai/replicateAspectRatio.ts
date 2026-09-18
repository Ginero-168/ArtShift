/**
 * Map ArtShift aspect requests onto values GPT Image accepts on Replicate.
 *
 * GPT Image 2 / 2.5 on Replicate only accept a fixed enum of named ratios and
 * a short list of pixel tokens — arbitrary WIDTHxHEIGHT (e.g. 2048x688 for 3:1)
 * is rejected with HTTP 422. We therefore snap every request to the nearest
 * allowed value while keeping named ratios when the caller already used one.
 */

import { isPixelAspectToken, resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";

/** Exact values accepted by Replicate `input.aspect_ratio` (GPT Image family). */
export const REPLICATE_GPT_IMAGE_ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "1536x1152",
  "1152x1536",
  "2048x2048",
  "2048x1152",
  "1152x2048",
  "3840x2160",
  "2160x3840",
] as const;

export type ReplicateGptImageAspectRatio = (typeof REPLICATE_GPT_IMAGE_ASPECT_RATIOS)[number];

const NAMED_RATIOS = new Set(["1:1", "16:9", "9:16", "3:2", "2:3", "4:3", "3:4", "auto"]);

const ALLOWED_PIXEL_OR_NAMED: Array<{ value: ReplicateGptImageAspectRatio; ratio: number }> = [
  { value: "1:1", ratio: 1 },
  { value: "3:2", ratio: 3 / 2 },
  { value: "2:3", ratio: 2 / 3 },
  { value: "4:3", ratio: 4 / 3 },
  { value: "3:4", ratio: 3 / 4 },
  { value: "16:9", ratio: 16 / 9 },
  { value: "9:16", ratio: 9 / 16 },
  // Prefer mid/high-res pixel tokens when ratios tie with named ones.
  { value: "1024x1024", ratio: 1 },
  { value: "1536x1024", ratio: 1536 / 1024 },
  { value: "1024x1536", ratio: 1024 / 1536 },
  { value: "1536x1152", ratio: 1536 / 1152 },
  { value: "1152x1536", ratio: 1152 / 1536 },
  { value: "2048x2048", ratio: 1 },
  { value: "2048x1152", ratio: 2048 / 1152 },
  { value: "1152x2048", ratio: 1152 / 2048 },
  { value: "3840x2160", ratio: 3840 / 2160 },
  { value: "2160x3840", ratio: 2160 / 3840 },
];

const ALLOWED_SET = new Set<string>(REPLICATE_GPT_IMAGE_ASPECT_RATIOS);

/** Prefer exact pixels for non-standard sizes so Replicate does not collapse ratios. */
export function aspectRatioFromDimensions(width: number, height: number): string {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return snapToAllowedReplicateAspect(`${w}x${h}`, w / h);
}

/**
 * Normalize an ArtShift aspect id for the Replicate GPT Image `aspect_ratio` field.
 * Always returns a value from REPLICATE_GPT_IMAGE_ASPECT_RATIOS (except we never
 * invent "auto" unless the caller asked for it).
 */
export function normalizeReplicateAspectRatio(ratio: string | undefined): string {
  if (!ratio) return "1:1";
  const trimmed = ratio.trim();
  if (trimmed === "auto") return "auto";
  if (ALLOWED_SET.has(trimmed)) return trimmed;

  if (isPixelAspectToken(trimmed)) {
    const [wRaw, hRaw] = trimmed.toLowerCase().split("x");
    const w = Number(wRaw);
    const h = Number(hRaw);
    if (w > 0 && h > 0) return snapToAllowedReplicateAspect(trimmed, w / h);
  }

  if (NAMED_RATIOS.has(trimmed)) return trimmed;

  const colon = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/u.exec(trimmed);
  if (colon) {
    const rw = Number(colon[1]);
    const rh = Number(colon[2]);
    if (rw > 0 && rh > 0) {
      const resolved = resolveGenerationSizeFromRatio(rw, rh);
      return snapToAllowedReplicateAspect(resolved.aspectRatio, resolved.width / resolved.height);
    }
  }

  return "1:1";
}

/**
 * Pick the closest allowed Replicate aspect token by log-ratio distance.
 * Prefers ~2K pixel tokens over 4K on near-ties (cheaper / faster default).
 */
export function snapToAllowedReplicateAspect(
  _requested: string,
  ratio: number,
): ReplicateGptImageAspectRatio {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return "1:1";

  const logTarget = Math.log(ratio);
  let best: (typeof ALLOWED_PIXEL_OR_NAMED)[number] = ALLOWED_PIXEL_OR_NAMED[0]!;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const option of ALLOWED_PIXEL_OR_NAMED) {
    const distance = Math.abs(Math.log(option.ratio) - logTarget);
    // Prefer mid-res (~2K) over 4K / tiny tokens when ratios are equally close.
    const preference = resolutionPreference(option.value);
    const score = distance * 1000 - preference;
    if (score < bestScore) {
      bestScore = score;
      best = option;
    }
  }

  if (Math.abs(best.ratio - 1) < 0.02) return "1:1";
  if (Math.abs(best.ratio - 16 / 9) < 0.02) return "2048x1152";
  if (Math.abs(best.ratio - 9 / 16) < 0.02) return "1152x2048";
  if (Math.abs(best.ratio - 3 / 2) < 0.02) return "3:2";
  if (Math.abs(best.ratio - 2 / 3) < 0.02) return "2:3";
  if (Math.abs(best.ratio - 4 / 3) < 0.02) return "4:3";
  if (Math.abs(best.ratio - 3 / 4) < 0.02) return "3:4";

  return best.value;
}

function resolutionPreference(value: string): number {
  if (!isPixelAspectToken(value)) return 5; // named ratios are fine defaults
  const [w, h] = value.toLowerCase().split("x").map(Number);
  const longEdge = Math.max(w || 0, h || 0);
  if (longEdge === 2048) return 30;
  if (longEdge === 1536) return 20;
  if (longEdge === 1024) return 10;
  if (longEdge >= 3840) return 0; // avoid 4K unless uniquely closest
  return 1;
}

/** @deprecated Kept for call sites that still import banner constants. */
export const PANORAMIC_ASPECT = "2048x1152" as const;
export const SKYSCRAPER_ASPECT = "1152x2048" as const;
export const PANORAMIC_BANNER_SIZE = { width: 2048, height: 1152 } as const;
export const SKYSCRAPER_BANNER_SIZE = { width: 1152, height: 2048 } as const;
