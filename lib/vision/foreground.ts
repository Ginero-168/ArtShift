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

/** Ignore detector boxes whose transparent crop contains no useful subject. */
export function hasUsableForeground(coverage: number, minimum = 0.01): boolean {
  return Number.isFinite(coverage) && coverage >= minimum;
}
