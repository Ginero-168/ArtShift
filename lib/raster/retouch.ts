import type { ImageElement } from "@/lib/engine/types";
import { loadOpenCvJs } from "./opencvJsAdapter";
import type { RasterPixelBuffer } from "./processor";
import { registerRasterRetouchSource } from "./retouchSource";
import type { RasterSelection } from "./selection";
import type { RasterRetouchEdit } from "./types";

export type RasterRetouchOptions = {
  mode: "heal" | "clone";
  points: Array<[number, number]>;
  sourcePoint?: [number, number];
  size: number;
  opacity: number;
  selection?: RasterSelection;
  /** 1 is a hard cookie-cutter stamp; lower values feather the patch edge. */
  hardness?: number;
};

export type RasterRetouchResult = {
  edit: RasterRetouchEdit;
  /** True when Healing fell back to a clone-like patch because OpenCV inpaint failed. */
  healFallback: boolean;
};

/** Build one bounded derived patch, keeping the source ImageElement untouched. */
export async function createRasterRetouchEdit(
  image: ImageElement,
  pixels: RasterPixelBuffer,
  options: RasterRetouchOptions,
): Promise<RasterRetouchResult | null> {
  const points = options.points.filter((point) => point.every(Number.isFinite));
  if (!points.length || pixels.width < 1 || pixels.height < 1) return null;
  const scaleX = pixels.width / Math.max(1, image.width);
  const scaleY = pixels.height / Math.max(1, image.height);
  const scaledPoints = points.map(([x, y]) => [x * scaleX, y * scaleY] as [number, number]);
  const radiusX = Math.max(1, options.size * scaleX) / 2;
  const radiusY = Math.max(1, options.size * scaleY) / 2;
  const hardness = clamp01(options.hardness ?? 0.65);
  const bounds = patchBounds(scaledPoints, radiusX, radiusY, pixels.width, pixels.height);
  if (!bounds) return null;

  let output: RasterPixelBuffer;
  let healFallback = false;
  if (options.mode === "heal") {
    try {
      const repair = createRepairMasks(
        bounds.width,
        bounds.height,
        scaledPoints,
        bounds,
        radiusX,
        radiusY,
        hardness,
      );
      const crop = cropPixels(pixels, bounds);
      output = applyAlphaMask(await (await loadOpenCvJs()).heal(crop, repair.inpaint), repair.soft);
    } catch {
      // OpenCV is an optional enhancement. Clone remains a predictable local fallback.
      healFallback = true;
      output = createClonePatch(
        pixels,
        bounds,
        scaledPoints,
        options.sourcePoint,
        scaleX,
        scaleY,
        radiusX,
        radiusY,
        hardness,
      );
    }
  } else {
    output = createClonePatch(
      pixels,
      bounds,
      scaledPoints,
      options.sourcePoint,
      scaleX,
      scaleY,
      radiusX,
      radiusY,
      hardness,
    );
  }

  const dataUrl = pixelBufferToDataUrl(output);
  return {
    edit: {
      id: crypto.randomUUID(),
      mode: options.mode,
      dataUrl,
      x: bounds.x / scaleX,
      y: bounds.y / scaleY,
      width: bounds.width / scaleX,
      height: bounds.height / scaleY,
      opacity: clamp01(options.opacity),
      selection: options.selection,
    },
    healFallback,
  };
}

function createClonePatch(
  pixels: RasterPixelBuffer,
  bounds: PatchBounds,
  points: Array<[number, number]>,
  sourcePoint: [number, number] | undefined,
  scaleX: number,
  scaleY: number,
  radiusX: number,
  radiusY: number,
  hardness: number,
): RasterPixelBuffer {
  const source = sourcePoint
    ? [sourcePoint[0] * scaleX, sourcePoint[1] * scaleY]
    : [points[0][0] + Math.max(2, bounds.width * 0.75), points[0][1]];
  const destination = points[0];
  const deltaX = source[0] - destination[0];
  const deltaY = source[1] - destination[1];
  const canvas = document.createElement("canvas");
  canvas.width = bounds.width;
  canvas.height = bounds.height;
  const context = canvas.getContext("2d");
  if (!context) return cropPixels(pixels, bounds);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = pixels.width;
  sourceCanvas.height = pixels.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return cropPixels(pixels, bounds);
  const sourceImage = new ImageData(pixels.width, pixels.height);
  sourceImage.data.set(pixels.data);
  sourceContext.putImageData(sourceImage, 0, 0);
  context.drawImage(sourceCanvas, -bounds.x - deltaX, -bounds.y - deltaY);
  context.globalCompositeOperation = "destination-in";
  stampSoftPath(context, points, bounds, radiusX, radiusY, hardness);
  return imageDataToBuffer(context.getImageData(0, 0, bounds.width, bounds.height));
}

