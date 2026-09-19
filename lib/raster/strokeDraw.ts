import type { RasterMaskStroke } from "./types";

export type RasterStrokeStamp = {
  x: number;
  y: number;
  pressure: number;
};

/** Distance between interpolated stamps; soft brushes need denser coverage. */
export function rasterStrokeSpacing(size: number, hardness = 1): number {
  const radius = Math.max(0.5, size / 2);
  return Math.max(0.75, radius * (hardness >= 0.999 ? 0.35 : 0.2));
}

/** Expand a stroke path into evenly spaced stamps (pressure interpolated). */
export function interpolateRasterStrokeStamps(stroke: RasterMaskStroke): RasterStrokeStamp[] {
  const points = stroke.points;
  if (!points.length) return [];
  const hardness = Math.max(0, Math.min(1, stroke.hardness ?? 1));
  const spacing = rasterStrokeSpacing(stroke.size, hardness);
  const pressures = stroke.pressures ?? [];
  const pressureAt = (index: number) => pressures[index] ?? 1;
  const stamps: RasterStrokeStamp[] = [
    { x: points[0][0], y: points[0][1], pressure: pressureAt(0) },
  ];
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const distance = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      stamps.push({
        x: from[0] + (to[0] - from[0]) * t,
        y: from[1] + (to[1] - from[1]) * t,
        pressure: pressureAt(index - 1) + (pressureAt(index) - pressureAt(index - 1)) * t,
      });
    }
  }
  return stamps;
}

/**
 * Paint one raster stroke into a 2D context using hardness-aware stamps.
 * Caller owns composite operation and alpha.
 */
export function drawRasterStroke(
  ctx: CanvasRenderingContext2D,
  stroke: RasterMaskStroke,
  color = "#111827",
): void {
  const hardness = Math.max(0, Math.min(1, stroke.hardness ?? 1));
  const baseRadius = Math.max(0.5, stroke.size / 2);
  for (const stamp of interpolateRasterStrokeStamps(stroke)) {
    const radius = Math.max(0.5, baseRadius * Math.max(0.05, Math.min(1, stamp.pressure)));
    ctx.beginPath();
    if (hardness >= 0.999) {
      ctx.fillStyle = color;
      ctx.arc(stamp.x, stamp.y, radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const innerRadius = radius * hardness;
    const gradient = ctx.createRadialGradient(
      stamp.x,
      stamp.y,
      innerRadius,
      stamp.x,
      stamp.y,
      radius,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(Math.max(0.01, Math.min(0.98, hardness)), color);
    gradient.addColorStop(1, "transparent");
    ctx.fillStyle = gradient;
    ctx.arc(stamp.x, stamp.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Live preview: copy the committed bitmap, then apply the in-progress stroke
 * so eraser destination-out is visible (an empty overlay would hide it).
 */
export function paintLiveStrokePreview(
  preview: CanvasRenderingContext2D,
  source: CanvasImageSource,
  stroke: RasterMaskStroke,
  clip?: { mask: CanvasImageSource; width: number; height: number },
): void {
  const width = preview.canvas.width;
  const height = preview.canvas.height;
  preview.setTransform(1, 0, 0, 1, 0, 0);
  preview.clearRect(0, 0, width, height);
  preview.drawImage(source, 0, 0, width, height);
  if (clip) {
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const layerContext = layer.getContext("2d");
    if (!layerContext) return;
    layerContext.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity));
    drawRasterStroke(layerContext, stroke, stroke.mode === "paint" ? stroke.color : "#ffffff");
    layerContext.globalAlpha = 1;
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(clip.mask, 0, 0, clip.width, clip.height);
    preview.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
    preview.drawImage(layer, 0, 0);
    preview.globalCompositeOperation = "source-over";
    return;
  }
  preview.globalCompositeOperation = stroke.mode === "paint" ? "source-over" : "destination-out";
  preview.globalAlpha = Math.max(0.05, Math.min(1, stroke.opacity));
  drawRasterStroke(preview, stroke, stroke.mode === "paint" ? stroke.color : "#ffffff");
  preview.globalAlpha = 1;
  preview.globalCompositeOperation = "source-over";
}
