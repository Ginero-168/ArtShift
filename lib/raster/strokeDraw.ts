import type { RasterMaskStroke } from "./types";

export type RasterStrokeStamp = {
  x: number;
  y: number;
  pressure: number;
};

/**
 * CSS `transparent` is `rgba(0,0,0,0)`. Canvas2D gradients interpolate RGB
 * toward black, so a fade-to-transparent stamp paints a dark ring on every dab
 * (the caterpillar / stamp-outline look). Keep the brush RGB and only fade alpha.
 */
export function rasterStampFillColor(color: string | undefined, alpha: number): string {
  const rgb = parseCssRgb(color);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

function parseCssRgb(color: string | undefined): [number, number, number] {
  const value = (color ?? "").trim();
  if (!value || value.toLowerCase() === "transparent") return [17, 24, 39];

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const raw = hex[1];
    const short = raw.length === 3 || raw.length === 4;
    const r = short ? raw[0] + raw[0] : raw.slice(0, 2);
    const g = short ? raw[1] + raw[1] : raw.slice(2, 4);
    const b = short ? raw[2] + raw[2] : raw.slice(4, 6);
    return [Number.parseInt(r, 16), Number.parseInt(g, 16), Number.parseInt(b, 16)];
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i.exec(value);
  if (rgb) {
    return [clampByte(Number(rgb[1])), clampByte(Number(rgb[2])), clampByte(Number(rgb[3]))];
  }

  return [17, 24, 39];
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function strokeHardness(stroke: RasterMaskStroke): number {
  return Math.max(0, Math.min(1, stroke.hardness ?? 1));
}

function pressureVaries(stroke: RasterMaskStroke): boolean {
  const pressures = stroke.pressures;
  if (!pressures || pressures.length < 2) return false;
  const first = pressures[0] ?? 1;
  return pressures.some((pressure) => Math.abs((pressure ?? 1) - first) > 0.02);
}

/** Distance between interpolated stamps; soft brushes need denser coverage. */
export function rasterStrokeSpacing(size: number, hardness = 1): number {
  const radius = Math.max(0.5, size / 2);
  return Math.max(0.75, radius * (hardness >= 0.999 ? 0.25 : 0.18));
}

/** Expand a stroke path into evenly spaced stamps (pressure interpolated). */
export function interpolateRasterStrokeStamps(stroke: RasterMaskStroke): RasterStrokeStamp[] {
  const points = stroke.points;
  if (!points.length) return [];
  const hardness = strokeHardness(stroke);
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

function paintColor(color: string | undefined): string {
  return rasterStampFillColor(color, 1);
}

function drawHardStrokePath(
  ctx: CanvasRenderingContext2D,
  stroke: RasterMaskStroke,
  color: string,
): void {
  const points = stroke.points;
  const paint = paintColor(color);
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, stroke.size);

  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0][0], points[0][1], Math.max(0.5, stroke.size / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index++) {
    ctx.lineTo(points[index][0], points[index][1]);
  }
  ctx.stroke();
  ctx.beginPath();
}

function drawStampStroke(
  ctx: CanvasRenderingContext2D,
  stroke: RasterMaskStroke,
  color: string,
  hardness: number,
): void {
  const baseRadius = Math.max(0.5, stroke.size / 2);
  const opaque = rasterStampFillColor(color, 1);
  const faded = rasterStampFillColor(color, 0);
  const hard = hardness >= 0.999;

  for (const stamp of interpolateRasterStrokeStamps(stroke)) {
    const radius = Math.max(0.5, baseRadius * Math.max(0.05, Math.min(1, stamp.pressure)));
    ctx.beginPath();
    ctx.arc(stamp.x, stamp.y, radius, 0, Math.PI * 2);
    if (hard) {
      ctx.fillStyle = opaque;
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
    gradient.addColorStop(0, opaque);
    gradient.addColorStop(Math.max(0.01, Math.min(0.98, hardness)), opaque);
    gradient.addColorStop(1, faded);
    ctx.fillStyle = gradient;
    ctx.fill();
  }
  ctx.beginPath();
}

/**
 * Paint one raster stroke into a 2D context using hardness-aware stamps.
 * Caller owns composite operation and alpha.
 *
 * Hard pencils are a single round-cap path so overlapping dabs cannot show
 * stamp edges. Soft brushes fill only — never stroke — and fade to the same
 * RGB at zero alpha.
 */
export function drawRasterStroke(
  ctx: CanvasRenderingContext2D,
  stroke: RasterMaskStroke,
  color = "#111827",
): void {
  const hardness = strokeHardness(stroke);
  const paint = color || stroke.color || "#111827";
  if (hardness >= 0.999 && !pressureVaries(stroke)) {
    drawHardStrokePath(ctx, stroke, paint);
    return;
  }
  drawStampStroke(ctx, stroke, paint, hardness);
}

function strokePaintColor(stroke: RasterMaskStroke): string {
  return stroke.mode === "paint" ? (stroke.color ?? "#111827") : "#ffffff";
}

/**
 * Live preview: copy the committed bitmap, then apply the in-progress stroke
 * so eraser destination-out is visible (an empty overlay would hide it).
 *
 * Stamps are drawn at full opacity onto a layer, then the layer is composited
 * once so stroke opacity does not stack into darker stamp rings.
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

  const opacity = Math.max(0.05, Math.min(1, stroke.opacity));
  const paint = strokePaintColor(stroke);
  const composite = stroke.mode === "paint" ? "source-over" : "destination-out";
  if (!clip && opacity >= 0.999) {
    preview.globalCompositeOperation = composite;
    preview.globalAlpha = 1;
    drawRasterStroke(preview, stroke, paint);
    preview.globalCompositeOperation = "source-over";
    return;
  }

  const layer = document.createElement("canvas");
  layer.width = width;
  layer.height = height;
  const layerContext = layer.getContext("2d");
  if (!layerContext) return;
  layerContext.globalAlpha = 1;
  drawRasterStroke(layerContext, stroke, paint);
  if (clip) {
    layerContext.globalCompositeOperation = "destination-in";
    layerContext.drawImage(clip.mask, 0, 0, clip.width, clip.height);
  }
  preview.globalCompositeOperation = composite;
  preview.globalAlpha = opacity;
  preview.drawImage(layer, 0, 0);
  preview.globalAlpha = 1;
  preview.globalCompositeOperation = "source-over";
}
