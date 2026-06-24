"use client";

/**
 * CanvasEditor — wires the engine store + tool gestures to the viewport.
 *
 * Day 4 scope: select+move + shape drag (rect/ellipse/diamond/line/arrow) + freedraw.
 * Day 5 additions: marquee selection, transformer (resize/rotate),
 * text tool with inline editor.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { unionBBox } from "@/lib/engine/bounds";
import {
  createArrow,
  createDiamond,
  createEllipse,
  createFreedraw,
  createHeart,
  createHexagon,
  createLine,
  createPlus,
  createRect,
  createStar,
  createText,
  createTriangle,
} from "@/lib/engine/factory";
import { pickIntersectRect, pickTopMost } from "@/lib/engine/hitTest";
import { getImageCache } from "@/lib/engine/imageCache";
import { type Guide, snapBBox } from "@/lib/engine/snap";
import { type Tool, useEngine } from "@/lib/engine/store";
import type { EngineElement, TextElement } from "@/lib/engine/types";
import BindingIndicators from "./BindingIndicators";
import CanvasRoot, {
  type CanvasRootHandle,
  type ViewTransform,
  type WorldPoint,
} from "./CanvasRoot";
import ContextMenu from "./ContextMenu";
import CropOverlay from "./CropOverlay";
import Guides from "./Guides";
import Marquee from "./Marquee";
import PropertiesPanel from "./PropertiesPanel";
import TextOverlay from "./TextOverlay";
import Transformer from "./Transformer";
import { usePasteDrop } from "./usePasteDrop";

const SNAP_THRESHOLD_PX = 6;

type DragState =
  | { kind: "draw"; start: WorldPoint }
  | {
      kind: "move";
      start: WorldPoint;
      ids: string[];
      origins: Map<string, { x: number; y: number }>;
    }
  | { kind: "freedraw"; points: Array<[number, number, number]> }
  | {
      kind: "marquee";
      startScreen: { x: number; y: number };
      startWorld: WorldPoint;
      additive: boolean;
    }
  | { kind: "erase" }
  | null;

export default function CanvasEditor() {
  const slide = useEngine((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
  const tool = useEngine((s) => s.tool);
  const selectedIds = useEngine((s) => s.selectedIds);
  const snapGrid = useEngine((s) => s.doc.snapGrid);
  const setTool = useEngine((s) => s.setTool);
  const croppingImageId = useEngine((s) => s.croppingImageId);
  const addElement = useEngine((s) => s.addElement);
  const updateElements = useEngine((s) => s.updateElements);
  const selectOnly = useEngine((s) => s.selectOnly);
  const clearSelection = useEngine((s) => s.clearSelection);
  const deleteElements = useEngine((s) => s.deleteElements);

  const rootRef = useRef<CanvasRootHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const [draft, setDraft] = useState<EngineElement | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<DragState>(null);
  const images = getImageCache();

  usePasteDrop(containerRef, (x, y) => rootRef.current?.clientToWorld(x, y) ?? { x: 0, y: 0 });

  const editingText: TextElement | null = useMemo(() => {
    if (!editingTextId || !slide) return null;
    const el = slide.elements.find((e) => e.id === editingTextId);
    return el && el.type === "text" ? el : null;
  }, [editingTextId, slide]);

  const onPointerDown = useCallback(
    (p: WorldPoint, e: React.PointerEvent) => {
      if (!slide) return;

      // Text tool: place a new text element and enter edit mode.
      if (tool === "text") {
        const el = createText({ x: p.x, y: p.y, text: "" });
        addElement(el, "add text");
        setEditingTextId(el.id);
        setTool("select");
        return;
      }

      if (tool === "select") {
        const hit = pickTopMost(p, slide.elements);
        if (hit) {
          // Expand to group members if clicked element is grouped.
          const groupIds = getSelectionWithGroup(
            hit,
            slide.elements,
            e.shiftKey ? "toggle" : "replace",
            selectedIds,
          );
          if (e.shiftKey) {
            for (const id of groupIds) useEngine.getState().toggleSelect(id);
          } else if (!Array.from(groupIds).every((id) => selectedIds.has(id))) {
            selectOnly(Array.from(groupIds));
          }
          // Double-click on text → edit.
          if (hit.type === "text" && (e as unknown as { detail?: number }).detail === 2) {
            setEditingTextId(hit.id);
            return;
          }
          // Double-click on shape → edit/create bound text.
          if (
            (hit.type === "rect" || hit.type === "ellipse" || hit.type === "diamond") &&
            (e as unknown as { detail?: number }).detail === 2
          ) {
            const boundText = slide.elements.find(
              (el) => el.type === "text" && (el as TextElement).containerId === hit.id,
            );
            if (boundText) {
              setEditingTextId(boundText.id);
            } else {
              const el = createText({ x: hit.x, y: hit.y, text: "" });
              el.width = hit.width;
              el.height = hit.height;
              el.containerId = hit.id;
              el.verticalAlign = "middle";
              el.textAlign = "center";
              addElement(el, "add bound text");
              setEditingTextId(el.id);
              setTool("select");
            }
            return;
          }
          const ids = Array.from(useEngine.getState().selectedIds);
          const origins = new Map<string, { x: number; y: number }>();
          for (const el of slide.elements) {
            if (ids.includes(el.id) && !el.locked) origins.set(el.id, { x: el.x, y: el.y });
          }
          dragRef.current = { kind: "move", start: p, ids, origins };
        } else {
          // Begin marquee.
          const screen = rootRef.current?.worldToScreen(p) ?? { x: 0, y: 0 };
          if (!e.shiftKey) clearSelection();
          dragRef.current = {
            kind: "marquee",
            startScreen: screen,
            startWorld: p,
            additive: e.shiftKey,
          };
        }
        return;
      }

      if (tool === "eraser") {
        const hit = pickTopMost(p, slide.elements);
        if (hit) deleteElements([hit.id]);
        dragRef.current = { kind: "erase" };
        return;
      }

      if (tool === "freedraw") {
        const points: Array<[number, number, number]> = [[p.x, p.y, 0.5]];
        dragRef.current = { kind: "freedraw", points };
        setDraft(createFreedraw(points));
        return;
      }

      // Shape-drag tools.
      dragRef.current = { kind: "draw", start: p };
      setDraft(makeDraftFor(tool, p, p));
    },
    [addElement, clearSelection, deleteElements, selectOnly, selectedIds, setTool, slide, tool],
  );

  const onPointerMove = useCallback(
    (p: WorldPoint, e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d || !slide) return;
      if (d.kind === "move") {
        let dx = p.x - d.start.x;
        let dy = p.y - d.start.y;
        // Snap union bbox of moving selection.
        const moving = slide.elements.filter((el) => d.origins.has(el.id));
        const others = slide.elements.filter((el) => !d.origins.has(el.id));
        const movedNow = moving.map((el) => {
          const o = d.origins.get(el.id)!;
          return { ...el, x: o.x + dx, y: o.y + dy } as EngineElement;
        });
        const bbox = unionBBox(movedNow);
        if (bbox) {
          if (snapGrid) {
            const targetX = Math.round(bbox.x / snapGrid) * snapGrid;
            const targetY = Math.round(bbox.y / snapGrid) * snapGrid;
            dx += targetX - bbox.x;
            dy += targetY - bbox.y;
            setGuides([]);
          } else {
            const snap = snapBBox(bbox, others, SNAP_THRESHOLD_PX / view.scale);
            dx += snap.dx;
            dy += snap.dy;
            setGuides(snap.guides);
          }
        }
        useEngine.setState((cur) => ({
          doc: {
            ...cur.doc,
            slides: cur.doc.slides.map((sl) =>
              sl.id !== cur.currentSlideId
                ? sl
                : {
                    ...sl,
                    elements: sl.elements.map((el) => {
                      const o = d.origins.get(el.id);
                      return o ? ({ ...el, x: o.x + dx, y: o.y + dy } as EngineElement) : el;
                    }),
                  },
            ),
          },
        }));
        return;
      }
      if (d.kind === "freedraw") {
        d.points.push([p.x, p.y, 0.5]);
        setDraft(createFreedraw(d.points));
        return;
      }
      if (d.kind === "marquee") {
        const cur = rootRef.current?.worldToScreen(p) ?? { x: 0, y: 0 };
        setMarqueeRect({
          x: Math.min(d.startScreen.x, cur.x),
          y: Math.min(d.startScreen.y, cur.y),
          width: Math.abs(cur.x - d.startScreen.x),
          height: Math.abs(cur.y - d.startScreen.y),
        });
        return;
      }
      if (d.kind === "erase") {
        const hit = pickTopMost(p, slide.elements);
        if (hit) deleteElements([hit.id]);
        return;
      }
      // draw
      setDraft(makeDraftFor(tool, d.start, p));
    },
    [deleteElements, slide, snapGrid, tool, view.scale],
  );

  const onPointerUp = useCallback(
    (p: WorldPoint) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      if (d.kind === "move") {
        setGuides([]);
        const ids = d.ids;
        const slideNow = useEngine
          .getState()
          .doc.slides.find((sl) => sl.id === useEngine.getState().currentSlideId);
        if (!slideNow) return;
        const patches = ids
          .map((id) => slideNow.elements.find((el) => el.id === id))
          .filter((el): el is EngineElement => Boolean(el))
          .map((el) => ({ id: el.id, patch: { x: el.x, y: el.y } }));
        if (patches.length) updateElements(patches, "move");
        return;
      }
      if (d.kind === "freedraw") {
        if (d.points.length >= 2) addElement(createFreedraw(d.points), "draw");
        setDraft(null);
        setTool("select");
        return;
      }
      if (d.kind === "marquee") {
        if (slide) {
          const minX = Math.min(d.startWorld.x, p.x);
          const minY = Math.min(d.startWorld.y, p.y);
          const w = Math.abs(p.x - d.startWorld.x);
          const h = Math.abs(p.y - d.startWorld.y);
          const inside = pickIntersectRect(
            { x: minX, y: minY, width: w, height: h },
            slide.elements.filter((el) => !el.locked),
          );
          const ids = inside.map((el) => el.id);
          if (d.additive) {
            const merged = new Set(useEngine.getState().selectedIds);
            for (const id of ids) merged.add(id);
            selectOnly(Array.from(merged));
          } else {
            selectOnly(ids);
          }
        }
        setMarqueeRect(null);
        return;
      }
      // draw commit
      if (d.kind !== "draw") return;
      const el = makeDraftFor(tool, d.start, p);
      if (tool === "arrow" && el && slide) {
        const startHit = pickTopMost(
          d.start,
          slide.elements.filter((e) => !e.isDeleted),
        );
        const endHit = pickTopMost(
          p,
          slide.elements.filter((e) => !e.isDeleted),
        );
        if (
          startHit &&
          (startHit.type === "rect" || startHit.type === "ellipse" || startHit.type === "diamond")
        ) {
          (el as import("@/lib/engine/types").ArrowElement).startBinding = {
            elementId: startHit.id,
            gap: 12,
            focus: 0.5,
          };
        }
        if (
          endHit &&
          (endHit.type === "rect" || endHit.type === "ellipse" || endHit.type === "diamond")
        ) {
          (el as import("@/lib/engine/types").ArrowElement).endBinding = {
            elementId: endHit.id,
            gap: 12,
            focus: 0.5,
          };
        }
      }

      setDraft(null);
      if (el && el.width >= 4 && el.height >= 4) {
        if (el.type === "frame" && slide) {
          const frameRect = { x: el.x, y: el.y, width: el.width, height: el.height };
          const inside = slide.elements.filter(
            (e) =>
              !e.isDeleted &&
              e.type !== "frame" &&
              e.x >= frameRect.x &&
              e.y >= frameRect.y &&
              e.x + e.width <= frameRect.x + frameRect.width &&
              e.y + e.height <= frameRect.y + frameRect.height,
          );
          (el as import("@/lib/engine/types").FrameElement).childIds = inside.map((e) => e.id);
        }
        addElement(el, "draw");
        setTool("select");
      }
    },
    [addElement, selectOnly, setTool, slide, tool, updateElements],
  );

  if (!slide) return null;

  // Hide the text element from canvas while editing (overlay shows it instead).
  const slideForRender = editingText
    ? {
        ...slide,
        elements: slide.elements.map((el) =>
          el.id === editingText.id ? { ...el, isDeleted: true } : el,
        ),
      }
    : slide;

  const croppingImage = slide.elements.find(
    (el) => el.id === croppingImageId && el.type === "image",
  ) as import("@/lib/engine/types").ImageElement | undefined;

  // Skip transformer while editing text or cropping
  const showTransformer = !editingText && !croppingImage && selectedIds.size > 0;

  const editingScreenPos =
    editingText && rootRef.current
      ? rootRef.current.worldToScreen({ x: editingText.x, y: editingText.y })
      : null;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0 }}
      onContextMenu={(e) => {
        e.preventDefault();
        // If right-clicking on a non-selected element, select it first.
        const world = rootRef.current?.clientToWorld(e.clientX, e.clientY);
        if (world && slide) {
          const hit = pickTopMost(world, slide.elements);
          if (hit && !selectedIds.has(hit.id)) {
            selectOnly([hit.id]);
          } else if (!hit && selectedIds.size > 0 && !e.shiftKey) {
            // right-click on empty: keep selection so paste etc. is sensible.
          }
        }
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <CanvasRoot
        ref={rootRef}
        slide={slideForRender}
        draftElement={draft}
        images={images}
        snapGrid={snapGrid}
        selectedIds={editingText ? new Set() : selectedIds}
        handActive={tool === "hand"}
        toolCursor={toolToCursor(tool)}
        onPointerDownWorld={onPointerDown}
        onPointerMoveWorld={onPointerMove}
        onPointerUpWorld={onPointerUp}
        onViewChange={setView}
      >
        <Marquee rect={marqueeRect} />
        <Guides
          guides={guides}
          worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        />
        <BindingIndicators
          selectedIds={selectedIds}
          elements={slide.elements}
          worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        />
        {showTransformer && (
          <Transformer
            worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
            scale={view.scale}
            onGuidesChange={setGuides}
          />
        )}
        {editingText && editingScreenPos && (
          <TextOverlay
            element={editingText}
            screen={editingScreenPos}
            scale={view.scale}
            onCommit={() => setEditingTextId(null)}
          />
        )}
        {croppingImage && (
          <CropOverlay
            element={croppingImage}
            worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
            scale={view.scale}
          />
        )}
      </CanvasRoot>
      <PropertiesPanel
        worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        scale={view.scale}
      />
      {ctxMenu && <ContextMenu position={ctxMenu} onClose={() => setCtxMenu(null)} />}
    </div>
  );
}

function makeDraftFor(tool: Tool, a: WorldPoint, b: WorldPoint): EngineElement | null {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  switch (tool) {
    case "rect":
      return createRect({ x, y, width: w, height: h });
    case "ellipse":
      return createEllipse({ x, y, width: w, height: h });
    case "diamond":
      return createDiamond({ x, y, width: w, height: h });
    case "triangle":
      return createTriangle({ x, y, width: w, height: h });
    case "star":
      return createStar({ x, y, width: w, height: h });
    case "hexagon":
      return createHexagon({ x, y, width: w, height: h });
    case "heart":
      return createHeart({ x, y, width: w, height: h });
    case "plus":
      return createPlus({ x, y, width: w, height: h });
    case "line":
      return createLine([a.x, a.y], [b.x, b.y]);
    case "arrow":
      return createArrow([a.x, a.y], [b.x, b.y]);
    case "frame":
      return {
        ...createRect({ x, y, width: w, height: h }),
        type: "frame",
        name: "Frame",
        childIds: [],
      } as import("@/lib/engine/types").FrameElement;
    default:
      return null;
  }
}

function toolToCursor(tool: Tool): string {
  switch (tool) {
    case "hand":
      return "grab";
    case "text":
      return "text";
    case "eraser":
      return "cell";
    case "rect":
    case "ellipse":
    case "diamond":
    case "line":
    case "arrow":
    case "freedraw":
    case "frame":
      return "crosshair";
    default:
      return "default";
  }
}

/** Given a clicked element, expand to all elements sharing the same innermost group. */
function getSelectionWithGroup(
  hit: EngineElement,
  elements: EngineElement[],
  mode: "replace" | "toggle",
  currentSelected: Set<string>,
): Set<string> {
  const innermost = hit.groupIds[hit.groupIds.length - 1];
  let members = innermost
    ? elements.filter((el) => el.groupIds.includes(innermost)).map((el) => el.id)
    : [hit.id];

  if (hit.type === "frame") {
    const frame = hit as import("@/lib/engine/types").FrameElement;
    members = Array.from(new Set([...members, ...frame.childIds]));
  }

  if (mode === "toggle") {
    const next = new Set(currentSelected);
    const allSelected = members.every((id) => next.has(id));
    if (allSelected) {
      for (const id of members) next.delete(id);
    } else {
      for (const id of members) next.add(id);
    }
    return next;
  }
  return new Set(members);
}
