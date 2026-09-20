import type { EngineElement } from "./types";

export type ObjectContextCategory =
  | "Image"
  | "Vector"
  | "3D Book"
  | "Frame"
  | "Text"
  | "Shape"
  | "Multiple";

const categoryForType: Record<EngineElement["type"], ObjectContextCategory> = {
  image: "Image",
  path: "Vector",
  bookMockup: "3D Book",
  frame: "Frame",
  text: "Text",
  rect: "Shape",
  ellipse: "Shape",
  diamond: "Shape",
  triangle: "Shape",
  star: "Shape",
  hexagon: "Shape",
  heart: "Shape",
  plus: "Shape",
  line: "Vector",
  arrow: "Vector",
  freedraw: "Vector",
};

export function getObjectContextCategory(selected: EngineElement[]): {
  category: ObjectContextCategory | null;
  multiple: boolean;
} {
  if (selected.length === 0) return { category: null, multiple: false };
  const categories = new Set(selected.map((element) => categoryForType[element.type]));
  return {
    category: categories.size === 1 ? [...categories][0] : "Multiple",
    multiple: selected.length > 1,
  };
}

export function getObjectContextBarLeft(
  centerX: number,
  barWidth: number,
  viewportWidth: number,
): number {
  const centeredLeft = centerX - barWidth / 2;
  if (viewportWidth > 0 && barWidth <= viewportWidth) {
    return Math.min(Math.max(0, centeredLeft), viewportWidth - barWidth);
  }
  return Math.max(0, centeredLeft);
}

/**
 * Vertical offset between the object bounding box and the option bar in world units.
 * Scaled with canvas zoom so the gap grows when zooming in.
 */
export const OBJECT_CONTEXT_BAR_OFFSET = 25;

/**
 * Extra screen-space gap (CSS pixels, not scaled) so the bar sits 30px higher
 * than the scaled world offset alone.
 */
export const OBJECT_CONTEXT_BAR_SCREEN_LIFT = 30;

export function getObjectContextBarTop(params: {
  topPointY: number;
  bottomPointY: number;
  barHeight: number;
  scale: number;
  offset?: number;
}): { top: number; placeBelow: boolean } {
  const offset =
    (params.offset ?? OBJECT_CONTEXT_BAR_OFFSET) * params.scale + OBJECT_CONTEXT_BAR_SCREEN_LIFT;
  const placeBelow = params.topPointY - params.barHeight - offset < 4;
  const top = placeBelow
    ? params.bottomPointY + offset
    : params.topPointY - params.barHeight - offset;
  return { top, placeBelow };
}
