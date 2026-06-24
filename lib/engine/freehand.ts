/**
 * perfect-freehand wrapper.
 *
 * Converts a stream of [x, y, pressure] sample points into a closed outline
 * polygon ready for Canvas2D `fill()`. Pressure defaults to 0.5 when the
 * pointer event doesn't expose it (mouse). Stroke options track Excalidraw's
 * defaults so visual parity is close.
 */

import { getStroke, type StrokeOptions } from "perfect-freehand";
import type { FreedrawElement } from "./types";

export type StrokePoint = [x: number, y: number, pressure: number];

const DEFAULT_OPTIONS: StrokeOptions = {
  size: 4,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.5,
  easing: (t) => t,
  start: { taper: 0, cap: true },
  end: { taper: 0, cap: true },
  simulatePressure: true,
};

export function strokeOutlineFor(
  el: FreedrawElement,
  override?: Partial<StrokeOptions>,
): Array<[number, number]> {
  const options: StrokeOptions = {
    ...DEFAULT_OPTIONS,
    size: el.strokeWidth * 2,
    ...override,
  };
  const pts: StrokePoint[] = el.points;
  return getStroke(pts, options) as Array<[number, number]>;
}

/** Build a Path2D ready to fill, in element-local coordinates. */
export function freedrawPath(el: FreedrawElement): Path2D {
  const outline = strokeOutlineFor(el);
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    path.lineTo(outline[i][0], outline[i][1]);
  }
  path.closePath();
  return path;
}
