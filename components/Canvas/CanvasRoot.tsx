"use client";

/**
 * CanvasRoot — viewport host for the new engine.
 *
 * Pure viewport: handles DPR-aware sizing, fit-to-screen, zoom-around-cursor,
 * space-pan / middle-mouse-pan, and renders one slide via
 * `lib/renderer/canvas.ts`. Optionally renders a `draftElement` overlay for
 * tool previews (e.g. the rectangle being dragged out).
 *
 * Tool state and selection live in the parent — see `CanvasEditor.tsx`.
 * Parents subscribe to `onPointerDownWorld/Move/Up` which receive
 * slide-local coordinates plus a `mode` flag indicating whether the gesture
 * is a viewport pan (handled internally) or a content gesture (forwarded).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { EngineElement, EngineSlide } from "@/lib/engine/types";
import { renderElement, renderSlide } from "@/lib/renderer/canvas";

export type WorldPoint = { x: number; y: number };

function getTouchDist(touches: React.TouchList) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

export type ViewTransform = { scale: number; tx: number; ty: number };

export type CanvasRootHandle = {
  /** Convert a client-space point (e.g. from React event) to slide-local. */
  clientToWorld: (clientX: number, clientY: number) => WorldPoint;
  /** Convert a slide-local point back to container-local screen px. */
  worldToScreen: (p: WorldPoint) => { x: number; y: number };
  /** Re-fit the slide to the viewport (used by toolbar "fit" button). */
  resetView: () => void;
  /** Current view (scale + offset); changes are signalled via onViewChange too. */
  getView: () => ViewTransform;
};

type Props = {
  slide: EngineSlide;
  /** Element drawn on top after the slide (tool preview). */
  draftElement?: EngineElement | null;
  /** Optional image cache. */
  images?: Map<string, HTMLImageElement>;
  /** Grid snap size for drawing the dot grid background. */
  snapGrid?: number | null;
  /** Highlighted ids (rendered as a selection outline). */
  selectedIds?: ReadonlySet<string>;
  className?: string;
  /** When true, any pointer drag pans the viewport (hand tool mode). */
  handActive?: boolean;
  /** Override cursor while no gesture is in flight. */
  toolCursor?: string;
  /** Forwarded pointer events with slide-local coords. */
  onPointerDownWorld?: (p: WorldPoint, e: React.PointerEvent) => void;
  onPointerMoveWorld?: (p: WorldPoint, e: React.PointerEvent) => void;
  onPointerUpWorld?: (p: WorldPoint, e: React.PointerEvent) => void;
  /** Notified whenever scale/translate changes; parent uses this to place overlays. */
  onViewChange?: (view: ViewTransform) => void;
  /** Children rendered on top of the canvas, inside the same container (used for overlays). */
  children?: React.ReactNode;
};

type View = { scale: number; tx: number; ty: number };

const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

