/**
 * Non-destructive pixel selection model.
 *
 * Selection geometry is stored in normalized image-local coordinates so it
 * remains attached when an ImageElement is moved, rotated, or resized. The
 * operation list is intentionally small: callers only need to append a
 * shape, clear a selection, or replace it. Rendering/compositing details stay
 * behind this module's interface.
 */

import { getRasterSelectionMaskSource, registerRasterSelectionMask } from "./selectionMask";

export type RasterSelectionMode = "replace" | "add" | "subtract" | "intersect";

export type NormalizedPoint = [number, number];

export type RasterSelectionShape =
  | {
      kind: "rect" | "ellipse";
      x: number;
      y: number;
      width: number;
      height: number;
    }
  | {
      kind: "lasso" | "polygon";
      points: NormalizedPoint[];
    }
  | {
      kind: "bitmap";
      dataUrl: string;
    };

export type RasterSelectionOperation = {
  id: string;
  mode: RasterSelectionMode;
  shape: RasterSelectionShape;
};

export type RasterSelection = {
  /** Dimensions of the image-local coordinate system at creation time. */
  width: number;
  height: number;
  operations: RasterSelectionOperation[];
};

export function createRasterSelection(width: number, height: number): RasterSelection {
  return { width: Math.max(1, width), height: Math.max(1, height), operations: [] };
}

export function createRasterSelectionOperation(
  mode: RasterSelectionMode,
  shape: RasterSelectionShape,
): RasterSelectionOperation {
  return {
    id: crypto.randomUUID(),
    mode,
    shape: normalizeShape(shape),
  };
}

/** Append a user gesture while keeping replace/intersect semantics explicit. */
export function appendRasterSelection(
  current: RasterSelection | undefined,
  operation: RasterSelectionOperation,
  width: number,
  height: number,
): RasterSelection {
  const base = current ?? createRasterSelection(width, height);
  if (operation.mode === "replace") {
    return { ...base, width, height, operations: [operation] };
  }

  return {
    ...base,
    width,
    height,
    operations: [...base.operations, operation],
  };
}

export function normalizeImagePoint(
  point: [number, number],
  width: number,
  height: number,
): NormalizedPoint {
  return [clamp01(point[0] / Math.max(1, width)), clamp01(point[1] / Math.max(1, height))];
}

/** Match Photoshop's marquee modifier behavior: Shift add, Option subtract, Shift+Option intersect. */
export function selectionModeFromModifiers(modifiers: {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): RasterSelectionMode {
  if (modifiers.shiftKey && modifiers.altKey) return "intersect";
  if (modifiers.altKey) return "subtract";
  if (modifiers.shiftKey) return "add";
  return "replace";
}

/** Add one Polygon Lasso click while ignoring an accidental duplicate point. */
export function appendRasterPolygonPoint(
  points: NormalizedPoint[],
  point: NormalizedPoint,
  minDistance = 0.5,
): NormalizedPoint[] {
  const last = points.at(-1);
  if (last && Math.hypot(point[0] - last[0], point[1] - last[1]) < minDistance) return points;
  return [...points, point];
}

export function canCommitRasterPolygon(points: NormalizedPoint[]): boolean {
  return points.length >= 3;
}

export function normalizeShape(shape: RasterSelectionShape): RasterSelectionShape {
  if (shape.kind === "rect" || shape.kind === "ellipse") {
    const x = clamp01(shape.x);
    const y = clamp01(shape.y);
    const right = clamp01(shape.x + shape.width);
    const bottom = clamp01(shape.y + shape.height);
    return {
      kind: shape.kind,
      x: Math.min(x, right),
      y: Math.min(y, bottom),
      width: Math.abs(right - x),
      height: Math.abs(bottom - y),
    };
  }

  if (shape.kind === "lasso" || shape.kind === "polygon") {
    return {
      kind: shape.kind,
      points: compactPoints(shape.points.map(([x, y]) => [clamp01(x), clamp01(y)])),
    };
  }

  return shape;
}

/** Return a closed outline suitable for SVG/canvas preview. */
export function shapeOutline(shape: RasterSelectionShape, samples = 48): NormalizedPoint[] {
  if (shape.kind === "rect") {
    return [
      [shape.x, shape.y],
      [shape.x + shape.width, shape.y],
      [shape.x + shape.width, shape.y + shape.height],
      [shape.x, shape.y + shape.height],
    ];
  }

  if (shape.kind === "ellipse") {
    const points: NormalizedPoint[] = [];
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      points.push([
        cx + (Math.cos(angle) * shape.width) / 2,
        cy + (Math.sin(angle) * shape.height) / 2,
      ]);
    }
    return points;
  }

  if (shape.kind === "lasso" || shape.kind === "polygon") return shape.points;
  return [];
}

