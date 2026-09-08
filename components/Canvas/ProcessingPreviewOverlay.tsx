"use client";

import { useRef, useState } from "react";
import {
  type ProcessingPreview,
  type ProcessingPreviewKind,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";
import type { WorldPoint } from "./CanvasRoot";

type Props = {
  preview: ProcessingPreview;
  scale: number;
  worldToScreen: (point: WorldPoint) => { x: number; y: number };
};

const PREVIEW_ACCENT: Record<ProcessingPreviewKind, string> = {
  extract: "#d97706",
  "remove-bg": "#0f766e",
  vectorize: "#4f46e5",
  upscale: "#7c3aed",
  generate: "#2563eb",
};

const PREVIEW_ICON: Record<ProcessingPreviewKind, string> = {
  extract: "✂",
  "remove-bg": "✦",
  vectorize: "◇",
  upscale: "↗",
  generate: "✦",
};

export default function ProcessingPreviewOverlay({ preview, scale, worldToScreen }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const screen = worldToScreen({ x: preview.x, y: preview.y });
  const accent = PREVIEW_ACCENT[preview.kind];
  const progress = preview.progress === null ? null : Math.round(preview.progress * 100);
  const isQueued = preview.phase === "queued";
  const phaseMessage = preview.message ?? (isQueued ? "รอคิวประมวลผล…" : "กำลังประมวลผล…");

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    try {
      if (typeof e.currentTarget.setPointerCapture === "function") {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    } catch {}
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: preview.x,
      origY: preview.y,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    const effectiveScale = Math.max(0.01, scale);
    const dx = (e.clientX - dragRef.current.startX) / effectiveScale;
    const dy = (e.clientY - dragRef.current.startY) / effectiveScale;
    updateProcessingPreview(preview.id, {
      x: Math.round(dragRef.current.origX + dx),
      y: Math.round(dragRef.current.origY + dy),
      userDragged: true,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    try {
      if (typeof e.currentTarget.releasePointerCapture === "function") {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    dragRef.current = null;
    setIsDragging(false);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    try {
      if (typeof e.currentTarget.releasePointerCapture === "function") {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}
    dragRef.current = null;
    setIsDragging(false);
  };

  return (
    <div
      data-testid="processing-preview"
      data-preview-kind={preview.kind}
      data-preview-x={preview.x}
      data-preview-y={preview.y}
      data-preview-width={preview.width}
      data-preview-height={preview.height}
      data-preview-phase={preview.phase}
      data-preview-queue-position={preview.queuePosition}
      data-preview-dragging={isDragging ? "true" : "false"}
      role="status"
      aria-live="polite"
      aria-label={`${preview.label} ${isQueued ? "queued" : "loading"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        width: preview.width,
        height: preview.height,
        transform: `scale(${Math.max(0.1, scale)})`,
        transformOrigin: "top left",
        pointerEvents: "auto",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        zIndex: 48,
        overflow: "hidden",
        boxSizing: "border-box",
        border: `1.5px solid ${isDragging ? accent : `${accent}99`}`,
        borderRadius: 14,
        background: isDragging ? "rgba(255, 255, 255, 0.88)" : "rgba(255, 255, 255, 0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: isDragging
          ? `0 18px 36px rgba(15, 23, 42, 0.28), 0 0 0 2px ${accent}44`
          : "0 10px 28px rgba(15, 23, 42, 0.18)",
        color: "#111827",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        opacity: isQueued ? 0.8 : 1,
        transition: isDragging ? "none" : "border-color 150ms, box-shadow 150ms, background 150ms",
      }}
    >
      {preview.sourceDataUrl ? (
        // biome-ignore lint/performance/noImgElement: transient local image preview
        <img
          src={preview.sourceDataUrl}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            opacity: 0.24,
            filter: "blur(1px) saturate(0.7)",
            userSelect: "none",
            pointerEvents: "none",
          }}
        />
      ) : null}
      <div
        data-testid="processing-preview-swipe"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.72,
          background:
            "linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.8) 45%, transparent 70%), repeating-linear-gradient(0deg, rgba(99,102,241,0.06) 0 12px, transparent 12px 24px)",
          backgroundSize: "220% 100%, 100% 100%",
          animation: "model-manager-shimmer 1.5s linear infinite",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 9,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span
            className="model-manager-spin"
            aria-hidden="true"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 30,
              height: 30,
              border: `2px solid ${accent}33`,
              borderTopColor: accent,
              borderRadius: "50%",
              color: accent,
              fontSize: 16,
              flex: "0 0 auto",
            }}
          >
            {PREVIEW_ICON[preview.kind]}
          </span>
          <div style={{ minWidth: 0 }}>
            <strong style={{ display: "block", fontSize: 13, lineHeight: 1.2 }}>
              {preview.label}
            </strong>
            <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "#6b7280" }}>
              {phaseMessage}
            </span>
          </div>
        </div>
        <div
          data-testid="processing-preview-drag-handle"
          title="คลิกและลากเพื่อเลื่อนตำแหน่ง (Drag to move)"
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            padding: "2px 6px",
            borderRadius: 6,
            background: isDragging ? `${accent}22` : "rgba(0, 0, 0, 0.05)",
            color: isDragging ? accent : "#6b7280",
            fontSize: 10,
            fontWeight: 500,
            pointerEvents: "none",
            flexShrink: 0,
            transition: "all 150ms ease",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="2" />
            <circle cx="15" cy="6" r="2" />
            <circle cx="9" cy="12" r="2" />
            <circle cx="15" cy="12" r="2" />
            <circle cx="9" cy="18" r="2" />
            <circle cx="15" cy="18" r="2" />
          </svg>
          <span>{isDragging ? "กำลังย้าย" : "เลื่อนได้"}</span>
        </div>
      </div>
      <div style={{ position: "relative", pointerEvents: "none" }}>
        <div
          aria-hidden="true"
          style={{
            height: 6,
            borderRadius: 999,
            background: `${accent}22`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: progress === null ? "38%" : `${progress}%`,
              height: "100%",
              borderRadius: 999,
              background: accent,
              transition: "width 180ms ease-out",
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 6,
            fontSize: 10,
            color: "#6b7280",
          }}
        >
          <span>Preview</span>
          <span>{progress === null ? "กำลังทำงาน" : `${progress}%`}</span>
        </div>
      </div>
    </div>
  );
}
