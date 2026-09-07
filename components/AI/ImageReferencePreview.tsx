"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  type PlacedImagePreview,
  placeImagePreview,
} from "@/lib/ai/orchestration/previewPlacement";

type Props = {
  anchor: HTMLElement;
  dataUrl?: string;
  displayName: string;
  width: number;
  height: number;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onClose: () => void;
};

export default function ImageReferencePreview({
  anchor,
  dataUrl,
  displayName,
  width,
  height,
  onPointerEnter,
  onPointerLeave,
  onClose,
}: Props) {
  const [placement, setPlacement] = useState<PlacedImagePreview | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      setPlacement(
        placeImagePreview(
          {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          },
          { width: Math.max(1, width), height: Math.max(1, height) },
          {
            left: viewport?.offsetLeft ?? 0,
            top: viewport?.offsetTop ?? 0,
            width: viewport?.width ?? window.innerWidth,
            height: viewport?.height ?? window.innerHeight,
          },
        ),
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [anchor, height, width]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!placement || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-testid="selected-image-preview"
      role="tooltip"
      aria-label={`Preview of ${displayName}`}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={{
        position: "fixed",
        left: placement.left,
        top: placement.top,
        width: placement.width,
        height: placement.height,
        zIndex: 1000,
        boxSizing: "border-box",
        overflow: "hidden",
        border: "1px solid #6366f1",
        borderRadius: 8,
        background: "#0f172a",
        boxShadow: "0 6px 16px rgba(15, 23, 42, 0.24)",
        pointerEvents: "auto",
      }}
    >
      {dataUrl ? (
        // biome-ignore lint/performance/noImgElement: portal preview of a local cached image
        <img
          src={dataUrl}
          alt={displayName}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "grid",
            placeItems: "center",
            padding: 16,
            color: "#cbd5e1",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.4,
            textAlign: "center",
          }}
        >
          กำลังโหลด {displayName}
        </div>
      )}
      <button
        type="button"
        aria-label="Close image preview"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          padding: 0,
          border: 0,
          borderRadius: "50%",
          background: "rgba(15, 23, 42, 0.72)",
          color: "#fff",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: "18px",
        }}
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
