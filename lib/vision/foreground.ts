export type AlphaBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Return the proportion of pixels that contain visible foreground alpha. */
export function alphaCoverageFromRgba(data: ArrayLike<number>, alphaThreshold = 20): number {
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount < 1) return 0;

  let foregroundPixels = 0;
  for (let index = 3; index < pixelCount * 4; index += 4) {
    if (Number(data[index]) >= alphaThreshold) foregroundPixels++;
  }
  return foregroundPixels / pixelCount;
}

/** Find the tight visible bounds of an RGBA buffer with optional padding. */
export function alphaBoundsFromRgba(
  data: ArrayLike<number>,
  width: number,
  height: number,
  alphaThreshold = 8,
  padding = 0,
): AlphaBounds | null {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    data.length < width * height * 4
  ) {
    return null;
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Number(data[(y * width + x) * 4 + 3]) < alphaThreshold) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const safePadding = Math.max(0, Math.floor(padding));
  const x = Math.max(0, minX - safePadding);
  const y = Math.max(0, minY - safePadding);
  const right = Math.min(width, maxX + safePadding + 1);
  const bottom = Math.min(height, maxY + safePadding + 1);
  return { x, y, width: right - x, height: bottom - y };
}

/** Ignore detector boxes whose transparent crop contains no useful subject. */
export function hasUsableForeground(coverage: number, minimum = 0.01): boolean {
  return Number.isFinite(coverage) && coverage >= minimum;
}

/** Keep foreground pixels that were already present before an optional segmentation mask. */
export function shouldPreserveForegroundPixel(
  sourceAlpha: number,
  maskValue: number,
  alphaThreshold = 8,
): boolean {
  return Number.isFinite(sourceAlpha) && (sourceAlpha >= alphaThreshold || maskValue > 0);
}
