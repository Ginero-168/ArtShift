"use client";

/**
 * Left-rail slide list for the main editor.
 *
 * Matches the Excalidraw-style slide panel:
 * - Header: "N SLIDE" count + "+" add button
 * - Slide thumbnails with canvas rendering
 * - Collapse button at the bottom
 */

import { useEffect, useRef, useState } from "react";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { EngineSlide } from "@/lib/engine/types";
import { renderSlide } from "@/lib/renderer/canvas";

const THUMB_W = 120;

export default function SlideRail() {
  const slides = useEngine((s) => s.doc.slides);
  const currentSlideId = useEngine((s) => s.currentSlideId);
  const setCurrentSlide = useEngine((s) => s.setCurrentSlide);
  const addSlide = useEngine((s) => s.addSlide);
  const deleteSlide = useEngine((s) => s.deleteSlide);
  const renameSlide = useEngine((s) => s.renameSlide);
  const setSlideDimensions = useEngine((s) => s.setSlideDimensions);
  const reorderSlides = useEngine((s) => s.reorderSlides);

  const [collapsed, setCollapsed] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const [selectedSlideIds, setSelectedSlideIds] = useState<Set<string>>(new Set());

  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    slideId: string;
    index: number;
  } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sizeDialog, setSizeDialog] = useState<{
    id: string;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    function onClick() {
      setCtxMenu(null);
    }
    if (ctxMenu) {
      window.addEventListener("click", onClick, { once: true });
      return () => window.removeEventListener("click", onClick);
    }
  }, [ctxMenu]);

  if (collapsed) {
    return (
      <aside
        style={{
          width: 20,
          borderRight: "1px solid var(--stroke, #e5e7eb)",
          background: "var(--bg-elev, #fafafa)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: 6,
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => setCollapsed(false)}
          title="Expand slides"
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            border: "1px solid var(--stroke, #e5e7eb)",
            background: "var(--surface-solid, #fff)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 8,
            color: "var(--ink-muted, #6b7280)",
          }}
        >
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside
      style={{
        width: 150,
        borderRight: "1px solid var(--stroke, #e5e7eb)",
        background: "var(--bg-elev, #fafafa)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 4,
          padding: "7px 9px 6px",
          borderBottom: "1px solid var(--stroke, #e5e7eb)",
        }}
      >
        <button
          onClick={() => setCollapsed(true)}
          title="Collapse"
          style={{
            width: 17,
            height: 17,
            borderRadius: 3,
            border: "1px solid var(--stroke, #e5e7eb)",
            background: "var(--surface-solid, #fff)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "var(--ink-muted, #6b7280)",
            lineHeight: 1,
            transition: "all 0.15s ease",
          }}
        >
          ‹
        </button>
        <button
          onClick={addSlide}
          style={{
            width: 17,
            height: 17,
            borderRadius: 3,
            border: "1px solid var(--stroke, #d1d5db)",
            background: "var(--surface-solid, #fff)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "var(--ink-muted, #6b7280)",
            lineHeight: 1,
          }}
          title="Add slide"
        >
          +
        </button>
        {selectedSlideIds.size > 0 && (
          <button
            onClick={() => {
              selectedSlideIds.forEach((id) => deleteSlide(id));
              setSelectedSlideIds(new Set());
            }}
            style={{
              padding: "2px 6px",
              borderRadius: 3,
              border: "1px solid #fca5a5",
              background: "#fef2f2",
              color: "#dc2626",
              fontSize: 9,
              cursor: "pointer",
            }}
            title={`Delete ${selectedSlideIds.size} selected`}
          >
            Delete {selectedSlideIds.size}
          </button>
        )}
      </div>

      {/* Slide list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "6px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        {slides.map((sl, i) => (
          <SlideThumb
            key={sl.id}
            slide={sl}
            index={i}
            active={sl.id === currentSlideId}
            selected={selectedSlideIds.has(sl.id)}
            onSelect={(e) => {
              if (e.shiftKey) {
                setSelectedSlideIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(sl.id)) next.delete(sl.id);
                  else next.add(sl.id);
                  return next;
                });
              } else {
                setSelectedSlideIds(new Set());
                setCurrentSlide(sl.id);
              }
            }}
            onDelete={slides.length > 1 ? () => deleteSlide(sl.id) : undefined}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, slideId: sl.id, index: i });
            }}
            dragIndex={dragIndex}
            overIndex={overIndex}
            onDragStart={() => setDragIndex(i)}
            onDragOver={() => setOverIndex(i)}
            onDragEnd={() => {
              if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
                reorderSlides(dragIndex, overIndex > dragIndex ? overIndex + 1 : overIndex);
              }
              setDragIndex(null);
              setOverIndex(null);
            }}
          />
        ))}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: "fixed",
            top: ctxMenu.y,
            left: ctxMenu.x,
            zIndex: 50,
            background: "var(--surface-solid, #fff)",
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 8,
            boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
            padding: "4px 0",
            minWidth: 140,
            fontSize: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxItem
            label="New Slide"
            onClick={() => {
              addSlide();
              setCtxMenu(null);
            }}
          />
          <CtxItem
            label="Rename"
            onClick={() => {
              const sl = slides[ctxMenu.index];
              if (sl) {
                setRenamingId(sl.id);
                setRenameValue(sl.name.replace(/^Slide\s+/i, ""));
              }
              setCtxMenu(null);
            }}
          />
          <CtxItem
            label="Dimension"
            onClick={() => {
              const sl = slides[ctxMenu.index];
              if (sl) setSizeDialog({ id: sl.id, width: sl.width, height: sl.height });
              setCtxMenu(null);
            }}
          />
          <div style={{ height: 1, background: "var(--stroke, #e5e7eb)", margin: "3px 0" }} />
          <CtxItem
            label="Delete"
            danger
            disabled={slides.length <= 1}
            onClick={() => {
              if (slides.length > 1) deleteSlide(ctxMenu.slideId);
              setCtxMenu(null);
            }}
          />
        </div>
      )}

      {/* Inline rename */}
      {renamingId && (
        <RenameOverlay
          value={renameValue}
          onChange={setRenameValue}
          onConfirm={() => {
            if (renamingId && renameValue.trim()) renameSlide(renamingId, renameValue.trim());
            setRenamingId(null);
          }}
          onCancel={() => setRenamingId(null)}
        />
      )}

      {/* Slide size dialog */}
      {sizeDialog && (
        <SizeDialog
          width={sizeDialog.width}
          height={sizeDialog.height}
          onConfirm={(w, h) => {
            if (sizeDialog) setSlideDimensions(sizeDialog.id, w, h);
            setSizeDialog(null);
          }}
          onCancel={() => setSizeDialog(null)}
        />
      )}
    </aside>
  );
}

function SlideThumb({
  slide,
  index,
  active,
  selected,
  onSelect,
  onDelete,
  onContextMenu,
  dragIndex,
  overIndex,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  slide: EngineSlide;
  index: number;
  active: boolean;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  dragIndex: number | null;
  overIndex: number | null;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const isDragging = dragIndex === index;
  const showDropAfter = dragIndex !== null && overIndex === index && overIndex !== dragIndex;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const thumbH = Math.round((THUMB_W * slide.height) / slide.width);
    canvas.width = Math.round(THUMB_W * dpr);
    canvas.height = Math.round(thumbH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = THUMB_W / slide.width;
    ctx.fillStyle = slide.background || "#fff";
    ctx.fillRect(0, 0, THUMB_W, thumbH);
    ctx.save();
    ctx.scale(sx, sx);
    renderSlide(slide, { ctx, images: getImageCache() }, slide.width, slide.height);
    ctx.restore();
  }, [slide]);

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
      {/* Slide number */}
      <div
        style={{
          fontSize: 8,
          color: "var(--ink-muted, #9ca3af)",
          paddingTop: 3,
          minWidth: 10,
          textAlign: "right",
        }}
      >
        {index + 1}
      </div>

      {/* Thumbnail */}
      <div
        onClick={onSelect}
        onContextMenu={onContextMenu}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(index));
          onDragStart();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          onDragOver();
        }}
        onDragEnd={onDragEnd}
        onDrop={(e) => {
          e.preventDefault();
          onDragEnd();
        }}
        style={{
          position: "relative",
          flex: 1,
          border: active
            ? "2px solid var(--accent, #6366f1)"
            : selected
              ? "2px solid #f59e0b"
              : "1px solid var(--stroke, #e5e7eb)",
          borderRadius: 4,
          overflow: "hidden",
          cursor: "pointer",
          background: "var(--surface-solid, #fff)",
          opacity: isDragging ? 0.4 : 1,
          outline: showDropAfter ? "2px solid #f59e0b" : undefined,
          transition: "border-color 0.1s ease",
        }}
      >
        <canvas
          ref={ref}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            aspectRatio: `${slide.width} / ${slide.height}`,
          }}
        />
        {/* Dimension label — top-right corner */}
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            padding: "1px 3px",
            fontSize: 8,
            color: "#9ca3af",
            background: "rgba(255,255,255,0.7)",
            borderRadius: 2,
            pointerEvents: "none",
            lineHeight: 1,
          }}
        >
          {slide.width}×{slide.height}
        </div>
        {/* Delete button overlay */}
        {onDelete && (
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
              borderRadius: 3,
              border: "none",
              background: "rgba(0,0,0,0.3)",
              color: "#fff",
              cursor: "pointer",
              fontSize: 10,
              lineHeight: 1,
              display: "none",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            className="slide-delete-btn"
            aria-label="Delete slide"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function CtxItem({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "6px 12px",
        border: "none",
        background: "transparent",
        color: danger ? "#dc2626" : disabled ? "#9ca3af" : "var(--ink, #111)",
        fontSize: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function RenameOverlay({
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.25)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface-solid, #fff)",
          borderRadius: 10,
          padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          minWidth: 260,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Rename Slide</div>
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onConfirm();
            if (e.key === "Escape") onCancel();
          }}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--stroke, #e5e7eb)",
            fontSize: 13,
            marginBottom: 10,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--stroke, #e5e7eb)",
              background: "var(--surface-solid, #fff)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}

function SizeDialog({
  width,
  height,
  onConfirm,
  onCancel,
}: {
  width: number;
  height: number;
  onConfirm: (w: number, h: number) => void;
  onCancel: () => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,0.25)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface-solid, #fff)",
          borderRadius: 10,
          padding: 16,
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
          minWidth: 260,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Dimension</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Width</div>
            <input
              type="number"
              value={w}
              onChange={(e) => setW(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--stroke, #e5e7eb)",
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 4 }}>Height</div>
            <input
              type="number"
              value={h}
              onChange={(e) => setH(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--stroke, #e5e7eb)",
                fontSize: 13,
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[
            { label: "1920×1080", w: 1920, h: 1080 },
            { label: "1280×720", w: 1280, h: 720 },
            { label: "1080×1080", w: 1080, h: 1080 },
            { label: "1080×1920", w: 1080, h: 1920 },
            { label: "A4 (595×842)", w: 595, h: 842 },
          ].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setW(String(p.w));
                setH(String(p.h));
              }}
              style={{
                fontSize: 10,
                padding: "3px 8px",
                borderRadius: 4,
                border: "1px solid var(--stroke, #e5e7eb)",
                background: "var(--surface-solid, #fff)",
                cursor: "pointer",
                color: "#6b7280",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--stroke, #e5e7eb)",
              background: "var(--surface-solid, #fff)",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const nw = Number(w);
              const nh = Number(h);
              if (nw > 0 && nh > 0) onConfirm(nw, nh);
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--accent, #6366f1)",
              color: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
