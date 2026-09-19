"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import RasterSelectionOverlay from "@/components/Canvas/RasterSelectionOverlay";
import { createEditorController } from "@/lib/engine/editorController";
import { getImageCache } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { pointerPressure } from "@/lib/engine/toolBehavior";
import type { ImageElement } from "@/lib/engine/types";
import { magicWandMaskToDataUrl, type RasterPixelData } from "@/lib/raster/magicWand";
import { createRasterStroke } from "@/lib/raster/mask";
import { createRasterRetouchEdit } from "@/lib/raster/retouch";
import {
  appendRasterPolygonPoint,
  canCommitRasterPolygon,
  createRasterSelectionOperation,
  type RasterSelectionMode,
  type RasterSelectionShape,
  selectionModeFromModifiers,
} from "@/lib/raster/selection";
import {
  createMagicWandSelectionShape,
  createMagicWandSelectionShapeAsync,
  createRasterSelectionSample,
  quickSelectionMaskForPointAsync,
  selectionShapeFromPoints,
} from "@/lib/raster/selectionInteraction";
import { blitOffscreenPreview, createBakeSurface } from "@/lib/raster/studio/encodeRevision";
import { clampStudioZoom, useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { type RenderCtx, renderElement } from "@/lib/renderer/canvas";
import { studioChrome } from "./studioChrome";

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
  shape: "rect" | "ellipse" | "lasso" | "polygon";
  localPoints: LocalPoint[];
  mode: RasterSelectionMode;
};

type RetouchDrag = {
  kind: "retouch";
  mode: "heal" | "clone";
  localPoints: LocalPoint[];
  sourcePoint?: LocalPoint;
  size: number;
  opacity: number;
};

type QuickDrag = {
  kind: "quick";
  imageData: RasterPixelData;
  mask: Uint8Array;
  mode: RasterSelectionMode;
  brushSize: number;
  tolerance: number;
  lastLocal: LocalPoint;
  pending: boolean;
  generation: number;
  finishOnComplete?: boolean;
};

type DragState =
  | PaintDrag
  | SelectionDrag
  | RetouchDrag
  | QuickDrag
  | { kind: "pan"; lastX: number; lastY: number };

/**
 * Image-space Raster Studio viewport: pan/zoom + paint/selection/retouch/wand/quick.
 * Commits go through editorController onto the live ImageElement; Save still bakes.
 */
