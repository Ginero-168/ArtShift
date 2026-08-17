"use client";

import { useEffect, useRef, useState } from "react";
import { getFramePolaroidCutout, getFrameShapeSVGPath } from "@/lib/engine/frameMask";
import { getCached } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { FrameElement } from "@/lib/engine/types";
import type { WorldPoint } from "./CanvasRoot";

type Props = {
  frame: FrameElement;
  worldToScreen: (pt: WorldPoint) => { x: number; y: number };
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  scale: number;
  onClose: () => void;
};

export default function FrameEditOverlay({
  frame,
  worldToScreen,
  clientToWorld,
  scale,
  onClose,
}: Props) {
  const updateElements = useEngine((s) => s.updateElements);
  const containerRef = useRef<HTMLDivElement>(null);

  // Cached image
  const cached = frame.imageFileId ? getCached(frame.imageFileId) : null;
  const naturalW = cached?.width ?? frame.width;
  const naturalH = cached?.height ?? frame.height;

  // Geometry calculations
  const shape = frame.shape ?? "rect";
  const bounds =
    shape === "polaroid"
      ? getFramePolaroidCutout(frame.width, frame.height)
      : { x: 0, y: 0, width: frame.width, height: frame.height };

  const baseScale = Math.max(bounds.width / naturalW, bounds.height / naturalH);
  const zoom = frame.cropZoom ?? 1;
  const imgW = naturalW * baseScale * zoom;
  const imgH = naturalH * baseScale * zoom;
  const panX = frame.cropOffsetX ?? 0;
  const panY = frame.cropOffsetY ?? 0;
  const rotation = frame.cropRotation ?? 0;

  // Screen coordinates
  const frameScreen = worldToScreen({ x: frame.x, y: frame.y });
  const frameScreenW = frame.width * scale;
  const frameScreenH = frame.height * scale;

  // Center of the image relative to frame origin
  const imgCenterLocalX = bounds.x + bounds.width / 2 + panX;
  const imgCenterLocalY = bounds.y + bounds.height / 2 + panY;

  // Drag interaction state
  const [dragState, setDragState] = useState<{
    type: "pan" | "zoom" | "rotate";
    startX: number;
    startY: number;
    origPanX: number;
    origPanY: number;
    origZoom: number;
    origRotation: number;
    handleCorner?: "tl" | "tr" | "bl" | "br";
  } | null>(null);

  // Keyboard shortcut (Escape / Enter to close)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Pointer drag events
  const handlePointerDown = (
    e: React.PointerEvent,
    type: "pan" | "zoom" | "rotate",
    handleCorner?: "tl" | "tr" | "bl" | "br",
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setDragState({
      type,
      startX: e.clientX,
      startY: e.clientY,
      origPanX: panX,
      origPanY: panY,
      origZoom: zoom,
      origRotation: rotation,
      handleCorner,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    e.stopPropagation();
    e.preventDefault();

    const dx = (e.clientX - dragState.startX) / scale;
    const dy = (e.clientY - dragState.startY) / scale;

    if (dragState.type === "pan") {
      updateElements(
        [
          {
            id: frame.id,
            patch: {
              cropOffsetX: Math.round(dragState.origPanX + dx),
              cropOffsetY: Math.round(dragState.origPanY + dy),
            },
          },
        ],
        "pan frame photo",
      );
    } else if (dragState.type === "zoom") {
      // Zoom based on radial distance or vertical drag
      const delta = Math.hypot(dx, dy) * (dy < 0 || dx > 0 ? 1 : -1);
      const newZoom = Math.min(3, Math.max(0.5, dragState.origZoom + delta / 200));
      updateElements(
        [
          {
            id: frame.id,
            patch: {
              cropZoom: Number(newZoom.toFixed(2)),
            },
          },
        ],
        "zoom frame photo",
      );
    } else if (dragState.type === "rotate") {
      // Calculate angle from center of image
      const worldCursor = clientToWorld(e.clientX, e.clientY);
      const centerWorld = {
        x: frame.x + imgCenterLocalX,
        y: frame.y + imgCenterLocalY,
      };
      const angleRad = Math.atan2(worldCursor.y - centerWorld.y, worldCursor.x - centerWorld.x);
      // Offset by -90 deg since handle is at top
      let angleDeg = Math.round(((angleRad + Math.PI / 2) * 180) / Math.PI);
      if (angleDeg > 180) angleDeg -= 360;
      if (angleDeg < -180) angleDeg += 360;

      // Snap to 0°, 90°, -90°, 180° within 4 degrees
      if (Math.abs(angleDeg) < 4) angleDeg = 0;
      if (Math.abs(angleDeg - 90) < 4) angleDeg = 90;
      if (Math.abs(angleDeg + 90) < 4) angleDeg = -90;

      updateElements(
        [
          {
            id: frame.id,
            patch: {
              cropRotation: angleDeg,
            },
          },
        ],
        "rotate frame photo",
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDragState(null);
    }
  };

  const maskSvgPath = getFrameShapeSVGPath(shape, frame.width, frame.height, frame.cornerRadius);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        zIndex: 50,
        cursor: dragState ? (dragState.type === "pan" ? "grabbing" : "crosshair") : "default",
      }}
      onPointerDown={(e) => {
        // Clicking outside frame commits & closes
        if (e.target === containerRef.current) onClose();
      }}
    >
      {/* Frame Container */}
      <div
        style={{
          position: "absolute",
          left: frameScreen.x,
          top: frameScreen.y,
          width: frameScreenW,
          height: frameScreenH,
          transformOrigin: "0 0",
        }}
      >
        {/* SVG Mask Definition & Guide Outline */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${frame.width} ${frame.height}`}
        >
          <defs>
            <clipPath id={`frame-edit-clip-${frame.id}`}>
              <path d={maskSvgPath} />
            </clipPath>
          </defs>

          {/* Mask Guide Line */}
          <path
            d={maskSvgPath}
            fill="none"
            stroke="#0284c7"
            strokeWidth={2 / scale}
            strokeDasharray="4 3"
          />
        </svg>

        {/* Live Photo Container with Inner Pan, Zoom & Rotation */}
        <div
          style={{
            position: "absolute",
            left: imgCenterLocalX * scale,
            top: imgCenterLocalY * scale,
            width: imgW * scale,
            height: imgH * scale,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
            transformOrigin: "center center",
            cursor: "grab",
            userSelect: "none",
          }}
          onPointerDown={(e) => handlePointerDown(e, "pan")}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {/* Dimmed Whole Image (Shows parts outside the mask) */}
          {cached?.dataURL && (
            // biome-ignore lint/performance/noImgElement: direct canvas overlay dataURL
            <img
              src={cached.dataURL}
              alt=""
              aria-hidden="true"
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "fill",
                opacity: 0.35,
                pointerEvents: "none",
                display: "block",
              }}
            />
          )}

          {/* Image Selection Bounding Box */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: "1.5px solid #2563eb",
              borderRadius: 2,
              pointerEvents: "none",
            }}
          />

          {/* 4 Corner Resize Handles */}
          {(["tl", "tr", "bl", "br"] as const).map((corner) => {
            const isTop = corner.startsWith("t");
            const isLeft = corner.endsWith("l");
            return (
              <div
                key={corner}
                style={{
                  position: "absolute",
                  top: isTop ? -5 : undefined,
                  bottom: !isTop ? -5 : undefined,
                  left: isLeft ? -5 : undefined,
                  right: !isLeft ? -5 : undefined,
                  width: 10,
                  height: 10,
                  background: "#ffffff",
                  border: "2px solid #2563eb",
                  borderRadius: "50%",
                  cursor: isTop === isLeft ? "nwse-resize" : "nesw-resize",
                  pointerEvents: "auto",
                  zIndex: 2,
                }}
                onPointerDown={(e) => handlePointerDown(e, "zoom", corner)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            );
          })}

          {/* Rotation Stalk & Handle */}
          <div
            style={{
              position: "absolute",
              top: -24,
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              cursor: "crosshair",
              pointerEvents: "auto",
              zIndex: 3,
            }}
            onPointerDown={(e) => handlePointerDown(e, "rotate")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#ffffff",
                border: "2px solid #2563eb",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
            <div style={{ width: 1, height: 12, background: "#2563eb" }} />
          </div>
        </div>
      </div>

      {/* Floating Canva-Style Frame Edit Action Bar */}
      <div
        style={{
          position: "absolute",
          left: Math.max(16, frameScreen.x + frameScreenW / 2),
          top: Math.min(window.innerHeight - 80, frameScreen.y + frameScreenH + 20),
          transform: "translateX(-50%)",
          background: "#ffffff",
          borderRadius: 8,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          border: "1px solid #e2e8f0",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 60,
          pointerEvents: "auto",
          fontSize: 12,
          color: "#334155",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Zoom Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, color: "#64748b" }}>Zoom</span>
          <input
            type="range"
            min={100}
            max={300}
            value={Math.round(zoom * 100)}
            onChange={(e) =>
              updateElements(
                [{ id: frame.id, patch: { cropZoom: Number(e.currentTarget.value) / 100 } }],
                "frame zoom",
              )
            }
            style={{ width: 90, accentColor: "#2563eb", cursor: "pointer" }}
          />
          <span style={{ minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {Math.round(zoom * 100)}%
          </span>
        </div>

        <div style={{ width: 1, height: 18, background: "#e2e8f0" }} />

        {/* Rotate Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 600, color: "#64748b" }}>Rotate</span>
          <input
            type="range"
            min={-180}
            max={180}
            value={rotation}
            onChange={(e) =>
              updateElements(
                [{ id: frame.id, patch: { cropRotation: Number(e.currentTarget.value) } }],
                "frame rotate",
              )
            }
            style={{ width: 80, accentColor: "#2563eb", cursor: "pointer" }}
          />
          <span style={{ minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {rotation}°
          </span>
          {rotation !== 0 && (
            <button
              type="button"
              onClick={() =>
                updateElements([{ id: frame.id, patch: { cropRotation: 0 } }], "reset rotation")
              }
              style={{
                border: "none",
                background: "#f1f5f9",
                borderRadius: 4,
                padding: "2px 6px",
                fontSize: 11,
                cursor: "pointer",
                color: "#475569",
              }}
            >
              Reset
            </button>
          )}
        </div>

        <div style={{ width: 1, height: 18, background: "#e2e8f0" }} />

        {/* Center Button */}
        <button
          type="button"
          onClick={() =>
            updateElements(
              [
                {
                  id: frame.id,
                  patch: { cropOffsetX: 0, cropOffsetY: 0, cropZoom: 1, cropRotation: 0 },
                },
              ],
              "center photo",
            )
          }
          style={{
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            borderRadius: 6,
            padding: "4px 8px",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            color: "#334155",
          }}
        >
          Center
        </button>

        {/* Done Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "none",
            background: "#2563eb",
            color: "#ffffff",
            borderRadius: 6,
            padding: "5px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(37, 99, 235, 0.3)",
          }}
        >
          ✓ Done
        </button>
      </div>
    </div>
  );
}