const CanvasRoot = forwardRef<CanvasRootHandle, Props>(function CanvasRoot(
  {
    slide,
    draftElement,
    images,
    snapGrid,
    selectedIds,
    className,
    handActive,
    toolCursor,
    onPointerDownWorld,
    onPointerMoveWorld,
    onPointerUpWorld,
    onViewChange,
    children,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const touchRef = useRef<{
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  // ——— resize observer ———
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const slideW = slide.width;
  const slideH = slide.height;

  // ——— fit-to-viewport ———
  const fitScale = useMemo(() => {
    if (!size.w || !size.h) return 1;
    const pad = 80;
    return Math.min((size.w - pad) / slideW, (size.h - pad) / slideH);
  }, [size.w, size.h, slideW, slideH]);

  const resetView = useCallback(() => {
    if (!size.w || !size.h) return;
    const s = fitScale * 0.9;
    const tx = (size.w - slideW * s) / 2;
    const ty = (size.h - slideH * s) / 2;
    setView({ scale: s, tx, ty });
  }, [fitScale, size.w, size.h, slideW, slideH]);

  // Auto-fit on initial measure and whenever the active slide changes.
  const lastSlideId = useRef<string | null>(null);
  useEffect(() => {
    if (!size.w || !size.h) return;
    if (lastSlideId.current === slide.id) return;
    lastSlideId.current = slide.id;
    resetView();
  }, [resetView, size.w, size.h, slide.id]);

  // ——— DPR-aware redraw ———
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    const wantW = Math.round(size.w * dpr);
    const wantH = Math.round(size.h * dpr);
    if (canvas.width !== wantW) canvas.width = wantW;
    if (canvas.height !== wantH) canvas.height = wantH;
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background of the page surrounding the slide.
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = "#e9ecf1";
    ctx.fillRect(0, 0, size.w, size.h);

    // Viewport transform.
    ctx.save();
    ctx.translate(view.tx, view.ty);
    ctx.scale(view.scale, view.scale);

    // Slide drop shadow + paper.
    ctx.shadowColor = "rgba(15, 20, 35, 0.18)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = slide.background;
    ctx.fillRect(0, 0, slideW, slideH);
    ctx.shadowColor = "transparent";

    if (snapGrid) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      const r = Math.max(0.5, 1.5 / view.scale);
      for (let x = 0; x <= slideW; x += snapGrid) {
        for (let y = 0; y <= slideH; y += snapGrid) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    renderSlide(slide, { ctx, images }, slideW, slideH);
    if (draftElement) renderElement(draftElement, { ctx, images });

    // Slide border drawn on top of content so it stays visible.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1 / view.scale;
    ctx.strokeRect(0, 0, slideW, slideH);

    // Selection outline overlay.
    if (selectedIds && selectedIds.size > 0) {
      ctx.save();
      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 1.5 / view.scale;
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      for (const el of slide.elements) {
        if (el.isDeleted || !selectedIds.has(el.id)) continue;
        ctx.save();
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        ctx.translate(cx, cy);
        ctx.rotate(el.angle);
        ctx.strokeRect(-el.width / 2, -el.height / 2, el.width, el.height);
        ctx.restore();
      }
      ctx.restore();
    }

    // Lock indicator on locked elements.
    for (const el of slide.elements) {
      if (el.isDeleted || !el.locked) continue;
      const s = 10 / view.scale;
      const lx = el.x + el.width - s - 4 / view.scale;
      const ly = el.y + 4 / view.scale;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(lx + s / 2, ly + s / 2, s / 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${s}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🔒", lx + s / 2, ly + s / 2);
      ctx.restore();
    }

    ctx.restore();
  }, [slide, slideW, slideH, view, size.w, size.h, images, draftElement, selectedIds, snapGrid]);

  // ——— wheel zoom + scroll pan ———
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      const clientX = e.clientX;
      const clientY = e.clientY;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setView((v) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        if (nextScale === v.scale) return v;
        const mx = clientX - rect.left;
        const my = clientY - rect.top;
        const wx = (mx - v.tx) / v.scale;
        const wy = (my - v.ty) / v.scale;
        return { scale: nextScale, tx: mx - wx * nextScale, ty: my - wy * nextScale };
      });
      return;
    }
    setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
  }, []);

  // ——— Native non-passive wheel to prevent browser zoom/scroll ———
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const preventNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
    };
    el.addEventListener("wheel", preventNativeWheel, { passive: false });
    return () => el.removeEventListener("wheel", preventNativeWheel);
  }, []);

  // ——— space-to-pan ———
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && !isEditableTarget(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") setSpaceDown(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ——— coord conversion ———
  const clientToWorld = useCallback(
    (clientX: number, clientY: number): WorldPoint => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const lx = clientX - rect.left;
      const ly = clientY - rect.top;
      return { x: (lx - view.tx) / view.scale, y: (ly - view.ty) / view.scale };
    },
    [view.scale, view.tx, view.ty],
  );

  // Notify parent whenever view changes.
  useEffect(() => {
    onViewChange?.(view);
  }, [view, onViewChange]);

  const worldToScreen = useCallback(
    (p: WorldPoint) => ({ x: p.x * view.scale + view.tx, y: p.y * view.scale + view.ty }),
    [view.scale, view.tx, view.ty],
  );

  useImperativeHandle(
    ref,
    () => ({ clientToWorld, worldToScreen, resetView, getView: () => view }),
    [clientToWorld, worldToScreen, resetView, view],
  );

  // ——— pointer routing: pan vs forward to parent ———
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const isPan = spaceDown || e.button === 1 || handActive;
      if (isPan) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
        return;
      }
      if (e.button !== 0) return;
      onPointerDownWorld?.(clientToWorld(e.clientX, e.clientY), e);
    },
    [clientToWorld, handActive, onPointerDownWorld, spaceDown, view.tx, view.ty],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (panRef.current) {
        const pan = panRef.current;
        setView((v) => ({
          ...v,
          tx: pan.tx + (e.clientX - pan.x),
          ty: pan.ty + (e.clientY - pan.y),
        }));
        return;
      }
      onPointerMoveWorld?.(clientToWorld(e.clientX, e.clientY), e);
    },
    [clientToWorld, onPointerMoveWorld],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (panRef.current) {
        panRef.current = null;
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      onPointerUpWorld?.(clientToWorld(e.clientX, e.clientY), e);
    },
    [clientToWorld, onPointerUpWorld],
  );

  // ——— touch: pinch-to-zoom + two-finger pan ———
  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        touchRef.current = {
          startDist: dist,
          startScale: view.scale,
          startX: cx,
          startY: cy,
          startTx: view.tx,
          startTy: view.ty,
          centerX: cx,
          centerY: cy,
        };
      }
    },
    [view.scale, view.tx, view.ty],
  );

  const onTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchRef.current) {
      e.preventDefault();
      const t = touchRef.current;
      const newDist = getTouchDist(e.touches);
      const scaleFactor = newDist / t.startDist;
      let newScale = t.startScale * scaleFactor;
      newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      // Zoom around the gesture center.
      const worldX = (t.centerX - t.startTx) / t.startScale;
      const worldY = (t.centerY - t.startTy) / t.startScale;
      const newTx = t.centerX - worldX * newScale;
      const newTy = t.centerY - worldY * newScale;

      // Add two-finger pan offset.
      const panX = cx - t.startX;
      const panY = cy - t.startY;

      setView({ scale: newScale, tx: newTx + panX, ty: newTy + panY });
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    touchRef.current = null;
  }, []);

  const cursor = panRef.current
    ? "grabbing"
    : spaceDown || handActive
      ? "grab"
      : (toolCursor ?? "default");

  return (
    <div
      ref={containerRef}
      className={className}
      role="application"
      aria-label="Slide canvas. Use Tab to reach toolbar and selection controls."
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        cursor,
        touchAction: "none",
      }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      {children}
    </div>
  );
});

export default CanvasRoot;

function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  if (["INPUT", "TEXTAREA"].includes(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return false;
}