function createRepairMasks(
  width: number,
  height: number,
  points: Array<[number, number]>,
  bounds: PatchBounds,
  radiusX: number,
  radiusY: number,
  hardness: number,
): { inpaint: Uint8Array; soft: Uint8Array } {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const inpaint = new Uint8Array(width * height);
  const soft = new Uint8Array(width * height);
  if (!context) return { inpaint, soft };
  stampSoftPath(context, points, bounds, radiusX, radiusY, hardness);
  const data = context.getImageData(0, 0, width, height).data;
  for (let index = 0; index < soft.length; index++) {
    const alpha = data[index * 4 + 3];
    soft[index] = alpha;
    inpaint[index] = alpha > 32 ? 255 : 0;
  }
  return { inpaint, soft };
}

function stampSoftPath(
  context: CanvasRenderingContext2D,
  points: Array<[number, number]>,
  bounds: PatchBounds,
  radiusX: number,
  radiusY: number,
  hardness: number,
): void {
  context.fillStyle = "#fff";
  context.strokeStyle = "#fff";
  context.lineCap = "round";
  context.lineJoin = "round";
  const hard = hardness >= 0.98;
  context.lineWidth = Math.max(1, Math.min(radiusX, radiusY) * 2 * Math.max(0.2, hardness));
  if (hard) {
    context.beginPath();
    context.moveTo(points[0][0] - bounds.x, points[0][1] - bounds.y);
    for (const point of points.slice(1)) context.lineTo(point[0] - bounds.x, point[1] - bounds.y);
    context.stroke();
  }
  for (const point of points) {
    const x = point[0] - bounds.x;
    const y = point[1] - bounds.y;
    context.beginPath();
    if (hard) {
      context.fillStyle = "#fff";
      context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.save();
    context.translate(x, y);
    context.scale(Math.max(0.5, radiusX), Math.max(0.5, radiusY));
    const gradient = context.createRadialGradient(0, 0, Math.max(0.01, hardness), 0, 0, 1);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(Math.max(0.05, Math.min(0.9, hardness)), "rgba(255,255,255,0.85)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.arc(0, 0, 1, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

type PatchBounds = { x: number; y: number; width: number; height: number };

function patchBounds(
  points: Array<[number, number]>,
  radiusX: number,
  radiusY: number,
  width: number,
  height: number,
): PatchBounds | null {
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point[0] - radiusX))));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point[1] - radiusY))));
  const maxX = Math.min(width, Math.ceil(Math.max(...points.map((point) => point[0] + radiusX))));
  const maxY = Math.min(height, Math.ceil(Math.max(...points.map((point) => point[1] + radiusY))));
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function cropPixels(pixels: RasterPixelBuffer, bounds: PatchBounds): RasterPixelBuffer {
  const output = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let y = 0; y < bounds.height; y++) {
    const sourceStart = ((bounds.y + y) * pixels.width + bounds.x) * 4;
    output.set(
      pixels.data.subarray(sourceStart, sourceStart + bounds.width * 4),
      y * bounds.width * 4,
    );
  }
  return { width: bounds.width, height: bounds.height, data: output };
}

function pixelBufferToDataUrl(buffer: RasterPixelBuffer): string {
  const canvas = document.createElement("canvas");
  canvas.width = buffer.width;
  canvas.height = buffer.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create retouch patch canvas.");
  const imageData = new ImageData(buffer.width, buffer.height);
  imageData.data.set(buffer.data);
  context.putImageData(imageData, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  registerRasterRetouchSource(dataUrl, canvas);
  return dataUrl;
}

function imageDataToBuffer(imageData: ImageData): RasterPixelBuffer {
  return { width: imageData.width, height: imageData.height, data: imageData.data };
}

function applyAlphaMask(buffer: RasterPixelBuffer, mask: Uint8Array): RasterPixelBuffer {
  const data = new Uint8ClampedArray(buffer.data);
  for (let index = 0; index < mask.length; index++) data[index * 4 + 3] = mask[index] ?? 0;
  return { ...buffer, data };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}
