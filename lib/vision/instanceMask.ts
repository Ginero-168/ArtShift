/**
 * Compose the alpha used for one extracted object.
 *
 * Background removal is the source of truth for pixels that are already known
 * to be foreground. An optional instance-segmentation mask may add pixels, but
 * it must never erase a foreground pixel just because the second model missed
 * a thin accessory or a soft edge.
 */
export function composeInstanceAlpha(
  sourceAlpha: ArrayLike<number>,
  refinementMask: ArrayLike<number>,
  options: {
    sourceThreshold?: number;
    refinementThreshold?: number;
    preserveSourceAlpha?: boolean;
  } = {},
): Uint8ClampedArray {
  if (sourceAlpha.length !== refinementMask.length) {
    throw new Error("Instance alpha sources must have the same dimensions.");
  }

  const sourceThreshold = Math.max(0, Math.min(255, options.sourceThreshold ?? 8));
  const refinementThreshold = Math.max(0, Math.min(255, options.refinementThreshold ?? 1));
  const preserveSourceAlpha = options.preserveSourceAlpha ?? true;
  const output = new Uint8ClampedArray(sourceAlpha.length);

  for (let index = 0; index < output.length; index++) {
    const sourceValue = clampByte(Number(sourceAlpha[index]));
    const refinementValue =
      clampByte(Number(refinementMask[index])) >= refinementThreshold ? 255 : 0;
    output[index] =
      preserveSourceAlpha && sourceValue >= sourceThreshold
        ? Math.max(sourceValue, refinementValue)
        : refinementValue;
  }

  return output;
}

export type InstanceMaskCandidate = {
  box: { x_min: number; y_min: number; x_max: number; y_max: number };
  mask: { width: number; height: number; data: Uint8Array; score: number };
};

/** Give every visible pixel to one instance so extracted assets cannot duplicate neighbors. */
export function resolveInstanceMaskOverlaps<T extends InstanceMaskCandidate>(
  candidates: readonly T[],
): Array<T["mask"]> {
  if (candidates.length === 0) return [];
  const { width, height } = candidates[0].mask;
  if (
    width < 1 ||
    height < 1 ||
    candidates.some(
      ({ mask }) =>
        mask.width !== width || mask.height !== height || mask.data.length < width * height,
    )
  ) {
    throw new Error("Instance masks must share the same dimensions.");
  }

  const resolved = candidates.map(({ mask }) => ({
    ...mask,
    data: new Uint8Array(width * height),
  }));

  for (let pixel = 0; pixel < width * height; pixel++) {
    let winner = -1;
    let bestPriority = Number.NEGATIVE_INFINITY;
    for (const [index, candidate] of candidates.entries()) {
      if (candidate.mask.data[pixel] <= 0) continue;
      const boxArea =
        Math.max(0, candidate.box.x_max - candidate.box.x_min) *
        Math.max(0, candidate.box.y_max - candidate.box.y_min);
      const priority = clampUnit(candidate.mask.score) + (1 - clampUnit(boxArea)) * 0.01;
      if (priority > bestPriority) {
        winner = index;
        bestPriority = priority;
      }
    }
    if (winner >= 0) resolved[winner].data[pixel] = 1;
  }

  return resolved;
}

function clampByte(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0;
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
