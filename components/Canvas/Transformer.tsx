"use client";

/**
 * Transformer overlay — 8 resize handles + 1 rotate handle for the current
 * selection. Renders as absolutely-positioned divs above the canvas. Handle
 * positions are computed in slide-local space then projected to screen via
 * the supplied `worldToScreen`.
 *
 * Multi-element selection: the transformer wraps the union AABB. Move drag
 * is handled in `CanvasEditor`; here we focus on resize/rotate of either a
 * single element or, for now, a single element when multiple are selected
 * we still draw the union bbox but disable resize/rotate (Phase 2 ships
 * proper multi-element scale-around-pivot).
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { elementWorldBBox, localToWorld, type Rect, unionBBox } from "@/lib/engine/bounds";
import { pickTopMost } from "@/lib/engine/hitTest";
import {
  getInteractiveElements,
  getLayerForObject,
  getRenderableElements,
  isObjectLocked,
} from "@/lib/engine/layers";
import { isMediaElement } from "@/lib/engine/mediaLayout";
import { snapResize } from "@/lib/engine/snap";
import { useEngine } from "@/lib/engine/store";
import { getTextMinimumHeight } from "@/lib/engine/textLayout";
import type { ArrowElement, EngineElement } from "@/lib/engine/types";

const SNAP_THRESHOLD_PX = 6;

type Props = {
  worldToScreen: (p: { x: number; y: number }) => { x: number; y: number };
  scale: number;
  /** Notify parent of snap guides while dragging handles (multi-resize). */
  onGuidesChange?: (guides: import("@/lib/engine/snap").Guide[]) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
};

const HANDLE = 10;
const ROTATE_OFFSET = 28;

type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot" | "start" | "end" | "mid";