/**
 * Rasterize the current Selection into an alpha mask for a destructive-looking
 * edit that is still represented non-destructively as a clipped stroke.
 */
export function createRasterSelectionMaskDataUrl(
  selection: RasterSelection | undefined,
  width: number,
  height: number,
): string | undefined {
  if (!selection?.operations.length || typeof document === "undefined") return undefined;
  const safeWidth = Math.max(1, Math.ceil(width));
  const safeHeight = Math.max(1, Math.ceil(height));
  const canvas = document.createElement("canvas");
  canvas.width = safeWidth;
  canvas.height = safeHeight;
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  const operationCanvas = document.createElement("canvas");
  operationCanvas.width = safeWidth;
  operationCanvas.height = safeHeight;
  const operationContext = operationCanvas.getContext("2d");
  if (!operationContext) return undefined;

  for (const operation of selection.operations) {
    operationContext.clearRect(0, 0, safeWidth, safeHeight);
    if (!drawSelectionShape(operationContext, operation.shape, safeWidth, safeHeight)) {
      return undefined;
    }

    if (operation.mode === "replace") {
      context.clearRect(0, 0, safeWidth, safeHeight);
      context.globalCompositeOperation = "source-over";
      context.drawImage(operationCanvas, 0, 0);
    } else {
      context.globalCompositeOperation =
        operation.mode === "subtract"
          ? "destination-out"
          : operation.mode === "intersect"
            ? "destination-in"
            : "source-over";
      context.drawImage(operationCanvas, 0, 0);
    }
  }
  context.globalCompositeOperation = "source-over";
  const dataUrl = canvas.toDataURL("image/png");
  registerRasterSelectionMask(dataUrl, canvas);
  return dataUrl;
}

/** Convert a transparent subject result into a lightweight grayscale mask. */
export async function createAlphaMaskDataUrl(imageDataUrl: string): Promise<string> {
  if (typeof Image === "undefined" || typeof document === "undefined") {
    throw new Error("Alpha mask creation requires a browser environment.");
  }
  const image = new Image();
  image.src = imageDataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load subject mask image."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create subject mask canvas.");
  context.drawImage(image, 0, 0);
  const source = context.getImageData(0, 0, canvas.width, canvas.height);
  const mask = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < source.data.length; i += 4) {
    mask.data[i] = 255;
    mask.data[i + 1] = 255;
    mask.data[i + 2] = 255;
    mask.data[i + 3] = source.data[i + 3];
  }
  context.putImageData(mask, 0, 0);
  return canvas.toDataURL("image/png");
}

function compactPoints(points: NormalizedPoint[]): NormalizedPoint[] {
  if (points.length < 3) return points;
  const compacted: NormalizedPoint[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = compacted[compacted.length - 1];
    const next = points[i];
    if (Math.hypot(next[0] - prev[0], next[1] - prev[1]) >= 0.002) compacted.push(next);
  }
  return compacted.length >= 3 ? compacted : points;
}

function drawSelectionShape(
  context: CanvasRenderingContext2D,
  shape: RasterSelectionShape,
  width: number,
  height: number,
): boolean {
  context.fillStyle = "#ffffff";
  context.globalCompositeOperation = "source-over";
  if (shape.kind === "bitmap") {
    const source = getRasterSelectionMaskSource(shape.dataUrl);
    if (!source) return false;
    context.drawImage(source, 0, 0, width, height);
    return true;
  }

  if (shape.kind === "rect") {
    context.fillRect(shape.x * width, shape.y * height, shape.width * width, shape.height * height);
    return true;
  }

  if (shape.kind === "ellipse") {
    context.beginPath();
    context.ellipse(
      (shape.x + shape.width / 2) * width,
      (shape.y + shape.height / 2) * height,
      (shape.width * width) / 2,
      (shape.height * height) / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    return true;
  }

  if (shape.kind !== "lasso" && shape.kind !== "polygon") return false;
  if (shape.points.length < 3) return true;
  context.beginPath();
  context.moveTo(shape.points[0][0] * width, shape.points[0][1] * height);
  for (const point of shape.points.slice(1)) {
    context.lineTo(point[0] * width, point[1] * height);
  }
  context.closePath();
  context.fill();
  return true;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
