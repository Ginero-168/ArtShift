"use client";

/**
 * CanvasEditor — wires the engine store + tool gestures to the viewport.
 *
 * Day 4 scope: select+move + shape drag (rect/ellipse/diamond/line/arrow) + freedraw.
 * Day 5 additions: marquee selection, transformer (resize/rotate),
 * text tool with inline editor.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconWand } from "@/components/icons";
import { createEditorController } from "@/lib/engine/editorController";
import {
  createDiamond,
  createEllipse,
  createFreedraw,
  createHeart,
  createHexagon,
  createPlus,
  createRect,
  createStar,
  createText,
  createTriangle,
  createVectorPath,
  createVectorPathFromWorldNodes,
} from "@/lib/engine/factory";
import {
  calculateMovePreview,
  isMeaningfulMove,
  resolveMarqueeSelection,
  resolveObjectPointerSelection,
} from "@/lib/engine/gestureController";
import { pickIntersectRect, pickTopMost } from "@/lib/engine/hitTest";
import { getImageCache } from "@/lib/engine/imageCache";
import {
  getInteractiveElements,
  getLayerForObject,
  isObjectBlock,
  isObjectLocked,
} from "@/lib/engine/layers";
import { isSelectionModifierPressed } from "@/lib/engine/selection";
import { constrainShapeDrag } from "@/lib/engine/shapeDrag";
import type { Guide } from "@/lib/engine/snap";
import {
  cloneElementsForDuplicate,
  type LineSubtype,
  type Tool,
  useEngine,
} from "@/lib/engine/store";
import {
  isRasterBrushCursorTool,
  isRasterPaintTool,
  isRasterRetouchTool,
  isRasterSelectionTool,
  pointerPressure,
  toolToCursor,
} from "@/lib/engine/toolBehavior";
import type {
  EngineElement,
  EngineSlide,
  TextElement,
  VectorPathElement,
} from "@/lib/engine/types";
import { convertElementToVectorPath } from "@/lib/engine/vectorPath";
import { magicWandMaskToDataUrl, type RasterPixelData } from "@/lib/raster/magicWand";
import { createRasterStroke } from "@/lib/raster/mask";
import { getRasterProcessor } from "@/lib/raster/processorFactory";
import { createRasterRetouchEdit } from "@/lib/raster/retouch";
import {
  appendRasterPolygonPoint,
  canCommitRasterPolygon,
  createRasterSelectionOperation,
  type RasterSelection,
  type RasterSelectionMode,
  type RasterSelectionShape,
  selectionModeFromModifiers,
} from "@/lib/raster/selection";
import {
  createMagicWandSelectionShape,
  createMagicWandSelectionShapeAsync,
  createRasterSelectionSample,
  quickSelectionMaskForPointAsync,
  rasterToolToShape,
  selectionShapeFromPoints,
  worldToImageLocal,
} from "@/lib/raster/selectionInteraction";
import BindingIndicators from "./BindingIndicators";
import CanvasRoot, {
  type CanvasRootHandle,
  type ViewTransform,
  type WorldPoint,
} from "./CanvasRoot";
import ContextMenu from "./ContextMenu";
import CropOverlay from "./CropOverlay";
import FrameEditOverlay from "./FrameEditOverlay";
import Guides from "./Guides";
import Marquee from "./Marquee";
import PathNodeOverlay from "./PathNodeOverlay";
import PenLiveOverlay from "./PenLiveOverlay";
import RasterPerformanceOverlay from "./RasterPerformanceOverlay";
import RasterSelectionOverlay from "./RasterSelectionOverlay";
import SafeAreaOverlay, { type SafeAreaMode } from "./SafeAreaOverlay";
import TextOverlay from "./TextOverlay";
import Transformer from "./Transformer";
import { usePasteDrop } from "./usePasteDrop";

const POINTER_MOVE_THRESHOLD_PX = 3;

type DragState =
  | { kind: "draw"; start: WorldPoint }
  | {
      kind: "move";
      start: WorldPoint;
      ids: string[];
      origins: Map<string, { x: number; y: number }>;
      checkpointed: boolean;
      altKey?: boolean;
      duplicated?: boolean;
      clickSelection?: string[];
    }
  | { kind: "freedraw"; points: Array<[number, number, number]> }
  | {
      kind: "marquee";
      startScreen: { x: number; y: number };
      startWorld: WorldPoint;
      additive: boolean;
    }
  | { kind: "erase" }
  | {
      kind: "rasterPaint";
      elementId: string;
      localPoints: Array<[number, number]>;
      worldPoints: WorldPoint[];
      pressures: number[];
      mode: "erase" | "paint";
      size: number;
      opacity: number;
      hardness: number;
      color: string;
      selection?: RasterSelection;
      selectionMaskDataUrl?: string;
    }
  | {
      kind: "rasterRetouch";
      elementId: string;
      mode: "heal" | "clone";
      localPoints: Array<[number, number]>;
      worldPoints: WorldPoint[];
      sourcePoint?: [number, number];
      size: number;
      opacity: number;
      selection?: RasterSelection;
    }
  | {
      kind: "rasterSelection";
      elementId: string;
      shape: "rect" | "ellipse" | "lasso" | "polygon";
      startLocal: [number, number];
      localPoints: Array<[number, number]>;
      mode: RasterSelectionMode;
    }
  | {
      kind: "rasterQuickSelection";
      elementId: string;
      imageData: RasterPixelData;
      mask: Uint8Array;
      mode: RasterSelectionMode;
      tolerance: number;
      brushSize: number;
      lastLocal?: [number, number];
      pending: boolean;
      generation: number;
      finishOnComplete?: boolean;
    }
  | null;

type QuickSelectionDrag = Extract<DragState, { kind: "rasterQuickSelection" }>;

export type CanvasEditorHandle = {
  resetView: () => void;
  getView: () => ViewTransform;
  setView: (v: ViewTransform) => void;
  setZoom: (scale: number) => void;
};

export type CanvasEditorProps = {
  onViewChange?: (view: ViewTransform) => void;
};

const CanvasEditor = forwardRef<CanvasEditorHandle, CanvasEditorProps>(function CanvasEditor(
  { onViewChange },
  ref,
) {
  const rawSlide = useEngine((s) => s.doc.slides.find((sl) => sl.id === s.currentSlideId));
  const tool = useEngine((s) => s.tool);
  const selectedIds = useEngine((s) => s.selectedIds);
  const activeLayerId = useEngine((s) => s.activeLayerId);
  const snapGrid = useEngine((s) => s.doc.snapGrid);
  const showHexGrid = useEngine((s) => s.showHexGrid);
  const layerFilter = useEngine((s) => s.layerFilter);
  const lineSubtype = useEngine((s) => s.lineSubtype);
  const setTool = useEngine((s) => s.setTool);
  const croppingImageId = useEngine((s) => s.croppingImageId);
  const setCroppingImageId = useEngine((s) => s.setCroppingImageId);
  const addElement = useEngine((s) => s.addElement);
  const checkpointInteraction = useEngine((s) => s.checkpointInteraction);
  const previewElements = useEngine((s) => s.previewElements);
  const commitInteraction = useEngine((s) => s.commitInteraction);
  const commitBlockLayout = useEngine((s) => s.commitBlockLayout);
  const selectOnly = useEngine((s) => s.selectOnly);
  const clearSelection = useEngine((s) => s.clearSelection);
  const deleteElements = useEngine((s) => s.deleteElements);
  const addElements = useEngine((s) => s.addElements);
  const applyRasterSelection = useEngine((s) => s.applyRasterSelection);
  const updateElements = useEngine((s) => s.updateElements);
  const currentSlide = useEngine((s) => s.currentSlide);
  const rasterBrushSize = useEngine((s) => s.rasterBrushSize);
  const rasterBrushOpacity = useEngine((s) => s.rasterBrushOpacity);
  const rasterBrushHardness = useEngine((s) => s.rasterBrushHardness);
  const rasterBrushColor = useEngine((s) => s.rasterBrushColor);
  const rasterMagicWandTolerance = useEngine((s) => s.rasterMagicWandTolerance);
  const rasterQuickSelectionSize = useEngine((s) => s.rasterQuickSelectionSize);
  const rasterExecutionMode = useEngine((s) => s.rasterExecutionMode);
  const activeRasterSelection = useEngine((s) => s.activeRasterSelection);
  const rasterProcessor = useMemo(
    () => getRasterProcessor(rasterExecutionMode),
    [rasterExecutionMode],
  );
  const editorController = useMemo(
    () =>
      createEditorController({
        currentSlide,
        updateElements,
        applyRasterSelection,
      }),
    [applyRasterSelection, currentSlide, updateElements],
  );

  const commitQuickSelection = useCallback(
    (drag: QuickSelectionDrag) => {
      const state = useEngine.getState();
      const activeSlide = state.doc.slides.find(
        (candidate) => candidate.id === state.currentSlideId,
      );
      const image = activeSlide?.elements.find(
        (element): element is import("@/lib/engine/types").ImageElement =>
          element.id === drag.elementId && element.type === "image",
      );
      if (image && drag.mask.some((value) => value !== 0)) {
        const shape: RasterSelectionShape = {
          kind: "bitmap",
          dataUrl: magicWandMaskToDataUrl(drag.mask, drag.imageData.width, drag.imageData.height),
        };
        editorController.commitRasterSelection(
          image.id,
          createRasterSelectionOperation(drag.mode, shape),
        );
      }
      setRasterSelectionDraft(null);
    },
    [editorController],
  );

  // Filter the slide elements by layerFilter ("all" | "block" | "free")
  const slide = useMemo(() => {
    if (!rawSlide) return undefined;
    if (layerFilter === "all") return rawSlide;
    const filteredElements = rawSlide.elements.filter((el) => {
      const isBlock = isObjectBlock(rawSlide, el.id);
      return layerFilter === "block" ? isBlock : !isBlock;
    });
    return {
      ...rawSlide,
      elements: filteredElements,
    };
  }, [rawSlide, layerFilter]);

  const rootRef = useRef<CanvasRootHandle | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const [draft, setDraft] = useState<EngineElement | null>(null);
  const [rasterBrushDraft, setRasterBrushDraft] = useState<{
    elementId: string;
    points: WorldPoint[];
    pressures: number[];
    size: number;
    opacity: number;
    hardness: number;
    color: string;
    mode: "erase" | "paint";
  } | null>(null);
  const [rasterSelectionDraft, setRasterSelectionDraft] = useState<{
    elementId: string;
    shape: RasterSelectionShape;
    mode: RasterSelectionMode;
  } | null>(null);
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [penNodes, setPenNodes] = useState<
    Array<{ x: number; y: number; in?: [number, number]; out?: [number, number] }>
  >([]);
  const [penHoverFirst, setPenHoverFirst] = useState(false);
  const penDraggingRef = useRef<{ start: WorldPoint; nodeIndex: number } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [safeAreaMode, setSafeAreaMode] = useState<SafeAreaMode>("none");
  const dragRef = useRef<DragState>(null);
  const quickSelectionRequestRef = useRef(0);
  const quickSelectionAbortRef = useRef<AbortController | null>(null);
  const rasterSelectionRequestRef = useRef(0);
  const rasterBrushCursorRef = useRef<HTMLDivElement | null>(null);
  const magicWandCursorRef = useRef<HTMLDivElement | null>(null);
  const rasterCloneSourcesRef = useRef(new Map<string, [number, number]>());
  const images = getImageCache();

  const moveRasterBrushCursor = useCallback((point: { x: number; y: number }) => {
    const cursor = rasterBrushCursorRef.current;
    if (cursor) {
      cursor.style.setProperty("--brush-cursor-x", `${point.x}px`);
      cursor.style.setProperty("--brush-cursor-y", `${point.y}px`);
      cursor.style.setProperty("--brush-cursor-opacity", "1");
    }
    const wandCursor = magicWandCursorRef.current;
    if (wandCursor) {
      wandCursor.style.setProperty("--magic-cursor-x", `${point.x}px`);
      wandCursor.style.setProperty("--magic-cursor-y", `${point.y}px`);
      wandCursor.style.setProperty("--magic-cursor-opacity", "1");
    }
  }, []);

  const hideRasterBrushCursor = useCallback(() => {
    if (rasterBrushCursorRef.current) {
      rasterBrushCursorRef.current.style.setProperty("--brush-cursor-opacity", "0");
    }
    if (magicWandCursorRef.current) {
      magicWandCursorRef.current.style.setProperty("--magic-cursor-opacity", "0");
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      resetView: () => rootRef.current?.resetView(),
      getView: () => rootRef.current?.getView() ?? { scale: 1, tx: 0, ty: 0 },
      setView: (v) => rootRef.current?.setView(v),
      setZoom: (s) => rootRef.current?.setZoom(s),
    }),
    [],
  );

  const handleViewChange = useCallback(
    (nextView: ViewTransform) => {
      setView(nextView);
      onViewChange?.(nextView);
    },
    [onViewChange],
  );

  useEffect(() => {
    if (tool !== "rasterQuickSelection") {
      quickSelectionAbortRef.current?.abort();
      quickSelectionAbortRef.current = null;
      quickSelectionRequestRef.current += 1;
    }
    if (tool === "pen") return;
    setPenNodes([]);
    setDraft(null);
    if (!isRasterPaintTool(tool)) {
      setRasterBrushDraft(null);
      if (dragRef.current?.kind === "rasterPaint") dragRef.current = null;
    }
    if (!isRasterSelectionTool(tool)) {
      setRasterSelectionDraft(null);
      if (
        dragRef.current?.kind === "rasterSelection" ||
        dragRef.current?.kind === "rasterQuickSelection"
      ) {
        dragRef.current = null;
      }
    }
  }, [tool]);

  useEffect(() => {
    return () => quickSelectionAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (tool !== "directSelect") {
      setEditingPathId(null);
    }
  }, [tool]);

  useEffect(() => {
    if (tool !== "pen") return;
    function finishPath(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPenNodes([]);
        setDraft(null);
      } else if (event.key === "Enter" && penNodes.length >= 2) {
        const pathEl = createVectorPathFromWorldNodes(penNodes, event.shiftKey);
        addElement(pathEl, "draw vector path");
        setPenNodes([]);
        setDraft(null);
        setTool("select");
        setEditingPathId(null);
        selectOnly([pathEl.id]);
      }
    }
    window.addEventListener("keydown", finishPath);
    return () => window.removeEventListener("keydown", finishPath);
  }, [addElement, penNodes, selectOnly, setTool, tool]);

  useEffect(() => {
    if (tool !== "rasterPolygonLasso") return;

    function finishPolygon(event: KeyboardEvent) {
      const current = dragRef.current;
      if (current?.kind !== "rasterSelection" || current.shape !== "polygon") return;

      if (event.key === "Escape") {
        dragRef.current = null;
        setRasterSelectionDraft(null);
        return;
      }

      if (event.key !== "Enter" || !canCommitRasterPolygon(current.localPoints)) return;
      const slideNow = currentSlide();
      const image = slideNow?.elements.find(
        (element): element is import("@/lib/engine/types").ImageElement =>
          element.id === current.elementId && element.type === "image",
      );
      if (!image) return;

      const shape = selectionShapeFromPoints(
        "polygon",
        current.localPoints,
        image.width,
        image.height,
      );
      editorController.commitRasterSelection(
        image.id,
        createRasterSelectionOperation(current.mode, shape),
      );
      dragRef.current = null;
      setRasterSelectionDraft(null);
      selectOnly([image.id]);
    }

    window.addEventListener("keydown", finishPolygon);
    return () => window.removeEventListener("keydown", finishPolygon);
  }, [currentSlide, editorController, selectOnly, tool]);

  usePasteDrop(containerRef, (x, y) => rootRef.current?.clientToWorld(x, y) ?? { x: 0, y: 0 });

  const editingText: TextElement | null = useMemo(() => {
    if (!editingTextId || !slide) return null;
    const el = slide.elements.find((e) => e.id === editingTextId);
    return el && el.type === "text" ? el : null;
  }, [editingTextId, slide]);

  const onPointerDown = useCallback(
    (p: WorldPoint, e: React.PointerEvent) => {
      if (ctxMenu) {
        setCtxMenu(null);
      }
      if (!slide) return;

      // Text tool: place a new text element and enter edit mode.
      if (tool === "text") {
        const el = createText({ x: p.x, y: p.y, text: "" });
        addElement(el, "add text");
        setEditingTextId(el.id);
        setTool("select");
        return;
      }

      if (tool === "pen") {
        if (
          penNodes.length >= 2 &&
          Math.hypot(penNodes[0].x - p.x, penNodes[0].y - p.y) < 16 / view.scale
        ) {
          // Click on first anchor closes the path
          const pathEl = createVectorPathFromWorldNodes(penNodes, true);
          addElement(pathEl, "draw vector path");
          setPenNodes([]);
          setDraft(null);
          setTool("select");
          setEditingPathId(null);
          selectOnly([pathEl.id]);
          return;
        }

        if (e.detail >= 2 && penNodes.length >= 2) {
          // Double-click finishes open path
          const pathEl = createVectorPathFromWorldNodes(penNodes, false);
          addElement(pathEl, "draw vector path");
          setPenNodes([]);
          setDraft(null);
          setTool("select");
          setEditingPathId(null);
          selectOnly([pathEl.id]);
          return;
        }

        const nextNodes = [...penNodes, { x: p.x, y: p.y }];
        setPenNodes(nextNodes);
        penDraggingRef.current = { start: p, nodeIndex: nextNodes.length - 1 };
        if (nextNodes.length > 1) {
          setDraft(createVectorPathFromWorldNodes(nextNodes, false));
        }
        return;
      }

      if (tool === "directSelect") {
        const hit = pickTopMost(p, slide);
        if (hit) {
          if (hit.type !== "path") {
            const converted = convertElementToVectorPath(hit);
            if (converted) {
              useEngine
                .getState()
                .updateElements([{ id: hit.id, patch: converted }], "convert to editable path");
            }
          }
          selectOnly([hit.id]);
          setEditingPathId(hit.id);
        } else if (!e.shiftKey) {
          setEditingPathId(null);
          clearSelection();
        }
        return;
      }

      if (tool === "select" || tool === "rasterMove") {
        const hit = pickTopMost(p, slide);
        if (hit) {
          const groupIds = getSelectionMembers(hit, slide);
          const resolution = resolveObjectPointerSelection(selectedIds, hit.id, groupIds, e);
          if (!resolution.clickSelection) selectOnly(resolution.ids);
          const ids = resolution.ids;
          const origins = new Map<string, { x: number; y: number }>();
          for (const el of slide.elements) {
            if (ids.includes(el.id) && !isObjectLocked(slide, el.id)) {
              origins.set(el.id, { x: el.x, y: el.y });
            }
          }
          dragRef.current = {
            kind: "move",
            start: p,
            ids,
            origins,
            checkpointed: false,
            altKey: e.altKey,
            duplicated: false,
            clickSelection: resolution.clickSelection,
          };
        } else {
          // Begin marquee for both Vector Select and Raster Move.
          const screen = rootRef.current?.worldToScreen(p) ?? { x: 0, y: 0 };
          const additive = isSelectionModifierPressed(e);
          if (!additive) clearSelection();
          dragRef.current = {
            kind: "marquee",
            startScreen: screen,
            startWorld: p,
            additive,
          };
        }
        return;
      }

      if (tool === "eraser") {
        const hit = pickTopMost(p, slide);
        if (hit) deleteElements([hit.id]);
        dragRef.current = { kind: "erase" };
        return;
      }

      if (isRasterPaintTool(tool)) {
        const hit = pickTopMost(p, slide);
        if (hit?.type !== "image") return;
        selectOnly([hit.id]);
        const local = worldToImageLocal(p, hit);
        const isPencil = tool === "rasterPencil";
        const isEraser = tool === "rasterEraser";
        const pressure = pointerPressure(e);
        dragRef.current = {
          kind: "rasterPaint",
          elementId: hit.id,
          localPoints: [local],
          worldPoints: [p],
          pressures: [pressure],
          mode: isEraser ? "erase" : "paint",
          size: rasterBrushSize,
          opacity: rasterBrushOpacity,
          hardness: isPencil ? 1 : rasterBrushHardness,
          color: rasterBrushColor,
          selection: editorController.selectionForImage(activeRasterSelection, hit.id),
        };
        setRasterBrushDraft({
          elementId: hit.id,
          points: [p],
          pressures: [pressure],
          size: rasterBrushSize,
          opacity: rasterBrushOpacity,
          hardness: isPencil ? 1 : rasterBrushHardness,
          color: rasterBrushColor,
          mode: isEraser ? "erase" : "paint",
        });
        return;
      }

      if (isRasterRetouchTool(tool)) {
        const hit = pickTopMost(p, slide);
        if (hit?.type !== "image") return;
        selectOnly([hit.id]);
        const local = worldToImageLocal(p, hit);
        if (tool === "rasterClone" && e.altKey) {
          rasterCloneSourcesRef.current.set(hit.id, local);
          return;
        }
        const mode = tool === "rasterHealing" ? "heal" : "clone";
        dragRef.current = {
          kind: "rasterRetouch",
          elementId: hit.id,
          mode,
          localPoints: [local],
          worldPoints: [p],
          sourcePoint: rasterCloneSourcesRef.current.get(hit.id),
          size: rasterBrushSize,
          opacity: rasterBrushOpacity,
          selection: editorController.selectionForImage(activeRasterSelection, hit.id),
        };
        setRasterBrushDraft({
          elementId: hit.id,
          points: [p],
          pressures: [1],
          size: rasterBrushSize,
          opacity: rasterBrushOpacity,
          hardness: rasterBrushHardness,
          color: "#64748b",
          mode: "paint",
        });
        return;
      }

      if (tool === "rasterMagicWand") {
        const hit = pickTopMost(p, slide);
        if (hit?.type !== "image") return;
        const local = worldToImageLocal(p, hit);
        const mode = selectionModeFromModifiers(e);
        const requestId = ++rasterSelectionRequestRef.current;
        const applyShape = (shape: RasterSelectionShape | null) => {
          if (
            !shape ||
            requestId !== rasterSelectionRequestRef.current ||
            useEngine.getState().tool !== "rasterMagicWand"
          ) {
            return;
          }
          editorController.commitRasterSelection(
            hit.id,
            createRasterSelectionOperation(mode, shape),
          );
          selectOnly([hit.id]);
        };
        const sample = createRasterSelectionSample(hit, images);
        if (sample && sample.width * sample.height >= 250_000) {
          void createMagicWandSelectionShapeAsync(
            hit,
            local,
            rasterMagicWandTolerance,
            images,
            rasterProcessor,
          ).then(applyShape);
          return;
        }
        applyShape(createMagicWandSelectionShape(hit, local, rasterMagicWandTolerance, images));
        return;
      }

      if (tool === "rasterQuickSelection") {
        const hit = pickTopMost(p, slide);
        if (hit?.type !== "image") return;
        const imageData = createRasterSelectionSample(hit, images);
        if (!imageData) return;
        const local = worldToImageLocal(p, hit);
        const mode = selectionModeFromModifiers(e);
        quickSelectionAbortRef.current?.abort();
        const abortController = new AbortController();
        quickSelectionAbortRef.current = abortController;
        const drag: QuickSelectionDrag = {
          kind: "rasterQuickSelection",
          elementId: hit.id,
          imageData,
          mask: new Uint8Array(imageData.width * imageData.height),
          mode,
          tolerance: rasterMagicWandTolerance,
          brushSize: rasterQuickSelectionSize,
          lastLocal: local,
          pending: true,
          generation: 0,
        };
        dragRef.current = drag;
        setRasterSelectionDraft({
          elementId: hit.id,
          shape: {
            kind: "bitmap",
            dataUrl: magicWandMaskToDataUrl(drag.mask, imageData.width, imageData.height),
          },
          mode,
        });
        selectOnly([hit.id]);
        const requestId = ++quickSelectionRequestRef.current;
        void quickSelectionMaskForPointAsync(
          imageData,
          hit,
          local,
          drag.brushSize,
          drag.tolerance,
          abortController.signal,
          rasterProcessor,
        )
          .then((stamp) => {
            const current = dragRef.current;
            if (
              current !== drag ||
              current.kind !== "rasterQuickSelection" ||
              current.generation !== drag.generation ||
              quickSelectionRequestRef.current !== requestId
            ) {
              return;
            }
            for (let i = 0; i < current.mask.length; i++) {
              if (stamp[i]) current.mask[i] = 1;
            }
            current.pending = false;
            setRasterSelectionDraft({
              elementId: current.elementId,
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
              commitQuickSelection(current);
            }
          })
          .catch(() => {
            const current = dragRef.current;
            if (current === drag && current.kind === "rasterQuickSelection") {
              current.pending = false;
              if (current.finishOnComplete) {
                dragRef.current = null;
                setRasterSelectionDraft(null);
              }
            }
          });
        return;
      }

      if (isRasterSelectionTool(tool)) {
        const hit = pickTopMost(p, slide);
        if (hit?.type !== "image") return;
        const local = worldToImageLocal(p, hit);
        const shape = rasterToolToShape(tool);

        if (
          shape === "polygon" &&
          dragRef.current?.kind === "rasterSelection" &&
          dragRef.current.shape === "polygon" &&
          dragRef.current.elementId === hit.id
        ) {
          const nextPoints = appendRasterPolygonPoint(dragRef.current.localPoints, local);
          dragRef.current = { ...dragRef.current, localPoints: nextPoints };
          setRasterSelectionDraft({
            elementId: hit.id,
            shape: selectionShapeFromPoints(shape, nextPoints, hit.width, hit.height),
            mode: dragRef.current.mode,
          });
          return;
        }

        selectOnly([hit.id]);
        const mode = selectionModeFromModifiers(e);
        dragRef.current = {
          kind: "rasterSelection",
          elementId: hit.id,
          shape,
          startLocal: local,
          localPoints: [local],
          mode,
        };
        setRasterSelectionDraft({
          elementId: hit.id,
          shape: selectionShapeFromPoints(shape, [local, local], hit.width, hit.height),
          mode,
        });
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
      setDraft(makeDraftFor(tool, p, p, lineSubtype, e.shiftKey));
    },
    [
      addElement,
      clearSelection,
      ctxMenu,
      deleteElements,
      lineSubtype,
      images,
      penNodes,
      selectOnly,
      selectedIds,
      rasterBrushColor,
      rasterBrushHardness,
      rasterBrushOpacity,
      rasterBrushSize,
      rasterMagicWandTolerance,
      rasterQuickSelectionSize,
      rasterProcessor,
      activeRasterSelection,
      commitQuickSelection,
      editorController,
      setTool,
      slide,
      tool,
      view.scale,
    ],
  );

  const onDoubleClickWorld = useCallback(
    (p: WorldPoint) => {
      if (!slide) return;

      const polygon = dragRef.current;
      if (
        tool === "rasterPolygonLasso" &&
        polygon?.kind === "rasterSelection" &&
        polygon.shape === "polygon" &&
        canCommitRasterPolygon(polygon.localPoints)
      ) {
        const image = slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === polygon.elementId && element.type === "image",
        );
        if (image) {
          const shape = selectionShapeFromPoints(
            "polygon",
            polygon.localPoints,
            image.width,
            image.height,
          );
          editorController.commitRasterSelection(
            image.id,
            createRasterSelectionOperation(polygon.mode, shape),
          );
          dragRef.current = null;
          setRasterSelectionDraft(null);
          selectOnly([image.id]);
        }
        return;
      }

      const hit = pickTopMost(p, slide);
      if (!hit) return;

      if (hit.type === "frame") {
        setEditingFrameId(hit.id);
        return;
      }
      if (hit.type === "text") {
        setEditingTextId(hit.id);
        return;
      }
      if (hit.type === "image") {
        setCroppingImageId(hit.id);
        return;
      }
      if (hit.type === "rect" || hit.type === "ellipse" || hit.type === "diamond") {
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
      }
    },
    [editorController, slide, addElement, selectOnly, setTool, setCroppingImageId, tool],
  );

  const onPointerMove = useCallback(
    (p: WorldPoint, _e: React.PointerEvent) => {
      if (tool === "pen") {
        if (penDraggingRef.current && penNodes.length > 0) {
          const idx = penDraggingRef.current.nodeIndex;
          const dx = p.x - penDraggingRef.current.start.x;
          const dy = p.y - penDraggingRef.current.start.y;
          const updated = penNodes.map((n, i) =>
            i === idx
              ? { ...n, out: [dx, dy] as [number, number], in: [-dx, -dy] as [number, number] }
              : n,
          );
          setPenNodes(updated);
          if (updated.length > 1) {
            setDraft(createVectorPathFromWorldNodes(updated, false));
          }
        } else if (penNodes.length > 0) {
          const isNearFirst =
            penNodes.length >= 2 &&
            Math.hypot(penNodes[0].x - p.x, penNodes[0].y - p.y) < 16 / view.scale;
          setPenHoverFirst(isNearFirst);
          // Preview live curve rubber-band to cursor
          setDraft(createVectorPathFromWorldNodes([...penNodes, { x: p.x, y: p.y }], false));
        }
        return;
      }
      const d = dragRef.current;
      if (!d || !slide) return;
      if (d.kind === "move") {
        if (
          !d.checkpointed &&
          !isMeaningfulMove(d.start, p, POINTER_MOVE_THRESHOLD_PX / view.scale)
        ) {
          return;
        }
        const isAlt = _e.altKey || d.altKey;
        if (isAlt && !d.duplicated) {
          const movingElements = slide.elements.filter((el) => d.origins.has(el.id));
          if (movingElements.length > 0) {
            const cloned = cloneElementsForDuplicate(movingElements, 0, 0);
            addElements(cloned, "duplicate element");
            d.ids = cloned.map((el) => el.id);
            d.origins = new Map(cloned.map((el) => [el.id, { x: el.x, y: el.y }]));
            d.duplicated = true;
            d.checkpointed = true;
          }
        } else if (!d.checkpointed) {
          checkpointInteraction("move");
          d.checkpointed = true;
        }
        const preview = calculateMovePreview({
          start: d.start,
          current: p,
          origins: d.origins,
          slide,
          snapGrid,
          snapThreshold: 6 / view.scale,
        });
        setGuides(preview.guides);
        previewElements(preview.patches);
        return;
      }
      if (d.kind === "rasterPaint") {
        const image = slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (!image) return;
        const local = worldToImageLocal(p, image);
        const last = d.localPoints.at(-1);
        if (last && Math.hypot(local[0] - last[0], local[1] - last[1]) < 2 / view.scale) {
          return;
        }
        d.localPoints.push(local);
        d.worldPoints.push(p);
        d.pressures.push(pointerPressure(_e));
        setRasterBrushDraft({
          elementId: d.elementId,
          points: [...d.worldPoints],
          pressures: [...d.pressures],
          size: d.size,
          opacity: d.opacity,
          hardness: d.hardness,
          color: d.color,
          mode: d.mode,
        });
        return;
      }
      if (d.kind === "rasterRetouch") {
        const image = slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (!image) return;
        const local = worldToImageLocal(p, image);
        const last = d.localPoints.at(-1);
        if (last && Math.hypot(local[0] - last[0], local[1] - last[1]) < 2 / view.scale) return;
        d.localPoints.push(local);
        d.worldPoints.push(p);
        setRasterBrushDraft({
          elementId: d.elementId,
          points: [...d.worldPoints],
          pressures: d.worldPoints.map(() => 1),
          size: d.size,
          opacity: d.opacity,
          hardness: rasterBrushHardness,
          color: "#64748b",
          mode: "paint",
        });
        return;
      }
      if (d.kind === "rasterQuickSelection") {
        const image = slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (!image) return;
        const local = worldToImageLocal(p, image);
        if (
          d.lastLocal &&
          Math.hypot(local[0] - d.lastLocal[0], local[1] - d.lastLocal[1]) <
            Math.max(2 / view.scale, d.brushSize * 0.2)
        ) {
          return;
        }
        d.lastLocal = local;
        d.pending = true;
        const generation = ++d.generation;
        quickSelectionAbortRef.current?.abort();
        const abortController = new AbortController();
        quickSelectionAbortRef.current = abortController;
        const requestId = ++quickSelectionRequestRef.current;
        void quickSelectionMaskForPointAsync(
          d.imageData,
          image,
          local,
          d.brushSize,
          d.tolerance,
          abortController.signal,
        )
          .then((stamp) => {
            const current = dragRef.current;
            if (
              current !== d ||
              current.kind !== "rasterQuickSelection" ||
              current.generation !== generation ||
              quickSelectionRequestRef.current !== requestId
            ) {
              return;
            }
            for (let i = 0; i < current.mask.length; i++) {
              if (stamp[i]) current.mask[i] = 1;
            }
            current.pending = false;
            setRasterSelectionDraft({
              elementId: current.elementId,
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
              commitQuickSelection(current);
            }
          })
          .catch(() => {
            const current = dragRef.current;
            if (current === d && current.kind === "rasterQuickSelection") {
              current.pending = false;
              if (current.finishOnComplete) {
                dragRef.current = null;
                setRasterSelectionDraft(null);
              }
            }
          });
        return;
      }
      if (d.kind === "rasterSelection") {
        const image = slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (!image) return;
        if (d.shape === "polygon") return;
        const local = worldToImageLocal(p, image);
        if (d.shape === "rect" || d.shape === "ellipse") {
          d.localPoints = [d.startLocal, local];
        } else {
          const last = d.localPoints.at(-1);
          if (!last || Math.hypot(local[0] - last[0], local[1] - last[1]) >= 2 / view.scale) {
            d.localPoints.push(local);
          }
        }
        setRasterSelectionDraft({
          elementId: d.elementId,
          shape: selectionShapeFromPoints(d.shape, d.localPoints, image.width, image.height),
          mode: d.mode,
        });
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
        const hit = pickTopMost(p, slide);
        if (hit) deleteElements([hit.id]);
        return;
      }
      // draw
      setDraft(makeDraftFor(tool, d.start, p, lineSubtype, _e.shiftKey));
    },
    [
      addElements,
      checkpointInteraction,
      commitQuickSelection,
      deleteElements,
      lineSubtype,
      penNodes,
      previewElements,
      slide,
      snapGrid,
      tool,
      view.scale,
      rasterBrushHardness,
    ],
  );

  const onPointerUp = useCallback(
    (p: WorldPoint, e?: React.PointerEvent) => {
      penDraggingRef.current = null;
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "rasterSelection" && d.shape === "polygon") {
        // Polygon Lasso is click-to-add. Keep its session alive until a
        // double-click or Enter closes the polygon.
        return;
      }
      if (d.kind === "rasterQuickSelection" && d.pending) {
        d.finishOnComplete = true;
        return;
      }
      dragRef.current = null;
      if (d.kind === "move") {
        setGuides([]);
        if (!d.checkpointed) {
          if (d.clickSelection) selectOnly(d.clickSelection);
          return;
        }
        commitInteraction();
        const ids = d.ids;
        const stateNow = useEngine.getState();
        const slideNow = stateNow.doc.slides.find((sl) => sl.id === stateNow.currentSlideId);
        if (!slideNow) return;

        // Canva-style: If dragging a single Image onto a Frame, snap the image into the frame!
        if (ids.length === 1) {
          const movedId = ids[0];
          const movedElement = slideNow.elements.find((el) => el.id === movedId);
          if (movedElement && movedElement.type === "image" && movedElement.fileId) {
            const frameUnder = slideNow.elements.find(
              (el) =>
                !el.isDeleted &&
                el.type === "frame" &&
                el.id !== movedId &&
                p.x >= el.x &&
                p.x <= el.x + el.width &&
                p.y >= el.y &&
                p.y <= el.y + el.height,
            );
            if (frameUnder) {
              stateNow.setFrameImage(frameUnder.id, movedElement.fileId);
              stateNow.deleteElements([movedId]);
              stateNow.selectOnly([frameUnder.id]);
              return;
            }
          }
        }

        const movedBlockIds = ids.filter((id) => getLayerForObject(slideNow, id)?.mode === "block");
        for (const id of movedBlockIds) commitBlockLayout(id);
        return;
      }
      if (d.kind === "rasterPaint") {
        const image = slide?.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (image && d.localPoints.length > 0) {
          const stroke = createRasterStroke(d.localPoints, d.size, d.opacity, {
            mode: d.mode,
            pressures: d.pressures,
            color: d.color,
            hardness: d.hardness,
            selection: d.selection,
            selectionMaskDataUrl: d.selectionMaskDataUrl,
          });
          editorController.commitRasterStroke(
            image.id,
            stroke,
            d.mode === "erase" ? "erase image pixels" : "paint image pixels",
          );
        }
        setRasterBrushDraft(null);
        return;
      }
      if (d.kind === "rasterRetouch") {
        const image = slide?.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (image) {
          const pixels = createRasterSelectionSample(image, images);
          if (pixels) {
            void createRasterRetouchEdit(image, pixels, {
              mode: d.mode,
              points: d.localPoints,
              sourcePoint: d.sourcePoint,
              size: d.size,
              opacity: d.opacity,
              selection: d.selection,
            }).then((edit) => {
              if (edit) {
                editorController.commitRasterRetouch(
                  image.id,
                  edit,
                  d.mode === "heal" ? "heal image pixels" : "clone image pixels",
                );
              }
            });
          }
        }
        setRasterBrushDraft(null);
        return;
      }
      if (d.kind === "rasterQuickSelection") {
        commitQuickSelection(d);
        return;
      }
      if (d.kind === "rasterSelection") {
        const image = slide?.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === d.elementId && element.type === "image",
        );
        if (
          image &&
          d.localPoints.length >= (d.shape === "rect" || d.shape === "ellipse" ? 2 : 3)
        ) {
          const shape = selectionShapeFromPoints(d.shape, d.localPoints, image.width, image.height);
          const operation = createRasterSelectionOperation(d.mode, shape);
          editorController.commitRasterSelection(image.id, operation);
        }
        setRasterSelectionDraft(null);
        return;
      }
      if (d.kind === "freedraw") {
        if (d.points.length >= 2) {
          const raw = d.points;
          const step = Math.max(1, Math.floor(raw.length / 28));
          const sampled = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
          const pathEl = createVectorPath(
            sampled.map(([px, py]) => ({ x: px, y: py })),
            false,
          );
          pathEl.name = "Freehand";
          addElement(pathEl, "draw vector path");
        }
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
            getInteractiveElements(slide),
          );
          const ids = inside.map((el) => el.id);
          if (d.additive) {
            selectOnly(resolveMarqueeSelection(useEngine.getState().selectedIds, ids, true));
          } else {
            selectOnly(ids);
          }
        }
        setMarqueeRect(null);
        return;
      }
      // draw commit
      if (d.kind !== "draw") return;
      const el = makeDraftFor(tool, d.start, p, lineSubtype, e?.shiftKey ?? false);
      if (tool === "arrow" && el && slide) {
        const startHit = pickTopMost(d.start, slide);
        const endHit = pickTopMost(p, slide);
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
      const isLineLike = el?.type === "line" || el?.type === "arrow";
      const isValidSize =
        el && (isLineLike ? Math.hypot(el.width, el.height) >= 4 : el.width >= 4 && el.height >= 4);
      if (el && isValidSize) {
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
    [
      addElement,
      commitBlockLayout,
      commitInteraction,
      commitQuickSelection,
      lineSubtype,
      selectOnly,
      setTool,
      slide,
      tool,
      editorController,
      images,
    ],
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
  const editingFrame = slide.elements.find(
    (el): el is import("@/lib/engine/types").FrameElement =>
      el.id === editingFrameId && el.type === "frame",
  );
  const editingPath =
    tool === "directSelect"
      ? editingPathId
        ? (slide.elements.find(
            (element) => element.id === editingPathId && element.type === "path",
          ) as VectorPathElement | undefined)
        : selectedIds.size === 1
          ? (slide.elements.find(
              (element) => selectedIds.has(element.id) && element.type === "path",
            ) as VectorPathElement | undefined)
          : undefined
      : undefined;

  // Select and Raster Move both operate strictly at the whole-object level.
  const showTransformer =
    !editingText &&
    !croppingImage &&
    !editingFrame &&
    (tool === "select" || tool === "rasterMove") &&
    selectedIds.size > 0;

  const rasterSelectionImage =
    selectedIds.size === 1
      ? (slide.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === Array.from(selectedIds)[0] && element.type === "image",
        ) ?? null)
      : null;

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
          const hit = pickTopMost(world, slide);
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
        showHexGrid={showHexGrid}
        selectedIds={editingText ? new Set() : selectedIds}
        activeLayerId={activeLayerId}
        handActive={tool === "hand"}
        toolCursor={toolToCursor(tool)}
        onPointerDownWorld={onPointerDown}
        onPointerMoveWorld={onPointerMove}
        onPointerMoveScreen={moveRasterBrushCursor}
        onPointerLeaveCanvas={hideRasterBrushCursor}
        onPointerUpWorld={onPointerUp}
        onDoubleClickWorld={onDoubleClickWorld}
        onViewChange={handleViewChange}
      >
        <Marquee rect={marqueeRect} />
        {rasterSelectionImage ? (
          <RasterSelectionOverlay
            image={rasterSelectionImage}
            selection={editorController.selectionForImage(
              activeRasterSelection,
              rasterSelectionImage.id,
            )}
            draft={
              rasterSelectionDraft?.elementId === rasterSelectionImage.id
                ? rasterSelectionDraft
                : null
            }
            worldToScreen={(point) => rootRef.current?.worldToScreen(point) ?? { x: 0, y: 0 }}
          />
        ) : null}
        <Guides
          guides={guides}
          worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        />
        <BindingIndicators
          selectedIds={selectedIds}
          elements={slide.elements}
          worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        />
        {rasterBrushDraft ? (
          <RasterBrushPreview
            points={rasterBrushDraft.points}
            size={rasterBrushDraft.size}
            opacity={rasterBrushDraft.opacity}
            hardness={rasterBrushDraft.hardness}
            color={rasterBrushDraft.mode === "erase" ? "#ffffff" : rasterBrushDraft.color}
            worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
          />
        ) : null}
        {editingPath ? (
          <PathNodeOverlay
            element={editingPath}
            worldToScreen={(point) => rootRef.current?.worldToScreen(point) ?? { x: 0, y: 0 }}
            clientToWorld={(x, y) => rootRef.current?.clientToWorld(x, y) ?? { x: 0, y: 0 }}
            onExit={() => setEditingPathId(null)}
          />
        ) : null}
        {tool === "pen" && penNodes.length > 0 ? (
          <PenLiveOverlay
            nodes={penNodes}
            worldToScreen={(point) => rootRef.current?.worldToScreen(point) ?? { x: 0, y: 0 }}
            isClosingHover={penHoverFirst}
          />
        ) : null}
        {showTransformer && (
          <Transformer
            worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
            scale={view.scale}
            onGuidesChange={setGuides}
            onDoubleClick={() => {
              if (selectedIds.size === 1) {
                const id = Array.from(selectedIds)[0];
                const el = slide.elements.find((e) => e.id === id);
                if (el?.type === "frame") {
                  setEditingFrameId(el.id);
                } else if (el?.type === "text") {
                  setEditingTextId(el.id);
                } else if (el?.type === "image") {
                  setCroppingImageId(el.id);
                } else if (el?.type === "path") {
                  setTool("directSelect");
                  setEditingPathId(el.id);
                } else if (
                  el &&
                  (el.type === "rect" ||
                    el.type === "ellipse" ||
                    el.type === "diamond" ||
                    el.type === "triangle" ||
                    el.type === "star" ||
                    el.type === "hexagon" ||
                    el.type === "heart" ||
                    el.type === "plus" ||
                    el.type === "line" ||
                    el.type === "arrow" ||
                    el.type === "freedraw")
                ) {
                  const converted = convertElementToVectorPath(el);
                  if (converted) {
                    useEngine
                      .getState()
                      .updateElements(
                        [{ id: el.id, patch: converted }],
                        "convert to editable path",
                      );
                    setTool("directSelect");
                    setEditingPathId(el.id);
                  }
                }
              }
            }}
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
        {editingFrame && (
          <FrameEditOverlay
            frame={editingFrame}
            worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
            clientToWorld={(x, y) => rootRef.current?.clientToWorld(x, y) ?? { x: 0, y: 0 }}
            scale={view.scale}
            onClose={() => setEditingFrameId(null)}
          />
        )}
        <SafeAreaOverlay
          mode={safeAreaMode}
          slideWidth={slide.width}
          slideHeight={slide.height}
          worldToScreen={(pt) => rootRef.current?.worldToScreen(pt) ?? { x: 0, y: 0 }}
        />
        {tool === "rasterMagicWand" ? (
          <div
            ref={magicWandCursorRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              left: -14,
              top: -10,
              width: 24,
              height: 24,
              color: "#1d4ed8",
              opacity: "var(--magic-cursor-opacity, 0)",
              pointerEvents: "none",
              transform:
                "translate3d(var(--magic-cursor-x, -9999px), var(--magic-cursor-y, -9999px), 0)",
              filter: "drop-shadow(0 1px 1px rgba(255, 255, 255, 0.95))",
              zIndex: 51,
            }}
          >
            <IconWand size={24} />
          </div>
        ) : null}
        {isRasterBrushCursorTool(tool) ? (
          <div
            ref={rasterBrushCursorRef}
            aria-hidden="true"
            style={{
              position: "absolute",
              left:
                -(
                  (tool === "rasterQuickSelection" ? rasterQuickSelectionSize : rasterBrushSize) *
                  view.scale
                ) / 2,
              top:
                -(
                  (tool === "rasterQuickSelection" ? rasterQuickSelectionSize : rasterBrushSize) *
                  view.scale
                ) / 2,
              width: Math.max(
                2,
                (tool === "rasterQuickSelection" ? rasterQuickSelectionSize : rasterBrushSize) *
                  view.scale,
              ),
              height: Math.max(
                2,
                (tool === "rasterQuickSelection" ? rasterQuickSelectionSize : rasterBrushSize) *
                  view.scale,
              ),
              border: "1px solid rgba(17, 24, 39, 0.9)",
              borderRadius: "50%",
              boxShadow: "0 0 0 1px rgba(255, 255, 255, 0.95)",
              boxSizing: "border-box",
              opacity: "var(--brush-cursor-opacity, 0)",
              pointerEvents: "none",
              transform:
                "translate3d(var(--brush-cursor-x, -9999px), var(--brush-cursor-y, -9999px), 0)",
              willChange: "transform",
              zIndex: 50,
            }}
          />
        ) : null}
      </CanvasRoot>
      <RasterPerformanceOverlay />
      {ctxMenu && <ContextMenu position={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* Floating Safe Area Guide Widget */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          zIndex: 15,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--surface-solid, rgba(30, 30, 36, 0.9))",
          backdropFilter: "blur(6px)",
          border: "1px solid var(--stroke, rgba(255, 255, 255, 0.12))",
          borderRadius: 8,
          padding: "4px 8px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--ink-muted, #9ca3af)", fontWeight: 600 }}>
          Safe Area:
        </span>
        <select
          value={safeAreaMode}
          onChange={(e) => setSafeAreaMode(e.target.value as SafeAreaMode)}
          style={{
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 4,
            border: "1px solid var(--stroke, rgba(255, 255, 255, 0.15))",
            background: "transparent",
            color: "var(--ink, #f4f4f5)",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="none" style={{ background: "#1e1e24", color: "#f4f4f5" }}>
            Off
          </option>
          <option value="tiktok-reels" style={{ background: "#1e1e24", color: "#f4f4f5" }}>
            TikTok / Reels (9:16)
          </option>
          <option value="ig-story" style={{ background: "#1e1e24", color: "#f4f4f5" }}>
            Instagram Story
          </option>
          <option value="print-bleed" style={{ background: "#1e1e24", color: "#f4f4f5" }}>
            Print & Bleed (3mm)
          </option>
        </select>
      </div>
    </div>
  );
});

