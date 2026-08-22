import type { RasterMaskStroke } from "./types";

const MAX_STROKE_POINTS = 512;

/** Keep brush history compact without changing the visible stroke shape. */
export function compactRasterStroke(stroke: RasterMaskStroke): RasterMaskStroke {
  if (stroke.points.length <= MAX_STROKE_POINTS) return stroke;
  const step = Math.ceil(stroke.points.length / MAX_STROKE_POINTS);
  const points = stroke.points.filter(
    (_, index) => index % step === 0 || index === stroke.points.length - 1,
  );
  return { ...stroke, points };
}

export function appendRasterMaskStroke(
  existing: RasterMaskStroke[] | undefined,
  stroke: RasterMaskStroke,
): RasterMaskStroke[] {
  return [...(existing ?? []), compactRasterStroke(stroke)];
}

export function createRasterStroke(
  points: Array<[number, number]>,
  size: number,
  opacity = 1,
): RasterMaskStroke {
  return {
    id: crypto.randomUUID(),
    mode: "erase",
    points,
    size: Math.max(1, size),
    opacity: Math.max(0.05, Math.min(1, opacity)),
  };
}