export default function RasterStudioViewport({ elementId }: { elementId: string }) {
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const setDirty = useRasterStudioSession((s) => s.setDirty);
  const zoom = useRasterStudioSession((s) => s.zoom);
  const pan = useRasterStudioSession((s) => s.pan);
  const setZoom = useRasterStudioSession((s) => s.setZoom);
  const setPan = useRasterStudioSession((s) => s.setPan);
  const setImageSize = useRasterStudioSession((s) => s.setImageSize);

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
  const quickSize = useEngine((s) => s.rasterQuickSelectionSize);

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
      s.activeRasterSelection?.imageId === elementId
        ? s.activeRasterSelection.selection.operations.length
        : 0,
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
  const stageRef = useRef<HTMLDivElement | null>(null);
  const spacePanRef = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const cloneSourceRef = useRef<LocalPoint | null>(null);
  const wandRequestRef = useRef(0);
  const quickRequestRef = useRef(0);
  const quickAbortRef = useRef<AbortController | null>(null);
  const [draftPoints, setDraftPoints] = useState<LocalPoint[] | null>(null);
  const [selectionDraft, setSelectionDraft] = useState<{
    shape: RasterSelectionShape;
    mode: RasterSelectionMode;
  } | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const width = Math.max(1, Math.round(image.width));
    const height = Math.max(1, Math.round(image.height));
    const bakeTarget: ImageElement = { ...image, x: 0, y: 0, angle: 0, opacity: 1 };
    const surface = createBakeSurface(width, height);
    surface.ctx.setTransform(1, 0, 0, 1, 0, 0);
    surface.ctx.clearRect(0, 0, width, height);
    renderElement(bakeTarget, { ctx: surface.ctx, images: getImageCache() } as RenderCtx);
    if (
      surface.offscreen &&
      typeof OffscreenCanvas !== "undefined" &&
      surface.canvas instanceof OffscreenCanvas
    ) {
      if (blitOffscreenPreview(surface.canvas, canvas)) return;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (surface.canvas instanceof HTMLCanvasElement) {
      ctx.drawImage(surface.canvas, 0, 0);
      return;
    }
    renderElement(bakeTarget, { ctx, images: getImageCache() } as RenderCtx);
  }, [image]);

  useEffect(() => {
    redraw();
  }, [redraw, revisionKey]);

  useEffect(() => {
    selectOnly([elementId]);
  }, [elementId, selectOnly]);

  useEffect(() => {
    if (!image) return;
    setImageSize({ width: image.width, height: image.height });
  }, [image, setImageSize]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const report = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const session = useRasterStudioSession.getState();
      session.setStageSize({ width, height });
      if (!session.didInitialFit && width >= 8 && height >= 8 && session.imageSize.width >= 1) {
        session.fitView();
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [image]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      event.preventDefault();
      spacePanRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spacePanRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      spacePanRef.current = false;
      setSpaceHeld(false);
    };
  }, []);

  // Clear polygon/quick drafts when switching tools.
  useEffect(() => {
    dragRef.current = null;
    setDraftPoints(null);
    setSelectionDraft(null);
    quickAbortRef.current?.abort();
  }, [studioTool]);

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

  const commitPolygon = useCallback(() => {
    const drag = dragRef.current;
    if (!image || !drag || drag.kind !== "selection" || drag.shape !== "polygon") return false;
    if (!canCommitRasterPolygon(drag.localPoints)) {
      setStatus("Need at least 3 points");
      return false;
    }
    const shape = selectionShapeFromPoints("polygon", drag.localPoints, image.width, image.height);
    controller.commitRasterSelection(image.id, createRasterSelectionOperation(drag.mode, shape));
    dragRef.current = null;
    setDraftPoints(null);
    setSelectionDraft(null);
    setDirty(true);
    setStatus(null);
    return true;
  }, [controller, image, setDirty]);

  const commitQuick = useCallback(
    (drag: QuickDrag) => {
      if (!image) return;
      if (drag.mask.some((value) => value !== 0)) {
        controller.commitRasterSelection(
          image.id,
          createRasterSelectionOperation(drag.mode, {
            kind: "bitmap",
            dataUrl: magicWandMaskToDataUrl(drag.mask, drag.imageData.width, drag.imageData.height),
          }),
        );
        setDirty(true);
      }
      setSelectionDraft(null);
    },
    [controller, image, setDirty],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        if (commitPolygon()) event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        if (dragRef.current?.kind === "selection" && dragRef.current.shape === "polygon") {
          event.preventDefault();
          event.stopImmediatePropagation();
          dragRef.current = null;
          setDraftPoints(null);
          setSelectionDraft(null);
          setStatus(null);
          return;
        }
        if (image && activeRasterSelection?.imageId === image.id) {
          // Shell also handles Escape → clear selection; leave it to shell.
          return;
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [activeRasterSelection?.imageId, commitPolygon, image]);

  const stampQuickAt = (drag: QuickDrag, local: LocalPoint, imageEl: ImageElement) => {
    drag.pending = true;
    const generation = ++drag.generation;
    quickAbortRef.current?.abort();
    const abort = new AbortController();
    quickAbortRef.current = abort;
    const requestId = ++quickRequestRef.current;
    void quickSelectionMaskForPointAsync(
      drag.imageData,
      imageEl,
      local,
      drag.brushSize,
      drag.tolerance,
      abort.signal,
    )
      .then((stamp) => {
        const current = dragRef.current;
        if (
          current !== drag ||
          current.kind !== "quick" ||
          current.generation !== generation ||
          quickRequestRef.current !== requestId
        ) {
          return;
        }
        for (let i = 0; i < current.mask.length; i++) {
          if (stamp[i]) current.mask[i] = 1;
        }
        current.pending = false;
        setSelectionDraft({
          shape: {
            kind: "bitmap",
            dataUrl: magicWandMaskToDataUrl(
              current.mask,
              current.imageData.width,
              current.imageData.height,
            ),
          },
          mode: current.mode,
        });
        if (current.finishOnComplete) {
          dragRef.current = null;
          commitQuick(current);
        }
      })
      .catch(() => {
        const current = dragRef.current;
        if (current === drag && current.kind === "quick") {
          current.pending = false;
          if (current.finishOnComplete) {
            dragRef.current = null;
            setSelectionDraft(null);
          }
        }
      });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!image) return;

    if (studioTool === "hand" || event.button === 1 || spacePanRef.current) {
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { kind: "pan", lastX: event.clientX, lastY: event.clientY };
      return;
    }

    const local = clientToLocal(event.clientX, event.clientY);
    if (!local) return;

    if (studioTool === "rasterPolygonLasso") {
      if (
        dragRef.current?.kind === "selection" &&
        dragRef.current.shape === "polygon" &&
        event.detail >= 2
      ) {
        commitPolygon();
        return;
      }
      if (dragRef.current?.kind === "selection" && dragRef.current.shape === "polygon") {
        const next = appendRasterPolygonPoint(dragRef.current.localPoints, local);
        dragRef.current = { ...dragRef.current, localPoints: next };
        setDraftPoints([...next]);
        setSelectionDraft({
          shape: selectionShapeFromPoints("polygon", next, image.width, image.height),
          mode: dragRef.current.mode,
        });
        setStatus(`${next.length} points · Enter or double-click to close`);
        return;
      }
      const mode = selectionModeFromModifiers(event);
      dragRef.current = {
        kind: "selection",
        shape: "polygon",
        localPoints: [local],
        mode,
      };
      setDraftPoints([local]);
      setSelectionDraft({
        shape: selectionShapeFromPoints("polygon", [local], image.width, image.height),
        mode,
      });
      setStatus("1 point · click to add · Enter to close");
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (
      studioTool === "rasterBrush" ||
      studioTool === "rasterPencil" ||
      studioTool === "rasterEraser"
    ) {
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

    if (
      studioTool === "rasterMarquee" ||
      studioTool === "rasterEllipse" ||
      studioTool === "rasterLasso"
    ) {
      dragRef.current = {
        kind: "selection",
        shape:
          studioTool === "rasterMarquee"
            ? "rect"
            : studioTool === "rasterEllipse"
              ? "ellipse"
              : "lasso",
        localPoints: [local],
        mode: selectionModeFromModifiers(event),
      };
      setDraftPoints([local]);
      return;
    }

    if (studioTool === "rasterQuickSelection") {
      const imageData = createRasterSelectionSample(image, getImageCache());
      if (!imageData) {
        setStatus("Image pixels are not readable");
        return;
      }
      const drag: QuickDrag = {
        kind: "quick",
        imageData,
        mask: new Uint8Array(imageData.width * imageData.height),
        mode: selectionModeFromModifiers(event),
        brushSize: quickSize,
        tolerance: wandTolerance,
        lastLocal: local,
        pending: true,
        generation: 0,
      };
      dragRef.current = drag;
      setSelectionDraft({
        shape: {
          kind: "bitmap",
          dataUrl: magicWandMaskToDataUrl(drag.mask, imageData.width, imageData.height),
        },
        mode: drag.mode,
      });
      stampQuickAt(drag, local, image);
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
        void createMagicWandSelectionShapeAsync(image, local, wandTolerance, getImageCache()).then(
          applyShape,
        );
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
      const current = useRasterStudioSession.getState().pan;
      setPan({ x: current.x + dx, y: current.y + dy });
      return;
    }

    const local = clientToLocal(event.clientX, event.clientY);
    if (!local) return;

    if (drag.kind === "quick") {
      if (
        Math.hypot(local[0] - drag.lastLocal[0], local[1] - drag.lastLocal[1]) <
        Math.max(2 / zoom, drag.brushSize * 0.2)
      ) {
        return;
      }
      drag.lastLocal = local;
      stampQuickAt(drag, local, image);
      return;
    }

    if (drag.kind === "selection" && drag.shape === "polygon") return;

    const last = "localPoints" in drag ? drag.localPoints.at(-1) : undefined;
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
      setSelectionDraft({
        shape: selectionShapeFromPoints(drag.shape, drag.localPoints, image.width, image.height),
        mode: drag.mode,
      });
      return;
    }
    if (drag.kind === "retouch") {
      drag.localPoints.push(local);
      setDraftPoints([...drag.localPoints]);
    }
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    if (!drag || !image) return;

    if (drag.kind === "selection" && drag.shape === "polygon") {
      // Keep polygon open across clicks.
      return;
    }

    dragRef.current = null;
    setDraftPoints(null);

    if (drag.kind === "pan") return;

    if (drag.kind === "quick") {
      if (drag.pending) {
        drag.finishOnComplete = true;
        dragRef.current = drag;
        return;
      }
      commitQuick(drag);
      return;
    }

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
      setSelectionDraft(null);
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

  const selectionForOverlay =
    activeRasterSelection?.imageId === image.id ? activeRasterSelection.selection : undefined;

  const panning = studioTool === "hand" || spaceHeld;

  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor: panning ? "grab" : "crosshair",
        touchAction: "none",
        background: studioChrome.pasteboard,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={(event) => {
        event.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const next = clampStudioZoom(zoom * (event.deltaY < 0 ? 1.08 : 0.92));
        const rect = stage.getBoundingClientRect();
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        const scale = next / Math.max(zoom, 0.0001);
        setPan({
          x: cx - (cx - pan.x) * scale,
          y: cy - (cy - pan.y) * scale,
        });
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
        <div
          style={{
            position: "relative",
            width: image.width,
            height: image.height,
            lineHeight: 0,
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.28)",
            // Checkerboard shows through transparent pixels (canvas is cleared, not filled).
            backgroundColor: "#ffffff",
            backgroundImage: "repeating-conic-gradient(#d4d4d4 0% 25%, #efefef 0% 50%)",
            backgroundSize: "16px 16px",
          }}
        >
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              width: image.width,
              height: image.height,
              background: "transparent",
            }}
          />
          <RasterSelectionOverlay
            image={{ ...image, x: 0, y: 0, angle: 0 }}
            selection={selectionForOverlay}
            draft={selectionDraft}
            worldToScreen={(point) => {
              const canvas = canvasRef.current;
              if (!canvas) return point;
              const rect = canvas.getBoundingClientRect();
              // Overlay is positioned over the canvas element in CSS pixels.
              return {
                x: (point.x / Math.max(1, image.width)) * rect.width,
                y: (point.y / Math.max(1, image.height)) * rect.height,
              };
            }}
          />
          {draftPath ? (
            <svg
              aria-hidden
              viewBox={`0 0 ${image.width} ${image.height}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            >
              <polyline
                points={draftPath}
                fill="none"
                stroke="#d8e6ff"
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
            borderRadius: 4,
            background: "rgba(24, 24, 24, 0.72)",
            color: "#f0f0f0",
            fontSize: 12,
            pointerEvents: "none",
          }}
        >
          {status}
        </div>
      ) : null}
    </div>
  );
}
