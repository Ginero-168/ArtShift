import type { VisionObjectBox } from "./objectBoxes";

type BoxLike = Pick<VisionObjectBox, "x_min" | "y_min" | "x_max" | "y_max">;

function area(box: BoxLike): number {
  return Math.max(0, box.x_max - box.x_min) * Math.max(0, box.y_max - box.y_min);
}

function intersectionArea(first: BoxLike, second: BoxLike): number {
  return (
    Math.max(0, Math.min(first.x_max, second.x_max) - Math.max(first.x_min, second.x_min)) *
    Math.max(0, Math.min(first.y_max, second.y_max) - Math.max(first.y_min, second.y_min))
  );
}

function isValidBox(box: BoxLike): boolean {
  return (
    [box.x_min, box.y_min, box.x_max, box.y_max].every(Number.isFinite) &&
    box.x_max > box.x_min &&
    box.y_max > box.y_min
  );
}

/** Run a second Florence pass only when foreground geometry suggests recall is low. */
export function shouldRunVisionRecall(
  visionObjects: readonly BoxLike[],
  foregroundObjects: readonly BoxLike[],
): boolean {
  const validVisionObjects = visionObjects.filter(isValidBox);
  const validForegroundObjects = foregroundObjects.filter(isValidBox);
  if (validForegroundObjects.length === 0) return validVisionObjects.length === 0;
  if (validVisionObjects.length === 0) return true;

  // Alpha geometry is the extraction ground truth for visible foreground. A
  // larger count means Florence likely missed labels/regions worth recalling.
  if (validForegroundObjects.length > validVisionObjects.length) return true;

  // A large shortfall is worth a dense-region pass even when a few alpha
  // components were filtered out by the foreground analysis threshold.
  return (
    validForegroundObjects.length >= 4 &&
    validVisionObjects.length / validForegroundObjects.length < 0.75
  );
}

function isDuplicate(first: BoxLike, second: BoxLike): boolean {
  const firstArea = area(first);
  const secondArea = area(second);
  const smallerArea = Math.min(firstArea, secondArea);
  if (smallerArea <= 0) return false;

  const overlapOnSmaller = intersectionArea(first, second) / smallerArea;
  const areaRatio = Math.max(firstArea, secondArea) / smallerArea;
  // Do not collapse a small object nested in a coarse group box.
  return overlapOnSmaller >= 0.72 && areaRatio <= 2.5;
}

/** Merge OD and dense-region Florence results without erasing small nested objects. */
export function mergeVisionDetections(
  primaryObjects: readonly VisionObjectBox[],
  recallObjects: readonly VisionObjectBox[],
): VisionObjectBox[] {
  const merged: VisionObjectBox[] = [];

  for (const candidate of [...primaryObjects, ...recallObjects]) {
    if (!isValidBox(candidate)) continue;
    const duplicateIndex = merged.findIndex((existing) => isDuplicate(existing, candidate));
    if (duplicateIndex < 0) {
      merged.push({ ...candidate });
      continue;
    }

    const existing = merged[duplicateIndex];
    if (existing.label === "object" && candidate.label !== "object") {
      merged[duplicateIndex] = { ...existing, label: candidate.label };
    }
  }

  return merged.sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min);
}
