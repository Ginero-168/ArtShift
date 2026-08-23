"use client";

import { useEffect, useMemo, useState } from "react";
import type { ImageElement } from "@/lib/engine/types";
import {
  type RasterSelection,
  type RasterSelectionMode,
  type RasterSelectionOperation,
  type RasterSelectionShape,
  shapeOutline,
} from "@/lib/raster/selection";
import { getRasterSelectionMaskSource } from "@/lib/raster/selectionMask";

type WorldPoint = { x: number; y: number };

type Props = {
  image: ImageElement;
  selection?: RasterSelection;
  draft?: {
    shape: RasterSelectionShape;
    mode: RasterSelectionMode;
  } | null;
  worldToScreen: (point: WorldPoint) => WorldPoint;
};

/**
 * Lightweight selection feedback. It never participates in hit testing and
 * does not repaint the main editor canvas, so pointer moves stay cheap.
 */
export default function RasterSelectionOverlay({ image, selection, draft, worldToScreen }: Props) {
  const operations = useMemo(() => {
    const committed = selection?.operations ?? [];
    return draft
      ? [
          ...committed,
          {
            id: "draft",
            mode: draft.mode,
            shape: draft.shape,
          } satisfies RasterSelectionOperation,
        ]
      : committed;
  }, [draft, selection?.operations]);

  if (!operations.length) return null;

  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        zIndex: 4,
      }}
    >
      {operations.map((operation) => (
        <SelectionOperationPreview
          key={operation.id}
          image={image}
          operation={operation}
          worldToScreen={worldToScreen}
        />
      ))}
    </svg>
  );
}

function SelectionOperationPreview({
  image,
  operation,
  worldToScreen,
}: {
  image: ImageElement;
  operation: RasterSelectionOperation;
  worldToScreen: (point: WorldPoint) => WorldPoint;
}) {
  const outline = shapeOutline(operation.shape);
  const bitmapSegments = useBitmapOutline(
    operation.shape.kind === "bitmap" ? operation.shape.dataUrl : undefined,
  );
  const screenPoints = outline.map((point) =>
    worldToScreen(imageLocalToWorld(image, [point[0] * image.width, point[1] * image.height])),
  );
  const points = screenPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const isSubtract = operation.mode === "subtract";
  const stroke = isSubtract ? "#ef4444" : "#2563eb";
  const fill = isSubtract ? "rgba(239,68,68,0.08)" : "rgba(37,99,235,0.14)";

  if (operation.shape.kind === "bitmap") {
    const p0 = worldToScreen(imageLocalToWorld(image, [0, 0]));
    const px = worldToScreen(imageLocalToWorld(image, [image.width, 0]));
    const py = worldToScreen(imageLocalToWorld(image, [0, image.height]));
    const bitmapPath = bitmapSegments
      .map(([from, to]) => {
        const fromScreen = worldToScreen(
          imageLocalToWorld(image, [from[0] * image.width, from[1] * image.height]),
        );
        const toScreen = worldToScreen(
          imageLocalToWorld(image, [to[0] * image.width, to[1] * image.height]),
        );
        return `M ${fromScreen.x} ${fromScreen.y} L ${toScreen.x} ${toScreen.y}`;
      })
      .join(" ");
    return (
      <g opacity={isSubtract ? 0.7 : 1}>
        <image
          href={operation.shape.dataUrl}
          x={0}
          y={0}
          width={1}
          height={1}
          preserveAspectRatio="none"
          transform={`matrix(${px.x - p0.x} ${px.y - p0.y} ${py.x - p0.x} ${py.y - p0.y} ${p0.x} ${p0.y})`}
          opacity={isSubtract ? 0.08 : 0.22}
        />
        {bitmapPath ? (
          <path
            d={bitmapPath}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className="raster-selection-outline"
          />
        ) : (
          <polygon
            points={[
              p0,
              px,
              worldToScreen(imageLocalToWorld(image, [image.width, image.height])),
              py,
            ]
              .map((point) => `${point.x},${point.y}`)
              .join(" ")}
            fill="none"
            stroke={stroke}
            strokeWidth={1.5}
            strokeDasharray="6 4"
            className="raster-selection-outline"
          />
        )}
      </g>
    );
  }

  if (screenPoints.length < 3) return null;
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      strokeDasharray="6 4"
      strokeLinejoin="round"
      className="raster-selection-outline"
    />
  );
}

type BitmapSegment = [[number, number], [number, number]];

function useBitmapOutline(dataUrl: string | undefined): BitmapSegment[] {
  const [segments, setSegments] = useState<BitmapSegment[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!dataUrl || typeof document === "undefined") {
      setSegments([]);
      return;
    }

    const update = () => {
      const source = getRasterSelectionMaskSource(dataUrl);
      if (!source) return;
      const next = traceBitmapBoundary(source);
      if (!cancelled) setSegments(next);
    };
    update();
    window.addEventListener("artshift:raster-mask-ready", update);
    return () => {
      cancelled = true;
      window.removeEventListener("artshift:raster-mask-ready", update);
    };
  }, [dataUrl]);

  return segments;
}

function traceBitmapBoundary(source: CanvasImageSource): BitmapSegment[] {
  const sampleSize = 256;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d");
  if (!context) return [];
  try {
    context.clearRect(0, 0, sampleSize, sampleSize);
    context.drawImage(source, 0, 0, sampleSize, sampleSize);
    const alpha = context.getImageData(0, 0, sampleSize, sampleSize).data;
    const selected = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < sampleSize &&
      y < sampleSize &&
      alpha[(y * sampleSize + x) * 4 + 3] > 32;
    const segments: BitmapSegment[] = [];
    for (let y = 0; y < sampleSize; y++) {
      for (let x = 0; x < sampleSize; x++) {
        if (!selected(x, y)) continue;
        const left = x / sampleSize;
        const right = (x + 1) / sampleSize;
        const top = y / sampleSize;
        const bottom = (y + 1) / sampleSize;
        if (!selected(x, y - 1))
          segments.push([
            [left, top],
            [right, top],
          ]);
        if (!selected(x + 1, y))
          segments.push([
            [right, top],
            [right, bottom],
          ]);
        if (!selected(x, y + 1))
          segments.push([
            [right, bottom],
            [left, bottom],
          ]);
        if (!selected(x - 1, y))
          segments.push([
            [left, bottom],
            [left, top],
          ]);
      }
    }
    return segments;
  } catch {
    return [];
  }
}

function imageLocalToWorld(image: ImageElement, point: [number, number]): WorldPoint {
  const cx = image.x + image.width / 2;
  const cy = image.y + image.height / 2;
  const dx = point[0] - image.width / 2;
  const dy = point[1] - image.height / 2;
  const cos = Math.cos(image.angle);
  const sin = Math.sin(image.angle);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}
