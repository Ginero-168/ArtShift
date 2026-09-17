"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { pointerPressure } from "@/lib/engine/toolBehavior";
import { createRasterStroke } from "@/lib/raster/mask";
import {
  createMagicWandSelectionShape,
  createMagicWandSelectionShapeAsync,
  createRasterSelectionSample,
  selectionShapeFromPoints,
} from "@/lib/raster/selectionInteraction";
import { createRasterRetouchEdit } from "@/lib/raster/retouch";
import {
  createRasterSelectionOperation,
  selectionModeFromModifiers,
  type RasterSelectionShape,
} from "@/lib/raster/selection";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { renderElement, type RenderCtx } from "@/lib/renderer/canvas";

type LocalPoint = [number, number];

type PaintDrag = {
  kind: "paint";
  localPoints: LocalPoint[];
  pressures: number[];
  mode: "paint" | "erase";
  size: number;
  opacity: number;
  hardness: number;
  color: string;
};

type SelectionDrag = {
  kind: "selection";
  shape: "rect" | "ellipse" | "lasso";
  localPoints: LocalPoint[];
  mode: ReturnType<typeof selectionModeFromModifiers>;
};

type RetouchDrag = {
  kind: "retouch";
  mode: "heal" | "clone";
  localPoints: LocalPoint[];
  sourcePoint?: LocalPoint;
  size: number;
  opacity: number;
};

type DragState = PaintDrag | SelectionDrag | RetouchDrag | { kind: "pan"; lastX: number; lastY: number };

/**
 * Image-space Raster Studio viewport: pan/zoom + paint/selection/retouch/wand.
 * Commits go through editorController onto the live ImageElement; Save still bakes.
 */
