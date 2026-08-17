/**
 * Multi-Object Alignment and Distribution Engine.
 * Pure math algorithms for aligning and distributing canvas elements.
 */

import type { EngineElement } from "./types";

export type AlignMode = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type DistributeAxis = "horizontal" | "vertical";

export function getElementsBoundingBox(elements: EngineElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  if (!elements.length) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  const width = maxX - minX;
  const height = maxY - minY;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: minX + width / 2,
    centerY: minY + height / 2,
  };
}

export function alignElements(
  elements: EngineElement[],
  mode: AlignMode,
  slideBounds?: { width: number; height: number },
  relativeTo: "selection" | "slide" = "selection",
): Array<{ id: string; patch: Partial<EngineElement> }> {
  if (!elements.length) return [];

  const bbox = getElementsBoundingBox(elements);
  const useSlide = relativeTo === "slide" || elements.length === 1;
  const targetMinX = useSlide && slideBounds ? 0 : bbox.minX;
  const targetMaxX = useSlide && slideBounds ? slideBounds.width : bbox.maxX;
  const targetCenterX = useSlide && slideBounds ? slideBounds.width / 2 : bbox.centerX;
  const targetMinY = useSlide && slideBounds ? 0 : bbox.minY;
  const targetMaxY = useSlide && slideBounds ? slideBounds.height : bbox.maxY;
  const targetCenterY = useSlide && slideBounds ? slideBounds.height / 2 : bbox.centerY;

  return elements.map((el) => {
    let newX = el.x;
    let newY = el.y;

    switch (mode) {
      case "left":
        newX = targetMinX;
        break;
      case "center":
        newX = targetCenterX - el.width / 2;
        break;
      case "right":
        newX = targetMaxX - el.width;
        break;
      case "top":
        newY = targetMinY;
        break;
      case "middle":
        newY = targetCenterY - el.height / 2;
        break;
      case "bottom":
        newY = targetMaxY - el.height;
        break;
    }

    return {
      id: el.id,
      patch: {
        x: Math.round(newX),
        y: Math.round(newY),
        version: el.version + 1,
      },
    };
  });
}

export function distributeElements(
  elements: EngineElement[],
  axis: DistributeAxis,
): Array<{ id: string; patch: Partial<EngineElement> }> {
  if (elements.length < 3) return [];

  if (axis === "horizontal") {
    // Sort by left edge
    const sorted = [...elements].sort((a, b) => a.x - b.x);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const totalSpan = last.x + last.width - first.x;
    const totalObjectWidth = sorted.reduce((sum, el) => sum + el.width, 0);
    const availableGapSpace = totalSpan - totalObjectWidth;
    const gap = availableGapSpace / (sorted.length - 1);

    let currentX = first.x;
    const patches: Array<{ id: string; patch: Partial<EngineElement> }> = [];

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (i > 0 && i < sorted.length - 1) {
        patches.push({
          id: el.id,
          patch: {
            x: Math.round(currentX),
            version: el.version + 1,
          },
        });
      }
      currentX += el.width + gap;
    }

    return patches;
  } else {
    // Sort by top edge
    const sorted = [...elements].sort((a, b) => a.y - b.y);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const totalSpan = last.y + last.height - first.y;
    const totalObjectHeight = sorted.reduce((sum, el) => sum + el.height, 0);
    const availableGapSpace = totalSpan - totalObjectHeight;
    const gap = availableGapSpace / (sorted.length - 1);

    let currentY = first.y;
    const patches: Array<{ id: string; patch: Partial<EngineElement> }> = [];

    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      if (i > 0 && i < sorted.length - 1) {
        patches.push({
          id: el.id,
          patch: {
            y: Math.round(currentY),
            version: el.version + 1,
          },
        });
      }
      currentY += el.height + gap;
    }

    return patches;
  }
}