export default function Transformer({
  worldToScreen,
  scale,
  onGuidesChange,
  onDoubleClick,
}: Props) {
  const slide = useEngine((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
  const selectedIds = useEngine((s) => s.selectedIds);
  const checkpointInteraction = useEngine((s) => s.checkpointInteraction);
  const previewElements = useEngine((s) => s.previewElements);
  const commitBlockLayout = useEngine((s) => s.commitBlockLayout);

  const [active, setActive] = useState<HandleId | null>(null);
  const [rotateDeg, setRotateDeg] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    handle: HandleId;
    startClient: { x: number; y: number };
    initialMouseAngle?: number;
    el: EngineElement;
    checkpointed: boolean;
    /** For multi-select scale: snapshot of all selected elements + AABB. */
    multi?: { originals: EngineElement[]; aabb: Rect };
  } | null>(null);

  const selectedElements = useMemo(() => {
    if (!slide) return [] as EngineElement[];
    return getRenderableElements(slide).filter((el) => selectedIds.has(el.id));
  }, [slide, selectedIds]);

  const single = selectedElements.length === 1 ? selectedElements[0] : null;

  // For multi we draw union bbox (axis-aligned) without resize handles for now.
  const bbox: Rect | null = useMemo(() => {
    if (single) return elementWorldBBox(single);
    return unionBBox(selectedElements);
  }, [single, selectedElements]);

  const onPointerDown = useCallback(
    (handle: HandleId) => (e: React.PointerEvent) => {
      // Single-select path.
      if (single) {
        if (!slide || isObjectLocked(slide, single.id)) return;
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

        let initialMouseAngle: number | undefined;
        if (handle === "rot") {
          const svgRect = svgRef.current?.getBoundingClientRect();
          const mouseContainerX = svgRect ? e.clientX - svgRect.left : e.clientX;
          const mouseContainerY = svgRect ? e.clientY - svgRect.top : e.clientY;
          const cx = single.x + single.width / 2;
          const cy = single.y + single.height / 2;
          const screenCenter = worldToScreen({ x: cx, y: cy });
          initialMouseAngle = Math.atan2(
            mouseContainerY - screenCenter.y,
            mouseContainerX - screenCenter.x,
          );
          let deg = Math.round((single.angle * 180) / Math.PI) % 360;
          if (deg < 0) deg += 360;
          setRotateDeg(deg);
        }

        dragRef.current = {
          handle,
          startClient: { x: e.clientX, y: e.clientY },
          initialMouseAngle,
          el: { ...single },
          checkpointed: false,
        };
        setActive(handle);
        return;
      }
      // Multi-select path: snapshot AABB + originals.
      if (selectedElements.length < 2 || !bbox) return;
      if (!slide || selectedElements.some((el) => isObjectLocked(slide, el.id))) return;
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      let initialMouseAngle: number | undefined;
      if (handle === "rot") {
        const svgRect = svgRef.current?.getBoundingClientRect();
        const mouseContainerX = svgRect ? e.clientX - svgRect.left : e.clientX;
        const mouseContainerY = svgRect ? e.clientY - svgRect.top : e.clientY;
        const cx = bbox.x + bbox.width / 2;
        const cy = bbox.y + bbox.height / 2;
        const screenCenter = worldToScreen({ x: cx, y: cy });
        initialMouseAngle = Math.atan2(
          mouseContainerY - screenCenter.y,
          mouseContainerX - screenCenter.x,
        );
        setRotateDeg(0);
      }

      dragRef.current = {
        handle,
        startClient: { x: e.clientX, y: e.clientY },
        initialMouseAngle,
        el: selectedElements[0],
        checkpointed: false,
        multi: {
          originals: selectedElements.map((el) => ({ ...el })),
          aabb: { ...bbox },
        },
      };
      setActive(handle);
    },
    [bbox, selectedElements, single, slide, worldToScreen],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.checkpointed) {
        checkpointInteraction(drag.handle === "rot" ? "rotate" : "resize");
        drag.checkpointed = true;
      }
      const snapGrid = useEngine.getState().doc.snapGrid;
      const dx = (e.clientX - drag.startClient.x) / scale;
      const dy = (e.clientY - drag.startClient.y) / scale;
      // Multi-element scale or rotate path.
      if (drag.multi) {
        const { originals, aabb } = drag.multi;
        const handle = drag.handle;

        if (handle === "rot") {
          const svgRect = svgRef.current?.getBoundingClientRect();
          const mouseContainerX = svgRect ? e.clientX - svgRect.left : e.clientX;
          const mouseContainerY = svgRect ? e.clientY - svgRect.top : e.clientY;
          const cx = aabb.x + aabb.width / 2;
          const cy = aabb.y + aabb.height / 2;
          const screenCenter = worldToScreen({ x: cx, y: cy });

          const currentMouseAngle = Math.atan2(
            mouseContainerY - screenCenter.y,
            mouseContainerX - screenCenter.x,
          );
          const initAngle = drag.initialMouseAngle ?? currentMouseAngle;
          let deltaAngle = Math.atan2(
            Math.sin(currentMouseAngle - initAngle),
            Math.cos(currentMouseAngle - initAngle),
          );

          if (e.shiftKey) {
            deltaAngle = Math.round(deltaAngle / (Math.PI / 12)) * (Math.PI / 12);
          }

          let deg = Math.round((deltaAngle * 180) / Math.PI) % 360;
          if (deg < 0) deg += 360;
          setRotateDeg(deg);

          const cos = Math.cos(deltaAngle);
          const sin = Math.sin(deltaAngle);

          const patches = originals.map((el) => {
            const elCx = el.x + el.width / 2;
            const elCy = el.y + el.height / 2;
            const ox = elCx - cx;
            const oy = elCy - cy;
            const newElCx = cx + ox * cos - oy * sin;
            const newElCy = cy + ox * sin + oy * cos;
            return {
              id: el.id,
              patch: {
                x: newElCx - el.width / 2,
                y: newElCy - el.height / 2,
                angle: (el.angle ?? 0) + deltaAngle,
              },
            };
          });
          previewElements(patches);
          return;
        }

        const keepAR = e.shiftKey || originals.some(isMediaElement);
        const right = handle === "e" || handle === "ne" || handle === "se";
        const left = handle === "w" || handle === "nw" || handle === "sw";
        const bottom = handle === "s" || handle === "se" || handle === "sw";
        const top = handle === "n" || handle === "ne" || handle === "nw";
        let nx = aabb.x;
        let ny = aabb.y;
        let nw = aabb.width;
        let nh = aabb.height;
        if (right) nw = Math.max(2, aabb.width + dx);
        if (left) {
          nw = Math.max(2, aabb.width - dx);
          nx = aabb.x + (aabb.width - nw);
        }
        if (bottom) nh = Math.max(2, aabb.height + dy);
        if (top) {
          nh = Math.max(2, aabb.height - dy);
          ny = aabb.y + (aabb.height - nh);
        }
        if (keepAR) {
          const ar = aabb.width / Math.max(1, aabb.height);
          if (handle === "e" || handle === "w") nh = nw / ar;
          else nw = nh * ar;
          if (top) ny = aabb.y + aabb.height - nh;
          if (left) nx = aabb.x + aabb.width - nw;
        }
        // Snap moving edges to slide / other-element targets.
        if (slide) {
          if (snapGrid) {
            if (right) {
              const tr = Math.round((nx + nw) / snapGrid) * snapGrid;
              nw = Math.max(2, tr - nx);
            }
            if (left) {
              const tl = Math.round(nx / snapGrid) * snapGrid;
              nw = Math.max(2, nw - (tl - nx));
              nx = tl;
            }
            if (bottom) {
              const tb = Math.round((ny + nh) / snapGrid) * snapGrid;
              nh = Math.max(2, tb - ny);
            }
            if (top) {
              const tt = Math.round(ny / snapGrid) * snapGrid;
              nh = Math.max(2, nh - (tt - ny));
              ny = tt;
            }
            onGuidesChange?.([]);
          } else {
            const others = getInteractiveElements(slide).filter(
              (el) => !originals.some((original) => original.id === el.id),
            );
            const snap = snapResize(
              { x: nx, y: ny, width: nw, height: nh },
              { left, right, top, bottom },
              others,
              SNAP_THRESHOLD_PX / scale,
            );
            if (left) nx += snap.dx;
            else nw += snap.dx;
            if (top) ny += snap.dy;
            else nh += snap.dy;
            onGuidesChange?.(snap.guides);
          }
        }
        const sx = nw / aabb.width;
        const sy = nh / aabb.height;
        const patches = originals.map((el) => ({
          id: el.id,
          patch: {
            x: nx + (el.x - aabb.x) * sx,
            y: ny + (el.y - aabb.y) * sy,
            width: el.width * sx,
            height: el.height * sy,
          },
        }));
        previewElements(patches);
        return;
      }
      const start = drag.el;
      if (
        (start.type === "line" || start.type === "arrow") &&
        (drag.handle === "start" || drag.handle === "end" || drag.handle === "mid")
      ) {
        const pts = start.points;
        const first = pts[0] ?? [0, 0];
        const last = pts[pts.length - 1] ?? [start.width, start.height];
        const absA: [number, number] = [start.x + first[0], start.y + first[1]];
        const absB: [number, number] = [start.x + last[0], start.y + last[1]];

        // Midpoint drag — insert/update a middle control point
        if (drag.handle === "mid") {
          // Compute the midpoint between start and end, then offset by dx/dy
          const midBaseX = (absA[0] + absB[0]) / 2;
          const midBaseY = (absA[1] + absB[1]) / 2;
          // If we already have a 3-point path, use the existing mid
          const existingMid =
            pts.length >= 3 ? [start.x + pts[1][0], start.y + pts[1][1]] : [midBaseX, midBaseY];
          const absMid: [number, number] = [existingMid[0] + dx, existingMid[1] + dy];
          const allX = [absA[0], absMid[0], absB[0]];
          const allY = [absA[1], absMid[1], absB[1]];
          const minX = Math.min(...allX);
          const minY = Math.min(...allY);
          const maxX = Math.max(...allX);
          const maxY = Math.max(...allY);
          const patch: Partial<EngineElement> = {
            x: minX,
            y: minY,
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            points: [
              [absA[0] - minX, absA[1] - minY],
              [absMid[0] - minX, absMid[1] - minY],
              [absB[0] - minX, absB[1] - minY],
            ],
          };
          previewElements([{ id: start.id, patch }]);
          return;
        }
        if (drag.handle === "start") {
          absA[0] += dx;
          absA[1] += dy;
          if (snapGrid) {
            absA[0] = Math.round(absA[0] / snapGrid) * snapGrid;
            absA[1] = Math.round(absA[1] / snapGrid) * snapGrid;
          }
        } else {
          absB[0] += dx;
          absB[1] += dy;
          if (snapGrid) {
            absB[0] = Math.round(absB[0] / snapGrid) * snapGrid;
            absB[1] = Math.round(absB[1] / snapGrid) * snapGrid;
          }
        }
        const minX = Math.min(absA[0], absB[0]);
        const minY = Math.min(absA[1], absB[1]);
        const maxX = Math.max(absA[0], absB[0]);
        const maxY = Math.max(absA[1], absB[1]);

        let startBinding =
          start.type === "arrow" ? (start as ArrowElement).startBinding : undefined;
        let endBinding = start.type === "arrow" ? (start as ArrowElement).endBinding : undefined;

        if (slide && start.type === "arrow") {
          const hit = pickTopMost(
            {
              x: drag.handle === "start" ? absA[0] : absB[0],
              y: drag.handle === "start" ? absA[1] : absB[1],
            },
            getInteractiveElements(slide).filter((element) => element.id !== start.id),
          );
          if (hit && (hit.type === "rect" || hit.type === "ellipse" || hit.type === "diamond")) {
            if (drag.handle === "start") startBinding = { elementId: hit.id, gap: 12, focus: 0.5 };
            else endBinding = { elementId: hit.id, gap: 12, focus: 0.5 };
          } else {
            if (drag.handle === "start") startBinding = null;
            else endBinding = null;
          }
        }

        const patch: Partial<EngineElement> = {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          points: [
            [absA[0] - minX, absA[1] - minY],
            [absB[0] - minX, absB[1] - minY],
          ],
        };

        if (start.type === "arrow") {
          const arrowPatch = patch as Partial<ArrowElement>;
          arrowPatch.startBinding = startBinding;
          arrowPatch.endBinding = endBinding;
        }

        previewElements([{ id: start.id, patch }]);
        return;
      }
      if (drag.handle === "rot") {
        const svgRect = svgRef.current?.getBoundingClientRect();
        const mouseContainerX = svgRect ? e.clientX - svgRect.left : e.clientX;
        const mouseContainerY = svgRect ? e.clientY - svgRect.top : e.clientY;
        const cx = start.x + start.width / 2;
        const cy = start.y + start.height / 2;
        const screenCenter = worldToScreen({ x: cx, y: cy });

        const currentMouseAngle = Math.atan2(
          mouseContainerY - screenCenter.y,
          mouseContainerX - screenCenter.x,
        );
        const initAngle = drag.initialMouseAngle ?? currentMouseAngle;
        const deltaAngle = Math.atan2(
          Math.sin(currentMouseAngle - initAngle),
          Math.cos(currentMouseAngle - initAngle),
        );
        const rawAngle = start.angle + deltaAngle;

        // Snap to 15° if Shift held.
        const snapped = e.shiftKey
          ? Math.round(rawAngle / (Math.PI / 12)) * (Math.PI / 12)
          : rawAngle;
        let deg = Math.round((snapped * 180) / Math.PI) % 360;
        if (deg < 0) deg += 360;
        setRotateDeg(deg);
        previewElements([{ id: start.id, patch: { angle: snapped } }]);
        return;
      }
      // Resize: edit corners of the unrotated bbox in element-local space.
      // We treat dx/dy as in element-local for simplicity — fine for angle=0;
      // for rotated elements we project the screen delta onto the element's
      // local axes.
      const cos = Math.cos(start.angle);
      const sin = Math.sin(start.angle);
      const localDx = dx * cos + dy * sin;
      const localDy = -dx * sin + dy * cos;
      let newW = start.width;
      let newH = start.height;
      const keepAR = e.shiftKey || isMediaElement(start);
      const ar = start.width / Math.max(1, start.height);

      let px = 0.5,
        py = 0.5; // Pivot ratios

      switch (drag.handle) {
        case "e":
          newW = Math.max(2, start.width + localDx);
          px = 0;
          py = 0.5;
          break;
        case "w":
          newW = Math.max(2, start.width - localDx);
          px = 1;
          py = 0.5;
          break;
        case "s":
          newH = Math.max(2, start.height + localDy);
          px = 0.5;
          py = 0;
          break;
        case "n":
          newH = Math.max(2, start.height - localDy);
          px = 0.5;
          py = 1;
          break;
        case "se":
          newW = Math.max(2, start.width + localDx);
          newH = Math.max(2, start.height + localDy);
          px = 0;
          py = 0;
          break;
        case "ne":
          newW = Math.max(2, start.width + localDx);
          newH = Math.max(2, start.height - localDy);
          px = 0;
          py = 1;
          break;
        case "sw":
          newW = Math.max(2, start.width - localDx);
          newH = Math.max(2, start.height + localDy);
          px = 1;
          py = 0;
          break;
        case "nw":
          newW = Math.max(2, start.width - localDx);
          newH = Math.max(2, start.height - localDy);
          px = 1;
          py = 1;
          break;
        default:
          break;
      }

      if (keepAR) {
        if (drag.handle === "e" || drag.handle === "w") {
          newH = newW / ar;
        } else if (drag.handle === "n" || drag.handle === "s") {
          newW = newH * ar;
        } else {
          const widthChange = Math.abs(newW / start.width - 1);
          const heightChange = Math.abs(newH / start.height - 1);
          if (widthChange >= heightChange) newH = newW / ar;
          else newW = newH * ar;
        }
      }

      const dx_pivot = (px - 0.5) * (start.width - newW);
      const dy_pivot = (py - 0.5) * (start.height - newH);
      let newX = start.x + (start.width - newW) / 2 + dx_pivot * cos - dy_pivot * sin;
      let newY = start.y + (start.height - newH) / 2 + dx_pivot * sin + dy_pivot * cos;
      // Snap moving edges for axis-aligned elements (rotated boxes skip snap).
      if (start.angle === 0 && slide && !isMediaElement(start)) {
        const right = drag.handle === "e" || drag.handle === "ne" || drag.handle === "se";
        const leftEdge = drag.handle === "w" || drag.handle === "nw" || drag.handle === "sw";
        const bottom = drag.handle === "s" || drag.handle === "se" || drag.handle === "sw";
        const topEdge = drag.handle === "n" || drag.handle === "ne" || drag.handle === "nw";
        if (snapGrid) {
          if (right) {
            const tr = Math.round((newX + newW) / snapGrid) * snapGrid;
            newW = Math.max(2, tr - newX);
          }
          if (leftEdge) {
            const tl = Math.round(newX / snapGrid) * snapGrid;
            newW = Math.max(2, newW - (tl - newX));
            newX = tl;
          }
          if (bottom) {
            const tb = Math.round((newY + newH) / snapGrid) * snapGrid;
            newH = Math.max(2, tb - newY);
          }
          if (topEdge) {
            const tt = Math.round(newY / snapGrid) * snapGrid;
            newH = Math.max(2, newH - (tt - newY));
            newY = tt;
          }
          onGuidesChange?.([]);
        } else {
          const others = getInteractiveElements(slide).filter((el) => el.id !== start.id);
          const snap = snapResize(
            { x: newX, y: newY, width: newW, height: newH },
            { left: leftEdge, right, top: topEdge, bottom },
            others,
            SNAP_THRESHOLD_PX / scale,
          );
          if (leftEdge) newX += snap.dx;
          else newW += snap.dx;
          if (topEdge) newY += snap.dy;
          else newH += snap.dy;
          onGuidesChange?.(snap.guides);
        }
      }
      if (start.type === "text") {
        const minimumHeight = getTextMinimumHeight(
          start,
          Math.max(1, start.text.split("\n").length),
        );
        if (newH < minimumHeight) {
          const growsUp = drag.handle === "n" || drag.handle === "ne" || drag.handle === "nw";
          if (growsUp) newY -= minimumHeight - newH;
          newH = minimumHeight;
        }
      }
      previewElements([{ id: start.id, patch: { x: newX, y: newY, width: newW, height: newH } }]);
    },
    [checkpointInteraction, onGuidesChange, previewElements, scale, slide, worldToScreen],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      setActive(null);
      setRotateDeg(null);
      onGuidesChange?.([]);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (drag.checkpointed && drag.handle !== "rot" && slide) {
        const ids = drag.multi ? drag.multi.originals.map((element) => element.id) : [drag.el.id];
        for (const id of ids) {
          if (getLayerForObject(slide, id)?.mode === "block") commitBlockLayout(id);
        }
      }
    },
    [commitBlockLayout, onGuidesChange, slide],
  );

  if (!bbox || selectedElements.length === 0) return null;

  const allLocked = slide ? selectedElements.every((el) => isObjectLocked(slide, el.id)) : true;
  // For single rotated element, use oriented box; for multi use AABB.
  const handles: { id: HandleId; pt: { x: number; y: number }; cursor: string; bound?: boolean }[] =
    [];
  if (!single && selectedElements.length > 1 && !allLocked && bbox) {
    // AABB resize handles for multi-select.
    const layout: { id: HandleId; lx: number; ly: number; cursor: string }[] = [
      { id: "nw", lx: bbox.x, ly: bbox.y, cursor: "nwse-resize" },
      { id: "n", lx: bbox.x + bbox.width / 2, ly: bbox.y, cursor: "ns-resize" },
      { id: "ne", lx: bbox.x + bbox.width, ly: bbox.y, cursor: "nesw-resize" },
      { id: "e", lx: bbox.x + bbox.width, ly: bbox.y + bbox.height / 2, cursor: "ew-resize" },
      { id: "se", lx: bbox.x + bbox.width, ly: bbox.y + bbox.height, cursor: "nwse-resize" },
      { id: "s", lx: bbox.x + bbox.width / 2, ly: bbox.y + bbox.height, cursor: "ns-resize" },
      { id: "sw", lx: bbox.x, ly: bbox.y + bbox.height, cursor: "nesw-resize" },
      { id: "w", lx: bbox.x, ly: bbox.y + bbox.height / 2, cursor: "ew-resize" },
    ];
    for (const it of layout)
      handles.push({ id: it.id, pt: worldToScreen({ x: it.lx, y: it.ly }), cursor: it.cursor });

    // Rotate handle positioned above top-center for multi-selection / group
    const rotScreen = worldToScreen({
      x: bbox.x + bbox.width / 2,
      y: bbox.y - ROTATE_OFFSET / scale,
    });
    handles.push({ id: "rot", pt: rotScreen, cursor: "grab" });
  }
  if (single && slide && !isObjectLocked(slide, single.id)) {
    if (single.type === "line" || single.type === "arrow") {
      const pts = single.points;
      const first = pts[0] ?? [0, 0];
      const last = pts[pts.length - 1] ?? [single.width, single.height];
      handles.push({
        id: "start",
        pt: worldToScreen(localToWorld(single, { x: first[0], y: first[1] })),
        cursor: "move",
        bound: single.type === "arrow" && !!single.startBinding,
      });
      handles.push({
        id: "end",
        pt: worldToScreen(localToWorld(single, { x: last[0], y: last[1] })),
        cursor: "move",
        bound: single.type === "arrow" && !!single.endBinding,
      });
      // Midpoint handle for bending
      if (pts.length >= 3) {
        // Use the existing mid control point
        handles.push({
          id: "mid",
          pt: worldToScreen(localToWorld(single, { x: pts[1][0], y: pts[1][1] })),
          cursor: "move",
        });
      } else {
        // Show midpoint at center of the line
        const mx = (first[0] + last[0]) / 2;
        const my = (first[1] + last[1]) / 2;
        handles.push({
          id: "mid",
          pt: worldToScreen(localToWorld(single, { x: mx, y: my })),
          cursor: "move",
        });
      }
    } else {
      const w = single.width;
      const h = single.height;
      const cos = Math.cos(single.angle);
      const sin = Math.sin(single.angle);
      const cx = single.x + w / 2;
      const cy = single.y + h / 2;
      const local = (lx: number, ly: number) => {
        const dx = lx - w / 2;
        const dy = ly - h / 2;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        };
      };
      const layout: { id: HandleId; lx: number; ly: number; cursor: string }[] = [
        { id: "nw", lx: 0, ly: 0, cursor: "nwse-resize" },
        { id: "n", lx: w / 2, ly: 0, cursor: "ns-resize" },
        { id: "ne", lx: w, ly: 0, cursor: "nesw-resize" },
        { id: "e", lx: w, ly: h / 2, cursor: "ew-resize" },
        { id: "se", lx: w, ly: h, cursor: "nwse-resize" },
        { id: "s", lx: w / 2, ly: h, cursor: "ns-resize" },
        { id: "sw", lx: 0, ly: h, cursor: "nesw-resize" },
        { id: "w", lx: 0, ly: h / 2, cursor: "ew-resize" },
      ];
      for (const it of layout)
        handles.push({ id: it.id, pt: worldToScreen(local(it.lx, it.ly)), cursor: it.cursor });

      // Rotate handle positioned above top-center along the element's local orientation.
      const rotWorld = local(w / 2, -ROTATE_OFFSET / scale);
      const rotScreen = worldToScreen(rotWorld);
      handles.push({ id: "rot", pt: rotScreen, cursor: "grab" });
    }
  }

  // Connecting stem line from top-center to rotate handle
  const rotHandle = handles.find((h) => h.id === "rot");
  const nHandle = handles.find((h) => h.id === "n");

  // For lines/arrows: compute all control points projected to screen
  const isLinearType = single && (single.type === "line" || single.type === "arrow");
  const lineScreenPts = isLinearType
    ? single.points.map((pt) => worldToScreen(localToWorld(single, { x: pt[0], y: pt[1] })))
    : null;

  const outlineCorners =
    single && !isLinearType
      ? [
          { x: 0, y: 0 },
          { x: single.width, y: 0 },
          { x: single.width, y: single.height },
          { x: 0, y: single.height },
        ].map((p) => {
          const cx = single.x + single.width / 2;
          const cy = single.y + single.height / 2;
          const dx = p.x - single.width / 2;
          const dy = p.y - single.height / 2;
          const cos = Math.cos(single.angle);
          const sin = Math.sin(single.angle);
          return worldToScreen({
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos,
          });
        })
      : !single
        ? [
            { x: bbox.x, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y },
            { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
            { x: bbox.x, y: bbox.y + bbox.height },
          ].map(worldToScreen)
        : null;

  return (
    <svg
      ref={svgRef}
      role="group"
      aria-label="Selection controls"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {/* Stem line connecting top-center handle to rotate handle */}
      {nHandle && rotHandle && (
        <line
          x1={nHandle.pt.x}
          y1={nHandle.pt.y}
          x2={rotHandle.pt.x}
          y2={rotHandle.pt.y}
          stroke="#6366f1"
          strokeWidth={1.5}
        />
      )}
      {lineScreenPts ? (
        /* For lines/arrows: draw dashed guide polyline through all control points */
        <polyline
          points={lineScreenPts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="#6366f1"
          strokeWidth={1}
          strokeDasharray="4 3"
          strokeOpacity={0.5}
        />
      ) : outlineCorners ? (
        <polygon
          points={outlineCorners.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="rgba(99, 102, 241, 0.001)"
          stroke="#6366f1"
          strokeWidth={1.5}
          strokeDasharray="6 4"
          style={{
            pointerEvents: onDoubleClick ? "auto" : "none",
            cursor: onDoubleClick ? "pointer" : "default",
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick?.(e);
          }}
        />
      ) : null}
      {rotateDeg !== null && rotHandle && (
        <g
          transform={`translate(${rotHandle.pt.x}, ${rotHandle.pt.y - 24})`}
          style={{ pointerEvents: "none" }}
        >
          <rect
            x={-30}
            y={-14}
            width={60}
            height={28}
            rx={6}
            fill="#0f172a"
            stroke="#6366f1"
            strokeWidth={1.5}
            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.4))"
          />
          <text
            x={0}
            y={1}
            fill="#ffffff"
            fontSize={13}
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {rotateDeg}°
          </text>
        </g>
      )}
      {handles.map((h) => {
        const isLineHandle = h.id === "start" || h.id === "end";
        const isMidHandle = h.id === "mid";
        const isRotateHandle = h.id === "rot";
        const isCircle = isLineHandle || isMidHandle || isRotateHandle || h.bound;
        const r = isRotateHandle ? 6.5 : isLineHandle ? 7 : isMidHandle ? 5 : HANDLE / 2;
        return (
          <g
            key={h.id}
            transform={`translate(${h.pt.x}, ${h.pt.y})`}
            style={{
              pointerEvents: "auto",
              cursor: isRotateHandle ? (active === "rot" ? "grabbing" : "grab") : h.cursor,
            }}
          >
            <title>{handleLabel(h.id)}</title>
            {isRotateHandle ? (
              <g>
                <circle
                  cx={0}
                  cy={0}
                  r={6.5}
                  fill={active === "rot" ? "#4f46e5" : "#ffffff"}
                  stroke="#6366f1"
                  strokeWidth={2}
                  filter="drop-shadow(0 2px 5px rgba(0,0,0,0.22))"
                  onPointerDown={onPointerDown(h.id)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
                <circle
                  cx={0}
                  cy={0}
                  r={2}
                  fill={active === "rot" ? "#ffffff" : "#6366f1"}
                  pointerEvents="none"
                />
              </g>
            ) : isCircle ? (
              <circle
                cx={0}
                cy={0}
                r={r}
                fill={active === h.id ? "#4338ca" : isMidHandle ? "#c7d2fe" : "#fff"}
                stroke={h.bound ? "#22c55e" : "#6366f1"}
                strokeWidth={isLineHandle ? 2 : 1.5}
                onPointerDown={onPointerDown(h.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            ) : (
              <rect
                x={-HANDLE / 2}
                y={-HANDLE / 2}
                width={HANDLE}
                height={HANDLE}
                rx={2}
                fill={active === h.id ? "#4338ca" : "#fff"}
                stroke="#6366f1"
                strokeWidth={1.5}
                onPointerDown={onPointerDown(h.id)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function handleLabel(id: HandleId): string {
  const labels: Record<HandleId, string> = {
    nw: "resize top-left",
    n: "resize top",
    ne: "resize top-right",
    e: "resize right",
    se: "resize bottom-right",
    s: "resize bottom",
    sw: "resize bottom-left",
    w: "resize left",
    rot: "rotate",
    start: "arrow start point",
    end: "arrow end point",
    mid: "arrow midpoint",
  };
  return labels[id] ?? "resize handle";
}
