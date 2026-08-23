export type VisionObjectBox = {
  label: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type AlphaObjectBox = Omit<VisionObjectBox, "label"> & {
  area?: number;
};

type NormalizedBox = Omit<VisionObjectBox, "label">;

function area(box: NormalizedBox): number {
  return Math.max(0, box.x_max - box.x_min) * Math.max(0, box.y_max - box.y_min);
}

function intersectionArea(first: NormalizedBox, second: NormalizedBox): number {
  const width = Math.max(
    0,
    Math.min(first.x_max, second.x_max) - Math.max(first.x_min, second.x_min),
  );
  const height = Math.max(
    0,
    Math.min(first.y_max, second.y_max) - Math.max(first.y_min, second.y_min),
  );
  return width * height;
}

function isValidBox(box: NormalizedBox): boolean {
  return (
    [box.x_min, box.y_min, box.x_max, box.y_max].every(Number.isFinite) &&
    box.x_max > box.x_min &&
    box.y_max > box.y_min
  );
}

function sortBoxes<T extends NormalizedBox>(boxes: T[]): T[] {
  return boxes.sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min);
}

/**
 * Use foreground geometry to recover objects that Florence-2 misses.
 *
 * Florence provides useful labels but can return one coarse box for a group of
 * objects. Alpha components are therefore the extraction geometry whenever
 * available; Florence boxes only fill gaps where the foreground pass found no
 * component and provide labels for components they overlap.
 */
export function mergeVisionWithAlphaComponents(
  visionObjects: readonly VisionObjectBox[],
  alphaComponents: readonly AlphaObjectBox[],
): VisionObjectBox[] {
  const validVisionObjects = visionObjects.filter(isValidBox);
  const validAlphaComponents = alphaComponents.filter(isValidBox);
  if (validAlphaComponents.length === 0) return sortBoxes([...validVisionObjects]);

  const usedVisionIndexes = new Set<number>();
  const alphaObjects = validAlphaComponents.map(({ area: _area, ...component }) => {
    let bestVisionIndex = -1;
    let bestCoverage = 0;

    for (const [index, visionObject] of validVisionObjects.entries()) {
      const componentArea = area(component);
      const coverage =
        componentArea > 0 ? intersectionArea(component, visionObject) / componentArea : 0;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestVisionIndex = index;
      }
    }

    if (bestVisionIndex >= 0 && bestCoverage >= 0.25) {
      usedVisionIndexes.add(bestVisionIndex);
      return { label: validVisionObjects[bestVisionIndex].label, ...component };
    }

    return { label: "object", ...component };
  });

  const uncoveredVisionObjects = validVisionObjects.filter(
    (_object, index) => !usedVisionIndexes.has(index),
  );

  return sortBoxes([...alphaObjects, ...uncoveredVisionObjects]);
}
