"use client";

import { useRef, useState } from "react";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import type { WorldPoint } from "./CanvasRoot";

type Props = {
  element: ImageElement;
  worldToScreen: (pt: WorldPoint) => { x: number; y: number };
  scale: number;
};

const HANDLE_SIZE = 8;
const MIN_SIZE = 10;

export default function CropOverlay({ element, worldToScreen, scale }: Props) {
  const updateElements = useEngine((s) => s.updateElements);
  const setCroppingImageId = useEngine((s) => s.setCroppingImageId);
  const [drag, setDrag] = useState<{
    edge:
      | "left"
      | "right"
      | "top"
      | "bottom"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origCropX: number;
    origCropY: number;
    origCropW: number;
    origCropH: number;
  } | null>(null);

  const initCrop = () => {
    if (element.crop) return element.crop;
    return {
      x: 0,
      y: 0,
      width: element.naturalWidth,
      height: element.naturalHeight,
    };
  };

  const onPointerDown = (
    e: React.PointerEvent,
    edge: typeof drag extends { edge: infer E } | null ? E : never,
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const crop = initCrop();
    setDrag({
      edge,
      startX: e.clientX,
      startY: e.clientY,
      origX: element.x,
      origY: element.y,
      origW: element.width,
      origH: element.height,
      origCropX: crop.x,
      origCropY: crop.y,
      origCropW: crop.width,
      origCropH: crop.height,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();

    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;

    let { origX: x, origY: y, origW: w, origH: h } = drag;
    let { origCropX: cx, origCropY: cy, origCropW: cw, origCropH: ch } = drag;

    const scaleX = drag.origCropW / drag.origW;
    const scaleY = drag.origCropH / drag.origH;

    if (drag.edge.includes("left")) {
      const delta = Math.min(dx, w - MIN_SIZE);
      x += delta;
      w -= delta;
      cx += delta * scaleX;
      cw -= delta * scaleX;
    }
    if (drag.edge.includes("right")) {
      const delta = Math.max(dx, MIN_SIZE - w);
      w += delta;
      cw += delta * scaleX;
    }
    if (drag.edge.includes("top")) {
      const delta = Math.min(dy, h - MIN_SIZE);
      y += delta;
      h -= delta;
      cy += delta * scaleY;
      ch -= delta * scaleY;
    }
    if (drag.edge.includes("bottom")) {
      const delta = Math.max(dy, MIN_SIZE - h);
      h += delta;
      ch += delta * scaleY;
    }

    updateElements(
      [
        {
          id: element.id,
          patch: { x, y, width: w, height: h, crop: { x: cx, y: cy, width: cw, height: ch } },
        },
      ],
      "crop",
    );
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
  };

  // Convert element bounds to screen coordinates.
  // Note: we assume no rotation for simple cropping right now.
  const tl = worldToScreen({ x: element.x, y: element.y });
  const br = worldToScreen({ x: element.x + element.width, y: element.y + element.height });
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  return (
    <div
      style={{
        position: "absolute",
        left: tl.x,
        top: tl.y,
        width: w,
        height: h,
        outline: "2px solid #3b82f6",
        pointerEvents: "none",
        zIndex: 10,
        transform: `rotate(${element.angle}rad)`,
      }}
    >
      {/* Background overlay (dimming effect around crop could go here if we had the full image bounds) */}

      {/* Handles */}
      <Handle
        edge="top"
        x={w / 2}
        y={0}
        cursor="ns-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="bottom"
        x={w / 2}
        y={h}
        cursor="ns-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="left"
        x={0}
        y={h / 2}
        cursor="ew-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="right"
        x={w}
        y={h / 2}
        cursor="ew-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      <Handle
        edge="top-left"
        x={0}
        y={0}
        cursor="nwse-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="top-right"
        x={w}
        y={0}
        cursor="nesw-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="bottom-left"
        x={0}
        y={h}
        cursor="nesw-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <Handle
        edge="bottom-right"
        x={w}
        y={h}
        cursor="nwse-resize"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />

      {/* Done cropping button overlay */}
      <div
        style={{
          position: "absolute",
          top: -40,
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "auto",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setCroppingImageId(null);
          }}
          style={{
            background: "#3b82f6",
            color: "white",
            padding: "4px 12px",
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Handle({
  edge,
  x,
  y,
  cursor,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  edge: any;
  x: number;
  y: number;
  cursor: string;
  onPointerDown: (e: React.PointerEvent, edge: any) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      onPointerDown={(e) => onPointerDown(e, edge)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: "absolute",
        left: x - HANDLE_SIZE / 2,
        top: y - HANDLE_SIZE / 2,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        background: "white",
        border: "1px solid #3b82f6",
        borderRadius: edge.includes("-") ? "50%" : 2, // circles for corners, squares for edges
        cursor,
        pointerEvents: "auto",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
      }}
    />
  );
}
