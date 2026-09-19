"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ViewTransform } from "@/components/Canvas/CanvasRoot";
import { fileToDataURL, isSupportedImageFile, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { MoodboardItem } from "@/lib/engine/types";
import { expandActiveMoodboard, retryMoodboardPlaceholder } from "@/lib/moodboard/expandClient";
import { createMoodboardItem, createMoodboardNote } from "@/lib/moodboard/factory";
import { isMoodboardSlide } from "@/lib/moodboard/types";

export type MoodboardViewportHandle = {
  resetView: () => void;
  getView: () => ViewTransform;
  setView: (v: ViewTransform) => void;
  setZoom: (scale: number) => void;
  fitWorldRect: (
    rect: { x: number; y: number; width: number; height: number },
    padding?: number,
  ) => void;
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;

const MoodboardViewport = forwardRef<
  MoodboardViewportHandle,
  { onViewChange?: (view: ViewTransform) => void }
>(function MoodboardViewport({ onViewChange }, ref) {
  const slide = useEngine((s) =>
    s.doc.slides.find((candidate) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s) => s.selectedIds);
  const selectOnly = useEngine((s) => s.selectOnly);
  const addMoodboardItem = useEngine((s) => s.addMoodboardItem);
  const previewMoodboardItems = useEngine((s) => s.previewMoodboardItems);
  const updateMoodboardItems = useEngine((s) => s.updateMoodboardItems);
  const setMoodboardViewport = useEngine((s) => s.setMoodboardViewport);

  const board = isMoodboardSlide(slide) ? slide?.moodboard : undefined;
  const items = board?.items ?? [];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [keyword, setKeyword] = useState(board?.keyword ?? "");
  const [expanding, setExpanding] = useState(false);
  const [expandError, setExpandError] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const viewRef = useRef({
    scale: board?.viewport.zoom ?? 0.72,
    tx: board?.viewport.x ?? 80,
    ty: board?.viewport.y ?? 64,
  });
  const [view, setViewState] = useState(viewRef.current);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const publishView = useCallback(
    (next: ViewTransform, persist = false) => {
      viewRef.current = next;
      setViewState(next);
      setMoodboardViewport({ x: next.tx, y: next.ty, zoom: next.scale }, persist);
      onViewChange?.(next);
    },
    [onViewChange, setMoodboardViewport],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setKeyword(board?.keyword ?? "");
  }, [board?.keyword]);

  useEffect(() => {
    onViewChange?.(viewRef.current);
  }, [onViewChange]);

  const resetView = useCallback(() => {
    const next = { scale: 0.72, tx: 80, ty: 64 };
    publishView(next, true);
  }, [publishView]);

  useImperativeHandle(
    ref,
    () => ({
      resetView,
      getView: () => viewRef.current,
      setView: (next) => publishView(next, true),
      setZoom: (scale) => {
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale));
        const current = viewRef.current;
        const cx = size.w / 2;
        const cy = size.h / 2;
        const worldX = (cx - current.tx) / current.scale;
        const worldY = (cy - current.ty) / current.scale;
        publishView(
          {
            scale: clamped,
            tx: cx - worldX * clamped,
            ty: cy - worldY * clamped,
          },
          true,
        );
      },
      fitWorldRect: (rect, padding = 56) => {
        if (!size.w || !size.h || !(rect.width > 0) || !(rect.height > 0)) return;
        const scale = Math.min(
          MAX_ZOOM,
          Math.max(
            MIN_ZOOM,
            Math.min((size.w - padding * 2) / rect.width, (size.h - padding * 2) / rect.height),
          ),
        );
        publishView(
          {
            scale,
            tx: size.w / 2 - (rect.x + rect.width / 2) * scale,
            ty: size.h / 2 - (rect.y + rect.height / 2) * scale,
          },
          true,
        );
      },
    }),
    [publishView, resetView, size.h, size.w],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(true);
    }
    function onUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const current = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - current.tx) / current.scale,
      y: (clientY - (rect?.top ?? 0) - current.ty) / current.scale,
    };
  }, []);

  const placeImageFile = useCallback(
    async (file: File, world: { x: number; y: number }) => {
      if (!isSupportedImageFile(file)) return;
      const dataURL = await fileToDataURL(file);
      const entry = await loadDataURL(dataURL);
      const maxW = 320;
      const ratio = Math.min(1, maxW / entry.width);
      addMoodboardItem(
        createMoodboardItem({
          kind: "image",
          fileId: entry.fileId,
          src: dataURL,
          text: file.name,
          x: world.x - (entry.width * ratio) / 2,
          y: world.y - (entry.height * ratio) / 2,
          width: entry.width * ratio,
          height: entry.height * ratio,
          tilt: true,
        }),
        "drop moodboard image",
      );
    },
    [addMoodboardItem],
  );

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      const files = event.clipboardData?.files;
      if (!files?.length) return;
      const world = clientToWorld(
        size.w / 2 + (containerRef.current?.getBoundingClientRect().left ?? 0),
        size.h / 2 + (containerRef.current?.getBoundingClientRect().top ?? 0),
      );
      for (const file of Array.from(files)) {
        if (isSupportedImageFile(file)) {
          event.preventDefault();
          await placeImageFile(file, world);
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [clientToWorld, placeImageFile, size.h, size.w]);

  async function handleExpand() {
    if (expanding) return;
    setExpanding(true);
    setExpandError("");
    const result = await expandActiveMoodboard(keyword);
    if (!result.ok) setExpandError(result.message);
    setExpanding(false);
  }

  if (!isMoodboardSlide(slide)) return null;

  return (
    <div
      ref={containerRef}
      data-moodboard-viewport="true"
      onWheel={(event) => {
        event.preventDefault();
        const current = viewRef.current;
        const factor = event.deltaY < 0 ? 1.08 : 0.92;
        const nextScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.scale * factor));
        const rect = containerRef.current?.getBoundingClientRect();
        const cx = event.clientX - (rect?.left ?? 0);
        const cy = event.clientY - (rect?.top ?? 0);
        const worldX = (cx - current.tx) / current.scale;
        const worldY = (cy - current.ty) / current.scale;
        publishView({
          scale: nextScale,
          tx: cx - worldX * nextScale,
          ty: cy - worldY * nextScale,
        });
      }}
      onPointerDown={(event) => {
        if (
          event.button === 1 ||
          spaceDown ||
          (event.button === 0 && event.target === event.currentTarget)
        ) {
          panRef.current = {
            x: event.clientX,
            y: event.clientY,
            tx: viewRef.current.tx,
            ty: viewRef.current.ty,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          if (event.target === event.currentTarget) selectOnly([]);
        }
      }}
      onPointerMove={(event) => {
        if (panRef.current) {
          publishView({
            ...viewRef.current,
            tx: panRef.current.tx + event.clientX - panRef.current.x,
            ty: panRef.current.ty + event.clientY - panRef.current.y,
          });
          return;
        }
        if (dragRef.current) {
          const world = clientToWorld(event.clientX, event.clientY);
          previewMoodboardItems([
            {
              id: dragRef.current.id,
              patch: {
                x: dragRef.current.originX + world.x - dragRef.current.startX,
                y: dragRef.current.originY + world.y - dragRef.current.startY,
              },
            },
          ]);
        }
      }}
      onPointerUp={() => {
        if (panRef.current) {
          panRef.current = null;
          publishView(viewRef.current, true);
        }
        if (dragRef.current) {
          const item = items.find((candidate) => candidate.id === dragRef.current?.id);
          if (item)
            updateMoodboardItems(
              [{ id: item.id, patch: { x: item.x, y: item.y } }],
              "move moodboard item",
            );
          dragRef.current = null;
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={async (event) => {
        event.preventDefault();
        const world = clientToWorld(event.clientX, event.clientY);
        for (const file of Array.from(event.dataTransfer.files)) {
          await placeImageFile(file, world);
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#ebe4d6",
        cursor: spaceDown || panRef.current ? "grab" : "default",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.35), transparent 28%), repeating-linear-gradient(0deg, rgba(80,60,30,0.03) 0 2px, transparent 2px 18px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: view.tx,
          top: view.ty,
          transform: `scale(${view.scale})`,
          transformOrigin: "0 0",
        }}
      >
        {ROLE_LABELS.map((label) => (
          <div
            key={label.role}
            style={{
              position: "absolute",
              left: label.x,
              top: label.y,
              fontSize: 13,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: "#8b8172",
              fontWeight: 700,
              pointerEvents: "none",
            }}
          >
            {label.role}
          </div>
        ))}
        {items.map((item) => (
          <MoodboardCard
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            editing={editingNoteId === item.id}
            onEditDone={(text) => {
              updateMoodboardItems([{ id: item.id, patch: { text } }], "edit note");
              setEditingNoteId(null);
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              selectOnly([item.id]);
              const world = clientToWorld(event.clientX, event.clientY);
              dragRef.current = {
                id: item.id,
                startX: world.x,
                startY: world.y,
                originX: item.x,
                originY: item.y,
              };
            }}
            onDoubleClick={() => {
              if (item.kind === "note") setEditingNoteId(item.id);
              if (item.kind === "placeholder") void retryMoodboardPlaceholder(item.id);
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          top: 10,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.94)",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          boxShadow: "0 8px 24px rgba(28, 25, 23, 0.08)",
        }}
      >
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void handleExpand();
          }}
          placeholder="Keyword → vibe expand (Bangkok, ice, summer market…)"
          aria-label="Moodboard keyword"
          style={{
            width: 340,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 13,
            outline: "none",
          }}
        />
        <button
          type="button"
          onClick={() => void handleExpand()}
          disabled={expanding}
          style={{
            border: "none",
            background: "#111827",
            color: "#fff",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: expanding ? "wait" : "pointer",
          }}
        >
          {expanding ? "Expanding…" : "Expand"}
        </button>
        <button
          type="button"
          onClick={() => {
            const world = clientToWorld(
              (containerRef.current?.getBoundingClientRect().left ?? 0) + size.w / 2,
              (containerRef.current?.getBoundingClientRect().top ?? 0) + size.h / 2,
            );
            addMoodboardItem(createMoodboardNote("Note", world.x, world.y), "add sticky note");
          }}
          style={{
            border: "1px solid #e5e7eb",
            background: "#fde68a",
            borderRadius: 8,
            padding: "7px 10px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Note
        </button>
      </div>

      {expandError ? (
        <div
          style={{
            position: "absolute",
            top: 58,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 12,
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
          }}
        >
          {expandError}
        </div>
      ) : null}

      {!items.length ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "46%",
            transform: "translate(-50%, -50%)",
            color: "#7c7266",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Frameless Moodboard</div>
          <div style={{ fontSize: 13, maxWidth: 360, lineHeight: 1.5 }}>
            Drop or paste real photos, add sticky notes, or expand a keyword into Subject / Setting
            / Prop / Mood / Color stock references.
          </div>
        </div>
      ) : null}
    </div>
  );
});

const ROLE_LABELS = [
  { role: "Subject", x: 80, y: 44 },
  { role: "Setting", x: 980, y: 44 },
  { role: "Prop", x: 80, y: 684 },
  { role: "Mood / Color", x: 980, y: 684 },
];

function MoodboardCard({
  item,
  selected,
  editing,
  onPointerDown,
  onDoubleClick,
  onEditDone,
}: {
  item: MoodboardItem;
  selected: boolean;
  editing: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onDoubleClick: () => void;
  onEditDone: (text: string) => void;
}) {
  const [note, setNote] = useState(item.text ?? "");
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => setNote(item.text ?? ""), [item.text]);
  useEffect(() => {
    if (editing) noteRef.current?.focus();
  }, [editing]);

  return (
    <div
      data-moodboard-item={item.id}
      data-role={item.role}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: "absolute",
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: `rotate(${((item.rotation || 0) * 180) / Math.PI}deg)`,
        boxShadow: selected
          ? "0 0 0 2px #111827, 0 10px 22px rgba(0,0,0,0.16)"
          : "0 8px 18px rgba(28, 25, 23, 0.12)",
        background:
          item.kind === "note"
            ? item.color || "#fde68a"
            : item.kind === "chip"
              ? item.color || "#e5e7eb"
              : "#fff",
        borderRadius: item.kind === "chip" ? 999 : 2,
        overflow: "hidden",
        cursor: "grab",
        userSelect: "none",
      }}
    >
      {item.kind === "image" && item.src ? (
        // Stock / data URLs are arbitrary origins; next/image is not a fit here.
        // biome-ignore lint/performance/noImgElement: remote stock and pasted data URLs
        <img
          src={item.src}
          alt={item.text || item.query || "Stock photo"}
          style={{
            width: "100%",
            height: "calc(100% - 22px)",
            objectFit: "cover",
            display: "block",
          }}
        />
      ) : null}
      {item.kind === "placeholder" ? (
        <div
          style={{
            height: "calc(100% - 22px)",
            display: "grid",
            placeItems: "center",
            background: "#efe6d8",
            color: "#7c7266",
            fontSize: 12,
            padding: 12,
            textAlign: "center",
          }}
        >
          {item.text || item.query || "Missing stock"}
          <div style={{ fontSize: 10, marginTop: 6 }}>Double-click to retry</div>
        </div>
      ) : null}
      {item.kind === "note" ? (
        editing ? (
          <textarea
            ref={noteRef}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => onEditDone(note)}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              background: "transparent",
              resize: "none",
              padding: 12,
              fontSize: 14,
              fontFamily: "inherit",
            }}
          />
        ) : (
          <div style={{ padding: 12, fontSize: 14, color: "#78350f", whiteSpace: "pre-wrap" }}>
            {item.text || "Note"}
          </div>
        )
      ) : null}
      {item.kind === "chip" ? (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            color: "#111827",
            padding: "0 10px",
          }}
        >
          {item.text}
        </div>
      ) : null}
      {(item.kind === "image" || item.kind === "placeholder") && (
        <div
          style={{
            height: 22,
            fontSize: 10,
            color: "#6b7280",
            padding: "0 8px",
            display: "flex",
            alignItems: "center",
            background: "#fff",
          }}
        >
          {item.credit?.photographer
            ? `${item.credit.photographer}${item.credit.provider ? ` · ${item.credit.provider}` : ""}`
            : item.query || "Photo"}
        </div>
      )}
    </div>
  );
}

export default MoodboardViewport;
