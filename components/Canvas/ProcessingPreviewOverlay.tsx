"use client";

import type { ProcessingPreview, ProcessingPreviewKind } from "@/lib/engine/processingPreview";
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
};

const PREVIEW_ICON: Record<ProcessingPreviewKind, string> = {
  extract: "✂",
  "remove-bg": "✦",
  vectorize: "◇",
};

export default function ProcessingPreviewOverlay({ preview, scale, worldToScreen }: Props) {
  const screen = worldToScreen({ x: preview.x, y: preview.y });
  const accent = PREVIEW_ACCENT[preview.kind];
  const progress = Math.round(preview.progress * 100);

  return (
    <div
      data-testid="processing-preview"
      data-preview-kind={preview.kind}
      data-preview-x={preview.x}
      data-preview-y={preview.y}
      data-preview-width={preview.width}
      data-preview-height={preview.height}
      role="status"
      aria-live="polite"
      aria-label={`${preview.label} loading`}
      style={{
        position: "absolute",
        left: screen.x,
        top: screen.y,
        width: preview.width,
        height: preview.height,
        transform: `scale(${Math.max(0.1, scale)})`,
        transformOrigin: "top left",
        pointerEvents: "none",
        zIndex: 48,
        overflow: "hidden",
        boxSizing: "border-box",
        border: `1px solid ${accent}`,
        borderRadius: 12,
        background: "rgba(255, 255, 255, 0.62)",
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.2)",
        color: "#111827",
        padding: 14,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
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
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9 }}>
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
            {preview.message ?? "กำลังประมวลผล…"}
          </span>
        </div>
      </div>
      <div style={{ position: "relative" }}>
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
              width: `${progress}%`,
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
          <span>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
