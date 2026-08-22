import type { RasterMaskStroke } from "./types";

const MAX_STROKE_POINTS = 512;

/** Keep brush history compact without changing the visible stroke shape. */
export function compactRasterStroke(stroke: RasterMaskStroke): RasterMaskStroke {
  if (stroke.points.length <= MAX_STROKE_POINTS) return stroke;
  const step = Math.ceil(stroke.points.length / MAX_STROKE_POINTS);
  const keptIndices = stroke.points.reduce<number[]>((indices, _, index) => {
    if (index % step === 0 || index === stroke.points.length - 1) indices.push(index);
    return indices;
  }, []);
  const points = keptIndices.map((index) => stroke.points[index]);
  const pressures = stroke.pressures
    ? keptIndices.map((index) => clamp01(stroke.pressures?.[index] ?? 1))
    : undefined;
  return { ...stroke, points, pressures };
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
  options: {
    mode?: RasterMaskStroke["mode"];
    pressures?: number[];
    color?: string;
    hardness?: number;
    selectionMaskDataUrl?: string;
  } = {},
): RasterMaskStroke {
  return {
    id: crypto.randomUUID(),
    mode: options.mode ?? "erase",
    points,
    pressures: options.pressures?.map(clamp01),
    size: Math.max(1, size),
    opacity: Math.max(0.05, Math.min(1, opacity)),
    color: options.color,
    hardness: options.hardness === undefined ? undefined : clamp01(options.hardness),
    selectionMaskDataUrl: options.selectionMaskDataUrl,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}
