/**
 * Map any requested aspect (physical cm, pixels, or W:H) onto a GPT Image–
 * legal custom size: edges ÷16, longer:shorter ≤ 3:1, pixel budget in range.
 *
 * When the true print ratio exceeds 3:1 in either orientation (e.g. 29×7cm
 * landscape ≈ 4.14:1 or 7×29cm portrait ≈ 1:4.14), generation uses the clamped
 * ≤3:1 size. `printWidth`/`printHeight` keep the requested print canvas so the
 * runner can expand overflowing edges + stitch after generate.
 */

export const GPT_IMAGE_MAX_EDGE = 3_840;
export const GPT_IMAGE_MAX_ASPECT = 3; // longer / shorter
export const GPT_IMAGE_MIN_PIXELS = 655_360;
export const GPT_IMAGE_MAX_PIXELS = 8_294_400;
/** Default long-edge target for banner/print composition (screen + later Upscale). */
export const GPT_IMAGE_PREFERRED_LONG_EDGE = 2_048;

export type ResolvedGenerationSize = {
  width: number;
  height: number;
  /** Always WIDTHxHEIGHT for custom; callers may still send named ratios separately. */
  aspectRatio: `${number}x${number}`;
  /** True when longer:shorter was clamped to the model max of 3:1. */
  ratioClamped: boolean;
  /**
   * Requested print-canvas pixels when `ratioClamped` — used to expand+stitch
   * after the filled 3:1 generation. Delivered bitmap targets these sizes.
   */
  printWidth: number;
  printHeight: number;
};

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

function fitWithinBudgets(width: number, height: number): { width: number; height: number } {
  let w = width;
  let h = height;
  const maxEdge = Math.max(w, h);
  if (maxEdge > GPT_IMAGE_MAX_EDGE) {
    const scale = GPT_IMAGE_MAX_EDGE / maxEdge;
    w *= scale;
    h *= scale;
  }
  const pixels = w * h;
  if (pixels > GPT_IMAGE_MAX_PIXELS) {
    const scale = Math.sqrt(GPT_IMAGE_MAX_PIXELS / pixels);
    w *= scale;
    h *= scale;
  }
  if (w * h < GPT_IMAGE_MIN_PIXELS) {
    const scale = Math.sqrt(GPT_IMAGE_MIN_PIXELS / (w * h));
    w *= scale;
    h *= scale;
    // Re-cap after min-pixel boost
    const edge = Math.max(w, h);
    if (edge > GPT_IMAGE_MAX_EDGE) {
      const down = GPT_IMAGE_MAX_EDGE / edge;
      w *= down;
      h *= down;
    }
  }
  return { width: w, height: h };
}

/** Pixel canvas for a ratio with budgets — does NOT apply the 3:1 model cap or ÷16. */
export function resolvePrintCanvasSize(
  ratioWidth: number,
  ratioHeight: number,
  options?: { preferredLongEdge?: number },
): { width: number; height: number } {
  const rw = Math.abs(ratioWidth);
  const rh = Math.abs(ratioHeight);
  if (!(rw > 0) || !(rh > 0)) {
    return { width: 1024, height: 1024 };
  }

  const preferred = options?.preferredLongEdge ?? GPT_IMAGE_PREFERRED_LONG_EDGE;
  const landscape = rw >= rh;
  let width: number;
  let height: number;
  if (landscape) {
    width = preferred;
    height = (preferred * rh) / rw;
  } else {
    height = preferred;
    width = (preferred * rw) / rh;
  }

  ({ width, height } = fitWithinBudgets(width, height));

  // Integer pixels only — print canvas is post-process, not an OpenAI size token.
  if (landscape) {
    width = Math.max(1, Math.round(width));
    height = Math.max(1, Math.round((width * rh) / rw));
  } else {
    height = Math.max(1, Math.round(height));
    width = Math.max(1, Math.round((height * rw) / rh));
  }

  if (
    Math.max(width, height) > GPT_IMAGE_MAX_EDGE ||
    width * height > GPT_IMAGE_MAX_PIXELS ||
    width * height < GPT_IMAGE_MIN_PIXELS
  ) {
    const fitted = fitWithinBudgets(width, height);
    if (landscape) {
      width = Math.max(1, Math.round(fitted.width));
      height = Math.max(1, Math.round((width * rh) / rw));
    } else {
      height = Math.max(1, Math.round(fitted.height));
      width = Math.max(1, Math.round((height * rw) / rh));
    }
  }

  return { width, height };
}

