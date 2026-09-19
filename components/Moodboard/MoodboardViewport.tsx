"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ViewTransform } from "@/components/Canvas/CanvasRoot";
import { BUILDER_BLOCK_MIME } from "@/lib/builder/blocks";
import { fileToDataURL, isSupportedImageFile, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { MoodboardItem } from "@/lib/engine/types";
import { createMoodboardItem, createMoodboardNote } from "@/lib/moodboard/factory";
import { classifyReferenceUrl, saveMoodboardReference } from "@/lib/moodboard/referenceStore";
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
  addNoteAtCenter: () => void;
  addImageFileAtCenter: (file: File) => Promise<void>;
};

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const MIN_SIZE = 48;

function looksLikeImageUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return false;
    return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url.pathname) || url.hostname.includes("pinimg.");
  } catch {
    return false;
  }
}

const MoodboardViewport = forwardRef<
  MoodboardViewportHandle,
  {
    onViewChange?: (view: ViewTransform) => void;
  }
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
    originW: number;
    originH: number;
    mode: "move" | "se";
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
    onViewChange?.(viewRef.current);
  }, [onViewChange]);

  const resetView = useCallback(() => {
    const next = { scale: 0.72, tx: 80, ty: 64 };
    publishView(next, true);
  }, [publishView]);

  const centerWorld = useCallback(() => {
    const current = viewRef.current;
    return {
      x: (size.w / 2 - current.tx) / current.scale,
      y: (size.h / 2 - current.ty) / current.scale,
    };
  }, [size.h, size.w]);

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
          credit: { photographer: file.name, provider: "user" },
        }),
        "drop moodboard image",
      );
    },
    [addMoodboardItem],
  );

  const placeImageUrl = useCallback(
    (raw: string, world: { x: number; y: number }) => {
      const src = raw.trim();
      if (!looksLikeImageUrl(src) && !src.startsWith("https://")) return false;
      const origin = classifyReferenceUrl(src);
      saveMoodboardReference({
        src,
        title: src.split("/").filter(Boolean).at(-1) || "Reference",
        sourceUrl: src,
        origin,
      });
      addMoodboardItem(
        createMoodboardItem({
          kind: "image",
          src,
          text: src.split("/").filter(Boolean).at(-1) || "Reference",
          x: world.x - 140,
          y: world.y - 105,
          credit: {
            photographer: origin === "pinterest" ? "Pinterest" : "URL",
            provider: origin === "pinterest" ? "pinterest" : "user",
            sourceUrl: src,
          },
        }),
        "paste moodboard url",
      );
      return true;
    },
    [addMoodboardItem],
  );

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
      addNoteAtCenter: () => {
        const world = centerWorld();
        addMoodboardItem(createMoodboardNote("Note", world.x, world.y), "add sticky note");
      },
      addImageFileAtCenter: async (file: File) => {
        await placeImageFile(file, centerWorld());
      },
    }),
    [addMoodboardItem, centerWorld, placeImageFile, publishView, resetView, size.h, size.w],
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

  useEffect(() => {
    async function onPaste(event: ClipboardEvent) {
      const files = event.clipboardData?.files;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      const world = centerWorld();
      if (files?.length) {
        for (const file of Array.from(files)) {
          if (isSupportedImageFile(file)) {
            event.preventDefault();
            await placeImageFile(file, world);
          }
        }
        return;
      }
      if (
        text &&
        (looksLikeImageUrl(text) || text.includes("pinterest.") || text.includes("pinimg."))
      ) {
        event.preventDefault();
        placeImageUrl(text, world);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [centerWorld, placeImageFile, placeImageUrl]);

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
          if (dragRef.current.mode === "se") {
            previewMoodboardItems([
              {
                id: dragRef.current.id,
                patch: {
                  width: Math.max(
                    MIN_SIZE,
                    dragRef.current.originW + world.x - dragRef.current.startX,
                  ),
                  height: Math.max(
                    MIN_SIZE,
                    dragRef.current.originH + world.y - dragRef.current.startY,
                  ),
                },
              },
            ]);
            return;
          }
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
          if (item) {
            updateMoodboardItems(
              [
                {
                  id: item.id,
                  patch: { x: item.x, y: item.y, width: item.width, height: item.height },
                },
              ],
              dragRef.current.mode === "se" ? "resize moodboard item" : "move moodboard item",
            );
          }
          dragRef.current = null;
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={async (event) => {
        event.preventDefault();
        const world = clientToWorld(event.clientX, event.clientY);
        const blockKind = event.dataTransfer.getData(BUILDER_BLOCK_MIME);
        if (blockKind === "note") {
          addMoodboardItem(createMoodboardNote("Note", world.x, world.y), "add note");
          return;
        }
        const uri =
          event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        if (uri.startsWith("https://")) {
          placeImageUrl(uri, world);
        }
        for (const file of Array.from(event.dataTransfer.files)) {
          await placeImageFile(file, world);
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#f4f4f5",
        cursor: spaceDown || panRef.current ? "grab" : "default",
        touchAction: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
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
              fontSize: 12,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "#94a3b8",
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
                originW: item.width,
                originH: item.height,
                mode: "move",
              };
            }}
            onResizePointerDown={(event) => {
              event.stopPropagation();
              selectOnly([item.id]);
              const world = clientToWorld(event.clientX, event.clientY);
              dragRef.current = {
                id: item.id,
                startX: world.x,
                startY: world.y,
                originX: item.x,
                originY: item.y,
                originW: item.width,
                originH: item.height,
                mode: "se",
              };
            }}
            onDoubleClick={() => {
              if (item.kind === "note") setEditingNoteId(item.id);
            }}
          />
        ))}
      </div>

      {!items.length ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "46%",
            transform: "translate(-50%, -50%)",
            color: "#64748b",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Infinite artboard</div>
          <div style={{ fontSize: 13, maxWidth: 400, lineHeight: 1.5 }}>
            Drop or paste photos, add a Note from Block, or open Pinterest to place Pins you already
            saved. Copy to a normal artwork slide from the menu when you are ready.
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
  onResizePointerDown,
  onDoubleClick,
  onEditDone,
}: {
  item: MoodboardItem;
  selected: boolean;
  editing: boolean;
  onPointerDown: (event: React.PointerEvent) => void;
  onResizePointerDown: (event: React.PointerEvent) => void;
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
      data-rotation="0"
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      style={{
        position: "absolute",
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        transform: "none",
        boxShadow: selected ? "0 0 0 2px #4f46e5" : "0 1px 3px rgba(15,23,42,0.08)",
        background:
          item.kind === "note"
            ? item.color || "#f8fafc"
            : item.kind === "chip"
              ? item.color || "#e5e7eb"
              : "#fff",
        borderRadius: item.kind === "chip" ? 999 : 4,
        overflow: "visible",
        cursor: "move",
        userSelect: "none",
        border: "1px solid rgba(15,23,42,0.08)",
      }}
    >
      <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: "inherit" }}>
        {item.kind === "image" && item.src ? (
          // User / reference URLs are arbitrary origins; next/image is not a fit here.
          // biome-ignore lint/performance/noImgElement: remote and pasted data URLs
          <img
            src={item.src}
            alt={item.text || item.query || "Reference"}
            style={{
              width: "100%",
              height: item.credit ? "calc(100% - 22px)" : "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : null}
        {item.kind === "placeholder" ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              background: "#f1f5f9",
              color: "#64748b",
              fontSize: 12,
              padding: 12,
              textAlign: "center",
            }}
          >
            {item.text || item.query || "Label"}
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
            <div style={{ padding: 12, fontSize: 14, color: "#0f172a", whiteSpace: "pre-wrap" }}>
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
        {item.kind === "image" && item.credit ? (
          <div
            style={{
              height: 22,
              fontSize: 10,
              color: "#64748b",
              padding: "0 8px",
              display: "flex",
              alignItems: "center",
              background: "#fff",
            }}
          >
            {item.credit.photographer
              ? `${item.credit.photographer}${item.credit.provider ? ` · ${item.credit.provider}` : ""}`
              : item.query || "Photo"}
          </div>
        ) : null}
      </div>
      {selected ? (
        <button
          type="button"
          aria-label="Resize"
          onPointerDown={onResizePointerDown}
          style={{
            position: "absolute",
            right: -5,
            bottom: -5,
            width: 10,
            height: 10,
            padding: 0,
            border: "2px solid #4f46e5",
            background: "#fff",
            cursor: "nwse-resize",
          }}
        />
      ) : null}
    </div>
  );
}

export default MoodboardViewport;
