"use client";

import { useMemo } from "react";
import type { ImageElement } from "@/lib/engine/types";
import {
  type RasterSelection,
  type RasterSelectionMode,
  type RasterSelectionOperation,
  type RasterSelectionShape,
  shapeOutline,
} from "@/lib/raster/selection";

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
        <polygon
          points={[p0, px, worldToScreen(imageLocalToWorld(image, [image.width, image.height])), py]
            .map((point) => `${point.x},${point.y}`)
            .join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          className="raster-selection-outline"
        />
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