export default function RasterStudioViewport({ elementId }: { elementId: string }) {
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const setDirty = useRasterStudioSession((s) => s.setDirty);

  const updateElements = useEngine((s) => s.updateElements);
  const applyRasterSelection = useEngine((s) => s.applyRasterSelection);
  const currentSlide = useEngine((s) => s.currentSlide);
  const selectOnly = useEngine((s) => s.selectOnly);
  const activeRasterSelection = useEngine((s) => s.activeRasterSelection);
  const brushSize = useEngine((s) => s.rasterBrushSize);
  const brushOpacity = useEngine((s) => s.rasterBrushOpacity);
  const brushHardness = useEngine((s) => s.rasterBrushHardness);
  const brushColor = useEngine((s) => s.rasterBrushColor);
  const wandTolerance = useEngine((s) => s.rasterMagicWandTolerance);

  const image = useEngine((s) => {
    const slide = s.currentSlide();
    return slide?.elements.find(
      (el): el is ImageElement => el.id === elementId && el.type === "image" && !el.isDeleted,
    );
  });

  const revisionKey = useEngine((s) => {
    const slide = s.currentSlide();
    const el = slide?.elements.find((candidate) => candidate.id === elementId);
    if (!el || el.type !== "image") return "missing";
    return [
      el.fileId,
      el.rasterMask?.length ?? 0,
      el.rasterEdits?.length ?? 0,
      el.filterBlur ?? 0,
      el.crop ? `${el.crop.x},${el.crop.y},${el.crop.width},${el.crop.height}` : "full",
      JSON.stringify(el.adjustments ?? null),
      s.doc.updatedAt,
    ].join("|");
  });

  const controller = useMemo(
    () =>
      createEditorController({
        currentSlide,
        updateElements,
        applyRasterSelection,
        currentSelection: () => useEngine.getState().selectedIds,
        selectOnly,
        currentTool: () => {
          const tool = useRasterStudioSession.getState().studioTool;
          return tool === "hand" ? "rasterMove" : tool;
        },
      }),
    [applyRasterSelection, currentSlide, selectOnly, updateElements],
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const cloneSourceRef = useRef<LocalPoint | null>(null);
  const wandRequestRef = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draftPoints, setDraftPoints] = useState<LocalPoint[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const width = Math.max(1, Math.round(image.width));
    const height = Math.max(1, Math.round(image.height));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const bakeTarget: ImageElement = {
      ...image,
      x: 0,
      y: 0,
      angle: 0,
      opacity: 1,
    };
    renderElement(bakeTarget, { ctx, images: getImageCache() } as RenderCtx);
  }, [image]);

  useEffect(() => {
    redraw();
  }, [redraw, revisionKey]);

  useEffect(() => {
    selectOnly([elementId]);
  }, [elementId, selectOnly]);

  const clientToLocal = useCallback(
    (clientX: number, clientY: number): LocalPoint | null => {
      const canvas = canvasRef.current;
      if (!canvas || !image) return null;
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * image.width;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * image.height;
      return [x, y];
    },
    [image],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (studioTool === "hand" || event.button === 1) {
      dragRef.current = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
      return;
    }

    const local = clientToLocal(event.clientX, event.clientY);
    if (!local) return;

    if (studioTool === "rasterBrush" || studioTool === "rasterPencil" || studioTool === "rasterEraser") {
      const isPencil = studioTool === "rasterPencil";
      const isEraser = studioTool === "rasterEraser";
      const pressure = pointerPressure(event);
      dragRef.current = {
        kind: "paint",
        localPoints: [local],
        pressures: [pressure],
        mode: isEraser ? "erase" : "paint",
        size: brushSize,
        opacity: brushOpacity,
        hardness: isPencil ? 1 : brushHardness,
        color: brushColor,
      };
      setDraftPoints([local]);
      return;
    }

    if (studioTool === "rasterMarquee" || studioTool === "rasterEllipse" || studioTool === "rasterLasso") {
      dragRef.current = {
        kind: "selection",
        shape: studioTool === "rasterMarquee" ? "rect" : studioTool === "rasterEllipse" ? "ellipse" : "lasso",
        localPoints: [local],
        mode: selectionModeFromModifiers(event),
      };
      setDraftPoints([local]);
      return;
    }

    if (studioTool === "rasterHealing" || studioTool === "rasterClone") {
      if (studioTool === "rasterClone" && event.altKey) {
        cloneSourceRef.current = local;
        setStatus("Clone source set");
        return;
      }
      dragRef.current = {
        kind: "retouch",
        mode: studioTool === "rasterHealing" ? "heal" : "clone",
        localPoints: [local],
        sourcePoint: cloneSourceRef.current ?? undefined,
        size: brushSize,
        opacity: brushOpacity,
      };
      setDraftPoints([local]);
      return;
    }

    if (studioTool === "rasterMagicWand") {
      const mode = selectionModeFromModifiers(event);
      const requestId = ++wandRequestRef.current;
      const applyShape = (shape: RasterSelectionShape | null) => {
        if (!shape || requestId !== wandRequestRef.current) return;
        controller.commitRasterSelection(image.id, createRasterSelectionOperation(mode, shape));
        setDirty(true);
        setStatus("Selection updated");
      };
      const sample = createRasterSelectionSample(image, getImageCache());
      if (sample && sample.width * sample.height >= 250_000) {
        void createMagicWandSelectionShapeAsync(
          image,
          local,
          wandTolerance,
          getImageCache(),
        ).then(applyShape);
        return;
      }
      applyShape(createMagicWandSelectionShape(image, local, wandTolerance, getImageCache()));
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !image) return;

    if (drag.kind === "pan") {
      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    const local = clientToLocal(event.clientX, event.clientY);
    if (!local) return;
    const last = drag.localPoints.at(-1);
    const minDist = drag.kind === "selection" && drag.shape !== "lasso" ? 0 : 1.5 / zoom;
    if (last && Math.hypot(local[0] - last[0], local[1] - last[1]) < minDist) return;

    if (drag.kind === "paint") {
      drag.localPoints.push(local);
      drag.pressures.push(pointerPressure(event));
      setDraftPoints([...drag.localPoints]);
      return;
    }
    if (drag.kind === "selection") {
      if (drag.shape === "lasso") drag.localPoints.push(local);
      else drag.localPoints = [drag.localPoints[0], local];
      setDraftPoints([...drag.localPoints]);
      return;
    }
    if (drag.kind === "retouch") {
      drag.localPoints.push(local);
      setDraftPoints([...drag.localPoints]);
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDraftPoints(null);
    if (!drag || !image) return;

    if (drag.kind === "paint" && drag.localPoints.length > 0) {
      const stroke = createRasterStroke(drag.localPoints, drag.size, drag.opacity, {
        mode: drag.mode,
        pressures: drag.pressures,
        color: drag.color,
        hardness: drag.hardness,
        selection: controller.selectionForImage(activeRasterSelection, image.id),
      });
      controller.commitRasterStroke(
        image.id,
        stroke,
        drag.mode === "erase" ? "erase image pixels" : "paint image pixels",
      );
      setDirty(true);
      return;
    }

    if (drag.kind === "selection") {
      const minPoints = drag.shape === "rect" || drag.shape === "ellipse" ? 2 : 3;
      if (drag.localPoints.length >= minPoints) {
        const shape = selectionShapeFromPoints(
          drag.shape,
          drag.localPoints,
          image.width,
          image.height,
        );
        controller.commitRasterSelection(
          image.id,
          createRasterSelectionOperation(drag.mode, shape),
        );
        setDirty(true);
      }
      return;
    }

    if (drag.kind === "retouch" && drag.localPoints.length > 0) {
      const pixels = createRasterSelectionSample(image, getImageCache());
      if (!pixels) {
        setStatus("Image pixels are not readable");
        return;
      }
      void createRasterRetouchEdit(image, pixels, {
        mode: drag.mode,
        points: drag.localPoints,
        sourcePoint: drag.sourcePoint,
        size: drag.size,
        opacity: drag.opacity,
        selection: controller.selectionForImage(activeRasterSelection, image.id),
      }).then((edit) => {
        if (!edit) {
          setStatus(drag.mode === "clone" ? "Alt-click to set clone source first" : "Heal failed");
          return;
        }
        controller.commitRasterRetouch(
          image.id,
          edit,
          drag.mode === "heal" ? "heal image pixels" : "clone image pixels",
        );
        setDirty(true);
        setStatus(null);
      });
    }
  };

  if (!image) {
    return <p style={{ opacity: 0.7 }}>Image is no longer on the canvas.</p>;
  }

  const draftPath =
    draftPoints && draftPoints.length > 1
      ? draftPoints.map(([x, y]) => `${x},${y}`).join(" ")
      : null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: studioTool === "hand" ? "grab" : "crosshair",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(event) => {
        event.preventDefault();
        const next = Math.min(8, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.08 : 0.92)));
        setZoom(next);
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <div style={{ position: "relative", lineHeight: 0 }}>
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              maxWidth: "min(92vw, 1200px)",
              maxHeight: "calc(100vh - 160px)",
              width: "auto",
              height: "auto",
              background: "#020617",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.08)",
            }}
          />
          {draftPath ? (
            <svg
              aria-hidden
              viewBox={`0 0 ${image.width} ${image.height}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            >
              <polyline
                points={draftPath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={Math.max(1, brushSize * 0.15)}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
              />
            </svg>
          ) : null}
        </div>
      </div>
      {status ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            padding: "4px 8px",
            borderRadius: 6,
            background: "rgba(15,23,42,0.85)",
            fontSize: 12,
          }}
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