/**
 * Resolve generation pixels from any positive width/height ratio pair
 * (cm, mm, px, or abstract ratio units — only the ratio matters).
 */
export function resolveGenerationSizeFromRatio(
  ratioWidth: number,
  ratioHeight: number,
  options?: { preferredLongEdge?: number },
): ResolvedGenerationSize {
  const origRw = Math.abs(ratioWidth);
  const origRh = Math.abs(ratioHeight);
  if (!(origRw > 0) || !(origRh > 0)) {
    return {
      width: 1024,
      height: 1024,
      aspectRatio: "1024x1024",
      ratioClamped: false,
      printWidth: 1024,
      printHeight: 1024,
    };
  }

  const print = resolvePrintCanvasSize(origRw, origRh, options);

  let rw = origRw;
  let rh = origRh;
  let ratioClamped = false;
  if (rw / rh > GPT_IMAGE_MAX_ASPECT) {
    rw = GPT_IMAGE_MAX_ASPECT;
    rh = 1;
    ratioClamped = true;
  } else if (rh / rw > GPT_IMAGE_MAX_ASPECT) {
    rh = GPT_IMAGE_MAX_ASPECT;
    rw = 1;
    ratioClamped = true;
  }

  const preferred = options?.preferredLongEdge ?? GPT_IMAGE_PREFERRED_LONG_EDGE;
  const landscape = rw >= rh;
  let width: number;
  let height: number;
  if (landscape) {
    width = preferred;
    height = (preferred * rh) / rw;
  } else {
    height = preferred;
    width = (preferred * rw) / rh;
  }

  ({ width, height } = fitWithinBudgets(width, height));

  // Snap to multiples of 16, then re-lock the short edge to preserve ratio.
  if (landscape) {
    width = roundToMultiple(width, 16);
    height = roundToMultiple((width * rh) / rw, 16);
  } else {
    height = roundToMultiple(height, 16);
    width = roundToMultiple((height * rw) / rh, 16);
  }

  // Final safety: keep within budgets after rounding.
  if (
    Math.max(width, height) > GPT_IMAGE_MAX_EDGE ||
    width * height > GPT_IMAGE_MAX_PIXELS ||
    width * height < GPT_IMAGE_MIN_PIXELS
  ) {
    const fitted = fitWithinBudgets(width, height);
    if (landscape) {
      width = roundToMultiple(fitted.width, 16);
      height = roundToMultiple((width * rh) / rw, 16);
    } else {
      height = roundToMultiple(fitted.height, 16);
      width = roundToMultiple((height * rw) / rh, 16);
    }
  }

  // Ensure ratio still within 3:1 after integer rounding.
  if (width / Math.max(1, height) > GPT_IMAGE_MAX_ASPECT) {
    height = roundToMultiple(width / GPT_IMAGE_MAX_ASPECT, 16);
    ratioClamped = true;
  } else if (height / Math.max(1, width) > GPT_IMAGE_MAX_ASPECT) {
    width = roundToMultiple(height / GPT_IMAGE_MAX_ASPECT, 16);
    ratioClamped = true;
  }

  return {
    width,
    height,
    aspectRatio: `${width}x${height}`,
    ratioClamped,
    printWidth: ratioClamped ? print.width : width,
    printHeight: ratioClamped ? print.height : height,
  };
}

/** True when a string is a GPT-style custom size token. */
export function isPixelAspectToken(value: string): boolean {
  return /^\d+x\d+$/i.test(value.trim());
}
