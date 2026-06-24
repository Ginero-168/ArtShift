"use client";

/**
 * PresetPanel — Shows saved presets in a floating panel.
 *
 * Renders mini-thumbnails of each preset using canvas. The user can:
 * - Click a preset to paste its elements onto the current slide
 * - Hover to see the preset name
 * - Click the × button to delete a preset
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getImageCache } from "@/lib/engine/imageCache";
import { type Preset, usePresetStore } from "@/lib/engine/presetStore";
import { useEngine } from "@/lib/engine/store";
import type { EngineElement, EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";

const THUMB_SIZE = 80;

type Props = {
  onClose: () => void;
};

export default function PresetPanel({ onClose }: Props) {
  const presets = usePresetStore((s) => s.presets);
  const deletePreset = usePresetStore((s) => s.deletePreset);
  const renamePreset = usePresetStore((s) => s.renamePreset);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: 44,
        left: "50%",
        transform: "translateX(-50%)",
        width: 280,
        maxHeight: "calc(100vh - 120px)",
        overflowY: "auto",
        background: "var(--surface-solid, #fff)",
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 10,
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
        padding: 12,
        zIndex: 20,
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          paddingBottom: 8,
          borderBottom: "1px solid var(--stroke, #e5e7eb)",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--ink, #111)" }}>
          ★ My Presets
        </span>
        <span style={{ fontSize: 10, color: "var(--ink-muted, #9ca3af)" }}>
          {presets.length} saved
        </span>
      </div>

      {/* Empty state */}
      {presets.length === 0 && (
        <div
          style={{
            textAlign: "center",
            color: "var(--ink-muted, #9ca3af)",
            padding: "24px 0",
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>⭐</div>
          <div style={{ fontSize: 11 }}>No presets yet.</div>
          <div style={{ fontSize: 10, marginTop: 4 }}>
            Right-click any object and choose
            <br />
            <strong>"Save to Preset"</strong>
          </div>
        </div>
      )}

      {/* Preset grid */}
      {presets.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_SIZE}px, 1fr))`,
            gap: 8,
          }}
        >
          {presets.map((p) => (
            <PresetCard
              key={p.id}
              preset={p}
              onDelete={() => deletePreset(p.id)}
              onClose={onClose}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A single preset card with canvas thumbnail */
function PresetCard({
  preset,
  onDelete,
  onClose,
}: {
  preset: Preset;
  onDelete: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const addElement = useEngine((s) => s.addElement);
  const [hovered, setHovered] = useState(false);

  // Render thumbnail
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(THUMB_SIZE * dpr);
    canvas.height = Math.round(THUMB_SIZE * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Create a virtual slide from preset elements to render them
    const elements = preset.elements.map((el) => ({
      ...el,
      id: el.id || crypto.randomUUID(),
    })) as EngineElement[];

    // Find bounding box
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of elements) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    const bw = maxX - minX || 100;
    const bh = maxY - minY || 100;
    const padding = 8;
    const available = THUMB_SIZE - padding * 2;
    const scale = Math.min(available / bw, available / bh, 1);

    ctx.fillStyle = "#fafafa";
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);

    ctx.save();
    const offsetX = (THUMB_SIZE - bw * scale) / 2 - minX * scale;
    const offsetY = (THUMB_SIZE - bh * scale) / 2 - minY * scale;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    const fakeSlide: EngineSlide = {
      id: "preview",
      name: "preview",
      background: "transparent",
      elements,
      width: bw + minX * 2,
      height: bh + minY * 2,
    };
    renderSlide(fakeSlide, { ctx, images: getImageCache() }, bw + minX * 2, bh + minY * 2);
    ctx.restore();
  }, [preset]);

  function handleClick() {
    // Paste preset elements onto the current slide at center
    const state = useEngine.getState();
    const slide = state.doc.slides.find((sl) => sl.id === state.currentSlideId);
    if (!slide) return;

    const centerX = slide.width / 2;
    const centerY = slide.height / 2;

    // Find bounding box of preset
    const els = preset.elements;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const el of els) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
      if (el.x + el.width > maxX) maxX = el.x + el.width;
      if (el.y + el.height > maxY) maxY = el.y + el.height;
    }
    const bw = maxX - minX;
    const bh = maxY - minY;
    const offsetX = centerX - bw / 2 - minX;
    const offsetY = centerY - bh / 2 - minY;

    // Add each element
    const newIds: string[] = [];
    for (const proto of els) {
      const el = {
        ...structuredClone(proto),
        id: crypto.randomUUID(),
        x: proto.x + offsetX,
        y: proto.y + offsetY,
      } as EngineElement;
      newIds.push(el.id);
      addElement(el, "paste preset");
    }

    // Select all pasted elements
    useEngine.setState({ selectedIds: new Set(newIds) });
    onClose();
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={handleClick}
        title={`${preset.name} (${preset.elements.length} element${preset.elements.length > 1 ? "s" : ""})`}
        style={{
          width: "100%",
          aspectRatio: "1",
          border: "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 6,
          overflow: "hidden",
          cursor: "pointer",
          background: "#fafafa",
          padding: 0,
          transition: "all 0.15s ease",
          outline: hovered ? "2px solid var(--accent, #6366f1)" : "none",
          outlineOffset: -1,
        }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      </button>

      {/* Name label */}
      <div
        style={{
          fontSize: 9,
          color: "var(--ink-muted, #6b7280)",
          textAlign: "center",
          marginTop: 3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {preset.name}
      </div>

      {/* Delete button */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 16,
            height: 16,
            borderRadius: 4,
            border: "none",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 10,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
          }}
          title="Delete preset"
        >
          ×
        </button>
      )}
    </div>
  );
}