export default CanvasEditor;

function makeDraftFor(
  tool: Tool,
  a: WorldPoint,
  b: WorldPoint,
  lineSubtype?: LineSubtype,
  lockAspect = false,
): EngineElement | null {
  const constrained = constrainShapeDrag(tool, a, b, lockAspect);
  const x = Math.min(constrained.start.x, constrained.current.x);
  const y = Math.min(constrained.start.y, constrained.current.y);
  const w = Math.abs(constrained.current.x - constrained.start.x);
  const h = Math.abs(constrained.current.y - constrained.start.y);
  switch (tool) {
    case "rect": {
      const el = createRect({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Rectangle";
      return path;
    }
    case "ellipse": {
      const el = createEllipse({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Circle";
      return path;
    }
    case "diamond": {
      const el = createDiamond({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Diamond";
      return path;
    }
    case "triangle": {
      const el = createTriangle({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Triangle";
      return path;
    }
    case "star": {
      const el = createStar({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Star";
      return path;
    }
    case "hexagon": {
      const el = createHexagon({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Hexagon";
      return path;
    }
    case "heart": {
      const el = createHeart({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Heart";
      return path;
    }
    case "plus": {
      const el = createPlus({ x, y, width: w, height: h });
      const path = convertElementToVectorPath(el)!;
      path.name = "Plus";
      return path;
    }
    case "line": {
      const path = createVectorPath(
        [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ],
        false,
      );
      path.name = "Line";
      if (lineSubtype === "dashed") {
        path.strokeStyle = "dashed";
      }
      return path;
    }
    case "arrow": {
      if (lineSubtype === "curvedArrow") {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const path = createVectorPathFromWorldNodes(
          [
            { x: a.x, y: a.y, out: [dx * 0.4, -dy * 0.2] },
            { x: b.x, y: b.y, in: [-dx * 0.4, dy * 0.2] },
          ],
          false,
        );
        path.name = "Curved Arrow";
        path.endArrowhead = "arrow";
        return path;
      }
      const path = createVectorPath(
        [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ],
        false,
      );
      path.name = lineSubtype === "doubleArrow" ? "Double Arrow" : "Arrow";
      if (lineSubtype === "doubleArrow") {
        path.startArrowhead = "arrow";
      }
      path.endArrowhead = "arrow";
      return path;
    }
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

function RasterBrushPreview({
  points,
  size,
  opacity,
  hardness,
  color,
  worldToScreen,
}: {
  points: WorldPoint[];
  size: number;
  opacity: number;
  hardness: number;
  color: string;
  worldToScreen: (point: WorldPoint) => WorldPoint;
}) {
  const screenPoints = points.map(worldToScreen);
  const last = screenPoints.at(-1);
  if (!last) return null;
  const offset = worldToScreen({ x: points.at(-1)!.x + size / 2, y: points.at(-1)!.y });
  const radius = Math.max(2, Math.hypot(offset.x - last.x, offset.y - last.y));
  return (
    <svg
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      {screenPoints.length > 1 ? (
        <polyline
          points={screenPoints.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={color}
          strokeOpacity={Math.max(0.2, opacity)}
          strokeWidth={Math.max(1, radius * 2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <circle
        cx={last.x}
        cy={last.y}
        r={radius}
        fill={color}
        fillOpacity={Math.max(0.08, opacity * (0.1 + hardness * 0.15))}
        stroke="#111827"
        strokeWidth={1}
      />
    </svg>
  );
}

/** Given a clicked element, expand to all eligible elements in its selection group. */
function getSelectionMembers(hit: EngineElement, slide: EngineSlide): string[] {
  const interactiveIds = new Set(getInteractiveElements(slide).map((element) => element.id));
  const innermost = hit.groupIds[hit.groupIds.length - 1];
  let members = innermost
    ? slide.elements.filter((el) => el.groupIds.includes(innermost)).map((el) => el.id)
    : [hit.id];

  if (hit.type === "frame") {
    const frame = hit as import("@/lib/engine/types").FrameElement;
    members = Array.from(new Set([...members, ...frame.childIds]));
  }

  return Array.from(new Set(members)).filter((id) => interactiveIds.has(id));
}
