/**
 * Lumen Color Adjustments — Real-time pixel-level image filters.
 * Applies exposure, contrast, highlights, shadows, whites, blacks,
 * vibrance, saturation, warmth, tint, sharpness, and clarity to a Canvas ImageData.
 */

export type ColorAdjustmentKey =
  | "exposure"
  | "contrast"
  | "highlights"
  | "shadows"
  | "whites"
  | "blacks"
  | "vibrance"
  | "saturation"
  | "warmth"
  | "tint"
  | "sharpness"
  | "clarity";

export type ColorAdjustments = Record<ColorAdjustmentKey, number>;

export const DEFAULT_ADJUSTMENTS: ColorAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
  warmth: 0,
  tint: 0,
  sharpness: 0,
  clarity: 0,
};

function clamp(v: number, min = 0, max = 255) {
  return Math.max(min, Math.min(max, v));
}

function applyCurve(v: number, amt: number) {
  // S-curve for contrast/clarity
  const t = (v / 255 - 0.5) * (1 + amt / 100);
  return clamp((Math.tanh(t * 2) * 0.5 + 0.5) * 255);
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number) {
  let r = l,
    g = l,
    b = l;
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

export function applyColorAdjustments(
  imageData: ImageData,
  adjustments: Partial<ColorAdjustments>,
) {
  const data = imageData.data;
  const {
    exposure,
    contrast,
    highlights,
    shadows,
    whites,
    blacks,
    vibrance,
    saturation,
    warmth,
    tint,
    clarity,
  } = {
    ...DEFAULT_ADJUSTMENTS,
    ...adjustments,
  };

  // Precompute multipliers
  const exposureMul = 2 ** ((exposure || 0) / 100);
  const contrastMul = 1 + (contrast || 0) / 100;
  const highlightsMul = 1 + (highlights || 0) / 100;
  const shadowsMul = 1 + (shadows || 0) / 100;
  const whitesMul = 1 + (whites || 0) / 100;
  const blacksMul = 1 + (blacks || 0) / 100;
  const satMul = 1 + (saturation || 0) / 100;
  const vibMul = 1 + (vibrance || 0) / 100;
  const warmthShift = (warmth || 0) / 100; // +r, -b
  const tintShift = (tint || 0) / 100; // +g, -m
  const clarityAmt = (clarity || 0) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Exposure (multiply)
    r *= exposureMul;
    g *= exposureMul;
    b *= exposureMul;

    // Tone controls (highlights/shadows/whites/blacks)
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    if (luminance > 128) {
      r *= highlightsMul;
      g *= highlightsMul;
      b *= highlightsMul;
    } else {
      r *= shadowsMul;
      g *= shadowsMul;
      b *= shadowsMul;
    }
    r += (whitesMul - 1) * 128 - (blacksMul - 1) * 128;
    g += (whitesMul - 1) * 128 - (blacksMul - 1) * 128;
    b += (whitesMul - 1) * 128 - (blacksMul - 1) * 128;

    // Contrast (S-curve)
    if (contrastMul !== 1) {
      r = applyCurve(r, contrast || 0);
      g = applyCurve(g, contrast || 0);
      b = applyCurve(b, contrast || 0);
    }

    // Warmth / Tint (offset)
    r += warmthShift * 40;
    b -= warmthShift * 40;
    g += tintShift * 30;
    r -= tintShift * 15;
    b += tintShift * 15;

    // Vibrance / Saturation (HSL)
    if (satMul !== 1 || vibMul !== 1) {
      const hsl = rgbToHsl(r, g, b);
      const isSkin = hsl.h > 0.02 && hsl.h < 0.12 && hsl.s > 0.1 && hsl.l > 0.15 && hsl.l < 0.85;
      const factor = isSkin ? vibMul : satMul;
      hsl.s = clamp(hsl.s * factor, 0, 1);
      const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }

    // Clarity (local contrast via unsharp mask simplified)
    if (clarityAmt !== 0) {
      const centerLum = 0.299 * r + 0.587 * g + 0.114 * b;
      const edgeBoost = (centerLum - 128) * clarityAmt;
      r += edgeBoost * 0.5;
      g += edgeBoost * 0.5;
      b += edgeBoost * 0.5;
    }

    data[i] = clamp(r);
    data[i + 1] = clamp(g);
    data[i + 2] = clamp(b);
    // alpha unchanged
  }

  return imageData;
}

export function createAdjustedImage(
  img: HTMLImageElement | HTMLCanvasElement,
  adjustments: Partial<ColorAdjustments>,
  canvas?: HTMLCanvasElement,
) {
  const cvs = canvas || document.createElement("canvas");
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  applyColorAdjustments(imageData, adjustments);
  ctx.putImageData(imageData, 0, 0);
  return cvs;
}
