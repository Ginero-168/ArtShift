export type MattePostprocessOptions = {
  /** Values below this point become transparent. Defaults to no hard clip. */
  blackPoint?: number;
  /** Values above this point become opaque. Defaults to no hard clip. */
  whitePoint?: number;
};

/**
 * Match RMBG's reference post-process: normalize the model output per matte
 * before resizing or converting it to an 8-bit alpha channel.
 */
export function normalizeMatteValues(values: ArrayLike<number>): Float32Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index++) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const normalized = new Float32Array(values.length);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return normalized;

  const range = max - min;
  for (let index = 0; index < values.length; index++) {
    const value = Number(values[index]);
    normalized[index] = Number.isFinite(value) ? clamp01((value - min) / range) : 0;
  }
  return normalized;
}

/**
 * Resize a normalized single-channel matte with bilinear interpolation and
 * quantize only the final destination pixel. This avoids a full-resolution
 * Float32 buffer while preserving soft edges better than uint8-then-resize.
 */
export function resizeMatteToAlpha(
  normalized: ArrayLike<number>,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  options: MattePostprocessOptions = {},
): Uint8ClampedArray {
  if (
    sourceWidth < 1 ||
    sourceHeight < 1 ||
    targetWidth < 1 ||
    targetHeight < 1 ||
    normalized.length < sourceWidth * sourceHeight
  ) {
    throw new Error("Invalid matte dimensions.");
  }

  const output = new Uint8ClampedArray(targetWidth * targetHeight);
  const blackPoint = clamp01(options.blackPoint ?? 0);
  const whitePoint = Math.max(blackPoint + Number.EPSILON, clamp01(options.whitePoint ?? 1));
  const scaleX = sourceWidth / targetWidth;
  const scaleY = sourceHeight / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const sourceY = (y + 0.5) * scaleY - 0.5;
    const yFloor = Math.floor(sourceY);
    const y0 = Math.max(0, Math.min(sourceHeight - 1, yFloor));
    const y1 = Math.max(0, Math.min(sourceHeight - 1, yFloor + 1));
    const yWeight = sourceY <= 0 || sourceY >= sourceHeight - 1 ? 0 : sourceY - yFloor;

    for (let x = 0; x < targetWidth; x++) {
      const sourceX = (x + 0.5) * scaleX - 0.5;
      const xFloor = Math.floor(sourceX);
      const x0 = Math.max(0, Math.min(sourceWidth - 1, xFloor));
      const x1 = Math.max(0, Math.min(sourceWidth - 1, xFloor + 1));
      const xWeight = sourceX <= 0 || sourceX >= sourceWidth - 1 ? 0 : sourceX - xFloor;

      const top = lerp(
        Number(normalized[y0 * sourceWidth + x0]),
        Number(normalized[y0 * sourceWidth + x1]),
        xWeight,
      );
      const bottom = lerp(
        Number(normalized[y1 * sourceWidth + x0]),
        Number(normalized[y1 * sourceWidth + x1]),
        xWeight,
      );
      const matte = lerp(top, bottom, yWeight);
      const alpha = clamp01((matte - blackPoint) / (whitePoint - blackPoint));
      output[y * targetWidth + x] = Math.round(alpha * 255);
    }
  }
  return output;
}

export function applyAlphaToImageData(
  source: ArrayLike<number>,
  sourceChannels: number,
  alpha: ArrayLike<number>,
): Uint8ClampedArray {
  if (
    (sourceChannels !== 3 && sourceChannels !== 4) ||
    source.length < alpha.length * sourceChannels
  ) {
    throw new Error("Invalid source image channels.");
  }

  const output = new Uint8ClampedArray(alpha.length * 4);
  for (let index = 0; index < alpha.length; index++) {
    const sourceOffset = index * sourceChannels;
    const outputOffset = index * 4;
    output[outputOffset] = Number(source[sourceOffset]) || 0;
    output[outputOffset + 1] = Number(source[sourceOffset + 1]) || 0;
    output[outputOffset + 2] = Number(source[sourceOffset + 2]) || 0;
    output[outputOffset + 3] = Math.max(0, Math.min(255, Number(alpha[index]) || 0));
  }
  return output;
}

function lerp(a: number, b: number, weight: number): number {
  return a + (b - a) * weight;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
