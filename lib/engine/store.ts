"use client";

/**
 * Engine-side zustand store.
 *
 * Lives alongside the legacy `lib/store.ts` during the rewrite. Once the new
 * canvas reaches feature parity we'll fold deck/slide concerns from the
 * legacy store into this one and delete the old.
 *
 * Responsibilities:
 *   - hold the EngineDoc (multi-slide)
 *   - track current slide id, selection, active tool
 *   - expose mutation actions that auto-snapshot history
 *   - provide undo/redo entry points
 */

import { create } from "zustand";
import {
  type AppearanceError,
  type AppearanceOperation,
  appearanceElementPatch,
  changeAppearance,
  syncElementAppearance,
} from "../appearance";
import {
  htmlToArtShiftElements,
  htmlToInternalObjects,
  htmlToInternalSlide,
  readSystemClipboardHtml,
} from "../clipboard";
import {
  type ActiveRasterSelection,
  appendActiveRasterSelection,
  clearActiveRasterSelection,
  setActiveRasterSelection,
} from "../raster/activeSelection";
import {
  featherRasterSelection,
  invertRasterSelection,
  type RasterSelection,
  type RasterSelectionOperation,
  transformRasterSelection,
} from "../raster/selection";
import type { GhostVariationOverlay } from "../renderer/ghostOverlay";
import type { TemplateResult } from "../templates";
import type { Slide } from "../types";
import { legacyObjectsToEngineElements, legacyToEngineDoc } from "./adapter";
import { type AlignMode, alignElements, type DistributeAxis, distributeElements } from "./align";
import { recomputeArrowBindings } from "./binding";
import { createImage } from "./factory";
import { convertShapeToFrame, isConvertibleShape } from "./frameMask";
import {
  createHistory,
  type HistoryState,
  redoWithMetadata as historyRedoWithMetadata,
  undoWithMetadata as historyUndoWithMetadata,
  pushHistory,
} from "./history";
import { getCached, loadDataURL } from "./imageCache";
import { createInteractionController, type PreviewPatch } from "./interactionController";
import {
  addObjectToLayer,
  createEngineLayer,
  getInteractiveElements,
  getLayerForObject,
  isObjectLocked,
  moveElementZ,
  moveObjectsToLayer as moveObjectsToLayerModel,
  normalizeDocumentLayers,
  reorderElementsInSlide,
  setElementLocked,
  setElementVisibility,
} from "./layers";
import { isMediaElement, normalizeMediaPatch } from "./mediaLayout";
import { resizeArtworkSlide } from "./resizeArtwork";
import { INFINITY_CANVAS_LABEL, SLIDE_KIND_ARTWORK, SLIDE_KIND_INFINITY_CANVAS } from "./slideKind";
import { type SmartArrangeOptions, type SmartArrangePatch, solveSmartArrange } from "./smartLayout";
import { publishEngineClipboard } from "./systemClipboard";
import { applyTemplateToSlide, type TemplateApplyMode } from "./templateApplication";
import { normalizeTextPatch } from "./textObject";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineLayer,
  type EngineSlide,
  type FrameElement,
  type FrameMaskShape,
  type ImageElement,
  SLIDE_H,
  SLIDE_W,
  type SlideKind,
  type TextElement,
} from "./types";
import {
  applyBooleanOperation as applyBooleanOp,
  type BooleanOperation,
  isShapeElement,
} from "./vectorBoolean";

export type Tool =
  | "select"
  | "rasterMove"
  | "directSelect"
  | "hand"
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "star"
  | "hexagon"
  | "heart"
  | "plus"
  | "line"
  | "arrow"
  | "freedraw"
  | "pen"
  | "text"
  | "image"
  | "eraser"
  | "rasterEraser"
  | "rasterPencil"
  | "rasterBrush"
  | "rasterMarquee"
  | "rasterEllipse"
  | "rasterLasso"
  | "rasterPolygonLasso"
  | "rasterMagicWand"
  | "rasterQuickSelection"
  | "rasterHealing"
  | "rasterClone"
  | "frame";

export type EditorMode = "raster" | "vector";
export type LineSubtype =
  | "solid"
  | "arrow"
  | "doubleArrow"
  | "dashed"
  | "curvedArrow"
  | "freedraw"
  | "pen";

export type EngineState = {
  doc: EngineDoc;
  currentSlideId: string;
  activeLayerId: string;
  selectedIds: Set<string>;
  selectionVersion: number;
  editorMode: EditorMode;
  tool: Tool;
  lineSubtype: LineSubtype;
  history: HistoryState;
  /** Current non-persisted Smart Arrange preview patches. */
  smartArrangePreview: SmartArrangePatch[] | null;
  previewSmartArrange: (options?: SmartArrangeOptions) => SmartArrangePatch[];
  applySmartArrange: () => void;
  cancelSmartArrange: () => void;
  /** Active non-destructive ghost preview overlay for AI candidate variations. */
  activeGhostOverlay: GhostVariationOverlay | null;
  setGhostOverlay: (overlay: GhostVariationOverlay | null) => void;
  clearGhostOverlay: () => void;

  // ——— selectors (call as plain functions; they rely on getState) ———
  currentSlide: () => EngineSlide | undefined;
  currentTool: () => Tool;
  currentSelection: () => ReadonlySet<string>;

  // ——— mutators ———
  setTool: (t: Tool) => void;
  setEditorMode: (mode: EditorMode) => void;
  setLineSubtype: (subtype: LineSubtype) => void;
  setCurrentSlide: (id: string) => void;
  setActiveLayer: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  addElement: (el: EngineElement, label?: string) => void;
  addElements: (elements: EngineElement[], label?: string) => void;
  applyTemplate: (result: TemplateResult, mode?: TemplateApplyMode, label?: string) => void;
  addLayer: () => string;
  renameLayer: (id: string, name: string) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerLocked: (id: string, locked: boolean) => void;
  moveLayer: (id: string, direction: "forward" | "backward") => void;
  moveObjectsToLayer: (ids: string[], layerId: string) => void;
  setElementVisibility: (elementId: string, visible: boolean) => void;
  setElementLocked: (elementId: string, locked: boolean) => void;
  moveElementZ: (elementId: string, direction: "forward" | "backward" | "front" | "back") => void;
  reorderElement: (sourceId: string, targetId: string) => void;
  renameElement: (elementId: string, name: string) => void;
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label?: string,
  ) => void;
  /**
   * Appearance stack mutation via `changeAppearance`. All-or-none across `ids`.
   * Dual-writes canonical `appearance` and legacy flat fields.
   * Pass a function when item ids differ per element (legacy fill/stroke/effect ids).
   */
  updateAppearance: (
    ids: string[],
    operation: AppearanceOperation | ((element: EngineElement) => AppearanceOperation | null),
    label?: string,
  ) => { ok: true; changed: boolean } | { ok: false; error: AppearanceError };
  /** Live Appearance preview that does not add another undo step. */
  previewAppearance: (
    ids: string[],
    operation: AppearanceOperation | ((element: EngineElement) => AppearanceOperation | null),
  ) => { ok: true; changed: boolean } | { ok: false; error: AppearanceError };
  /** One undo snapshot at the beginning of a pointer interaction. */
  checkpointInteraction: (label: string) => void;
  /** Live geometry update that intentionally does not add another undo step. */
  previewElements: (patches: Array<{ id: string; patch: Partial<EngineElement> }>) => void;
  /** Mark the end of a live interaction as one persisted document revision. */
  commitInteraction: () => void;
  deleteElements: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  selectAll: () => void;
  alignSelectedElements: (mode: AlignMode, relativeTo?: "selection" | "slide") => void;
  distributeSelectedElements: (axis: DistributeAxis) => void;
  applyBooleanOperation: (op: BooleanOperation) => void;
  replaceElementsWithMerged: (ids: string[], mergedElement: ImageElement) => void;
  setFrameImage: (frameId: string, imageFileId: string | undefined) => void;
  setFrameShape: (frameId: string, shape: FrameMaskShape) => void;
  detachFrameImage: (frameId: string) => void;
  convertShapeToFrame: (elementId: string, imageFileId?: string) => FrameElement | undefined;

  addSlide: () => string;
  addInfinityCanvasSlide: () => string;
  deleteSlide: (id: string) => void;
  renameSlide: (id: string, name: string) => void;
  setSlideBackground: (id: string, color: string) => void;
  setSlideDimensions: (id: string, width: number, height: number, resizeContents?: boolean) => void;
  createArtworkVariant: (
    sourceId: string,
    width: number,
    height: number,
    name?: string,
    resizeContents?: boolean,
  ) => string;
  syncElementsToVariants: (ids: string[]) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;

  groupElements: (ids: string[]) => void;
  ungroupElements: (ids: string[]) => void;
  flipHorizontal: (ids: string[]) => void;
  flipVertical: (ids: string[]) => void;

  /** In-memory clipboard of elements with source ids for relationship remapping. */
  clipboard: EngineElement[] | null;
  /**
   * Copy into the tab-local clipboard and, by default, the system clipboard.
   * Pass `{ systemClipboard: false }` for in-tab duplicate so Cmd/Ctrl+D does
   * not replace what the user copied from another app.
   */
  copyElements: (ids: string[], options?: { systemClipboard?: boolean }) => void;
  cutElements: (ids: string[]) => void;
  pasteElements: () => void;
  /** Insert elements that arrived from another tab (or a mighty-slide HTML payload). */
  pasteExternalElements: (elements: EngineElement[], assets?: Record<string, string>) => void;
  /**
   * Parse ArtShift / mighty-slide HTML and insert it.
   * Returns false for external HTML (Docs, Figma, OS images) so the caller
   * can keep its own paste path.
   */
  pasteClipboardHtml: (html: string) => boolean;

  undo: () => void;
  redo: () => void;
  /** Replace the entire document (e.g. on file open). */
  loadDoc: (doc: EngineDoc) => void;
  setDocTitle: (title: string) => void;
  setGridSnap: (size: number | null) => void;
  croppingImageId: string | null;
  setCroppingImageId: (id: string | null) => void;
  aiImageModalOpen: boolean;
  setAiImageModalOpen: (open: boolean) => void;
  /** Brush/Pencil diameter in image-local pixels for non-destructive raster strokes. */
  rasterBrushSize: number;
  setRasterBrushSize: (size: number) => void;
  rasterBrushOpacity: number;
  setRasterBrushOpacity: (opacity: number) => void;
  rasterBrushHardness: number;
  setRasterBrushHardness: (hardness: number) => void;
  rasterBrushColor: string;
  setRasterBrushColor: (color: string) => void;
  /** Color-distance tolerance for Raster Magic Wand selections. */
  rasterMagicWandTolerance: number;
  setRasterMagicWandTolerance: (tolerance: number) => void;
  /** When true, Magic Wand flood-fills from the seed; when false, all similar pixels. */
  rasterMagicWandContiguous: boolean;
  setRasterMagicWandContiguous: (contiguous: boolean) => void;
  /** Diameter of the Raster Quick Selection brush in image-local pixels. */
  rasterQuickSelectionSize: number;
  setRasterQuickSelectionSize: (size: number) => void;
  /** Soften vector marquee/lasso edges when rasterizing the selection mask. */
  rasterSelectionAntiAlias: boolean;
  setRasterSelectionAntiAlias: (antiAlias: boolean) => void;
  /** The one Photoshop-style pixel Selection currently attached to an image. */
  activeRasterSelection: ActiveRasterSelection;
  applyRasterSelection: (
    imageId: string,
    operation: RasterSelectionOperation,
    width: number,
    height: number,
  ) => void;
  setRasterSelection: (imageId: string, selection: RasterSelection | null) => void;
  invertActiveRasterSelection: () => void;
  featherActiveRasterSelection: (radius: number) => void;
  transformActiveRasterSelection: (
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number,
  ) => void;
  clearRasterSelection: (imageId: string) => void;
  clearAllRasterSelections: () => void;
};

function isRasterSelectionTool(tool: Tool): boolean {
  return (
    tool === "rasterMarquee" ||
    tool === "rasterEllipse" ||
    tool === "rasterLasso" ||
    tool === "rasterPolygonLasso" ||
    tool === "rasterMagicWand" ||
    tool === "rasterQuickSelection"
  );
}

function isVectorTool(tool: Tool): boolean {
  return (
    tool === "select" ||
    tool === "directSelect" ||
    tool === "rect" ||
    tool === "ellipse" ||
    tool === "diamond" ||
    tool === "triangle" ||
    tool === "star" ||
    tool === "hexagon" ||
    tool === "heart" ||
    tool === "plus" ||
    tool === "line" ||
    tool === "arrow" ||
    tool === "freedraw" ||
    tool === "pen" ||
    tool === "text" ||
    tool === "image" ||
    tool === "eraser" ||
    tool === "frame"
  );
}

function newSlide(name: string, kind: SlideKind = SLIDE_KIND_ARTWORK): EngineSlide {
  const layer = createEngineLayer({ name: "Layer 1" });
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    background: "#ffffff",
    elements: [],
    layers: [layer],
    width: SLIDE_W,
    height: SLIDE_H,
  };
}

export function createEmptyEngineDoc(title = "Untitled Project"): EngineDoc {
  const slide = newSlide("1");
  return {
    id: crypto.randomUUID(),
    title,
    width: SLIDE_W,
    height: SLIDE_H,
    slides: [slide],
    snapGrid: null,
    updatedAt: Date.now(),
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

function emptyDoc(): EngineDoc {
  return createEmptyEngineDoc("Untitled");
}

function nextZ(slide: EngineSlide): number {
  let z = 0;
  for (const el of slide.elements) if (el.z > z) z = el.z;
  return z + 1;
}

export const useEngine = create<EngineState>((set, get) => {
  const initial = emptyDoc();
  const interactionController = createInteractionController((patches: PreviewPatch[]) => {
    set((cur) => mapDoc(cur, (sl) => applyElementPatches(sl, patches), false));
  });

  const commitPastedElements = (elements: EngineElement[]) => {
    if (!elements.length) return;
    const s = get();
    const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
    if (!slide) return;
    pushHistory(s.history, s.doc, "paste");
    const pasted = clampElementsToSlide(cloneElementsForPaste(elements), slide.width, slide.height);
    set((cur) =>
      mapCurrentSlide(cur, (sl) => {
        let next = sl;
        const layerId = sl.layers.some((layer) => layer.id === cur.activeLayerId)
          ? cur.activeLayerId
          : sl.layers[0]?.id;
        if (!layerId) return sl;
        for (const el of pasted) {
          el.z = nextZ(next);
          next = addObjectToLayer(next, el, layerId);
        }
        return recomputeArrowBindings(next);
      }),
    );
    if (pasted.length) set({ selectedIds: new Set(pasted.map((e) => e.id)) });
  };

  const pasteLegacySlide = async (legacySlide: Slide) => {
    const converted = await legacyToEngineDoc({
      id: crypto.randomUUID(),
      title: legacySlide.name || "Pasted slide",
      width: 1280,
      height: 720,
      slides: [legacySlide],
      updatedAt: Date.now(),
    });
    const incoming = converted.slides[0];
    if (!incoming) return;
    const copy: EngineSlide = {
      ...incoming,
      id: crypto.randomUUID(),
      name: `${incoming.name || "Slide"} copy`,
      elements: cloneElementsForDuplicate(incoming.elements, 0, 0),
    };
    const s = get();
    pushHistory(s.history, s.doc, "paste slide");
    const anchor = s.currentSlideId;
    set((cur) => {
      const idx = cur.doc.slides.findIndex((item) => item.id === anchor);
      const slides = [...cur.doc.slides];
      slides.splice(idx < 0 ? slides.length : idx + 1, 0, copy);
      return {
        doc: { ...cur.doc, slides, updatedAt: Date.now() },
        currentSlideId: copy.id,
        activeLayerId: copy.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
        selectedIds: new Set<string>(),
      };
    });
  };

  return {
    doc: initial,
    currentSlideId: initial.slides[0].id,
    activeLayerId: initial.slides[0].layers[0].id,
    selectedIds: new Set<string>(),
    selectionVersion: 0,
    editorMode: "vector" as EditorMode,
    tool: "select" as Tool,
    clipboard: null as EngineElement[] | null,
    history: createHistory(),
    smartArrangePreview: null,
    activeGhostOverlay: null,
    setGhostOverlay: (overlay) => set({ activeGhostOverlay: overlay }),
    clearGhostOverlay: () => set({ activeGhostOverlay: null }),
    previewSmartArrange: (options = {}) => {
      const existing = get().smartArrangePreview;
      if (existing) {
        interactionController.cancel();
        get().undo();
        set({ smartArrangePreview: null });
      }

      const state = get();
      const slide = state.currentSlide();
      if (!slide) return [];
      const patches = solveSmartArrange(slide, {
        ...options,
        scope: options.scope ?? "slide",
        selectedIds: options.selectedIds ?? Array.from(state.selectedIds),
      });
      if (!patches.length) return patches;

      get().checkpointInteraction("smart arrange");
      get().previewElements(patches);
      set({ smartArrangePreview: patches });
      return patches;
    },
    applySmartArrange: () => {
      interactionController.flush();
      if (!get().smartArrangePreview) return;
      set((state) => ({
        doc: { ...state.doc, updatedAt: nextRevision(state.doc.updatedAt) },
        smartArrangePreview: null,
      }));
    },
    cancelSmartArrange: () => {
      if (!get().smartArrangePreview) return;
      interactionController.cancel();
      get().undo();
      set({ smartArrangePreview: null });
    },
    lineSubtype: "solid" as LineSubtype,
    aiImageModalOpen: false,
    setAiImageModalOpen: (open) => set({ aiImageModalOpen: open }),
    rasterBrushSize: 48,
    setRasterBrushSize: (size) => set({ rasterBrushSize: Math.max(1, Math.min(512, size)) }),
    rasterBrushOpacity: 1,
    setRasterBrushOpacity: (opacity) =>
      set({ rasterBrushOpacity: Math.max(0.05, Math.min(1, opacity)) }),
    rasterBrushHardness: 0.7,
    setRasterBrushHardness: (hardness) =>
      set({ rasterBrushHardness: Math.max(0, Math.min(1, hardness)) }),
    rasterBrushColor: "#111827",
    setRasterBrushColor: (color) => set({ rasterBrushColor: color }),
    rasterMagicWandTolerance: 32,
    setRasterMagicWandTolerance: (tolerance) =>
      set({ rasterMagicWandTolerance: Math.max(0, Math.min(255, tolerance)) }),
    rasterMagicWandContiguous: true,
    setRasterMagicWandContiguous: (contiguous) => set({ rasterMagicWandContiguous: contiguous }),
    rasterQuickSelectionSize: 96,
    setRasterQuickSelectionSize: (size) =>
      set({ rasterQuickSelectionSize: Math.max(1, Math.min(512, size)) }),
    rasterSelectionAntiAlias: true,
    setRasterSelectionAntiAlias: (antiAlias) => set({ rasterSelectionAntiAlias: antiAlias }),
    activeRasterSelection: null,
    applyRasterSelection: (imageId, operation, width, height) =>
      set((state) => {
        const before = state.activeRasterSelection;
        const next = appendActiveRasterSelection(before, imageId, operation, width, height);
        if (next === before) return state;
        // Selection edits are first-class transactions. The document snapshot
        // is intentionally unchanged, but Cmd/Ctrl+Z must restore the prior
        // mask instead of deleting the image or merely clearing the overlay.
        pushHistory(state.history, state.doc, `raster selection ${operation.id}`, before);
        return { activeRasterSelection: next };
      }),
    setRasterSelection: (imageId, selection) =>
      set((state) => {
        const before = state.activeRasterSelection;
        const next =
          selection && selection.operations.length > 0
            ? setActiveRasterSelection(imageId, selection)
            : null;
        if (next === before) return state;
        pushHistory(state.history, state.doc, "raster selection set", before);
        return { activeRasterSelection: next };
      }),
    invertActiveRasterSelection: () =>
      set((state) => {
        const active = state.activeRasterSelection;
        if (!active) return state;
        const inverted = invertRasterSelection(
          active.selection,
          active.selection.width,
          active.selection.height,
        );
        if (!inverted) return state;
        pushHistory(state.history, state.doc, "raster selection invert", active);
        return { activeRasterSelection: { imageId: active.imageId, selection: inverted } };
      }),
    featherActiveRasterSelection: (radius) =>
      set((state) => {
        const active = state.activeRasterSelection;
        if (!active) return state;
        const feathered = featherRasterSelection(
          active.selection,
          active.selection.width,
          active.selection.height,
          radius,
        );
        if (!feathered) return state;
        pushHistory(state.history, state.doc, "raster selection feather", active);
        return { activeRasterSelection: { imageId: active.imageId, selection: feathered } };
      }),
    transformActiveRasterSelection: (scaleX, scaleY, offsetX, offsetY) =>
      set((state) => {
        const active = state.activeRasterSelection;
        if (!active) return state;
        const transformed = transformRasterSelection(
          active.selection,
          active.selection.width,
          active.selection.height,
          scaleX,
          scaleY,
          offsetX,
          offsetY,
        );
        if (!transformed) return state;
        pushHistory(state.history, state.doc, "raster selection transform", active);
        return { activeRasterSelection: { imageId: active.imageId, selection: transformed } };
      }),
    clearRasterSelection: (imageId) =>
      set((state) => {
        const before = state.activeRasterSelection;
        const next = clearActiveRasterSelection(before, imageId);
        if (next === before) return state;
        pushHistory(state.history, state.doc, "raster selection clear", before);
        return { activeRasterSelection: next };
      }),
    clearAllRasterSelections: () =>
      set((state) => {
        if (state.activeRasterSelection === null) return state;
        pushHistory(
          state.history,
          state.doc,
          "raster selection clear",
          state.activeRasterSelection,
        );
        return { activeRasterSelection: null };
      }),

    currentSlide: () => {
      const s = get();
      return s.doc.slides.find((sl) => sl.id === s.currentSlideId);
    },
    currentTool: () => get().tool,
    currentSelection: () => get().selectedIds,

    setTool: (tool) =>
      set((state) => ({
        tool,
        editorMode:
          tool === "rasterMove" ||
          isRasterSelectionTool(tool) ||
          tool === "rasterEraser" ||
          tool === "rasterPencil" ||
          tool === "rasterBrush"
            ? "raster"
            : isVectorTool(tool)
              ? "vector"
              : state.editorMode,
      })),
    setEditorMode: (editorMode) =>
      set({ editorMode, tool: editorMode === "raster" ? "rasterMove" : "select" }),
    setLineSubtype: (lineSubtype) => set({ lineSubtype }),
    setCurrentSlide: (id) => {
      if (get().smartArrangePreview) {
        interactionController.cancel();
        get().undo();
      }
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === id);
        return {
          currentSlideId: id,
          activeLayerId: slide?.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
          selectedIds: new Set(),
          selectionVersion: (state.selectionVersion || 0) + 1,
          activeRasterSelection: null,
          smartArrangePreview: null,
        };
      });
    },
    setActiveLayer: (id) =>
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
        if (!slide?.layers.some((layer) => layer.id === id)) return state;
        return {
          activeLayerId: id,
          selectedIds: new Set(),
          selectionVersion: (state.selectionVersion || 0) + 1,
          croppingImageId: null,
        };
      }),

    selectOnly: (ids) =>
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
        const layer = ids[0] && slide ? getLayerForObject(slide, ids[0]) : undefined;
        return {
          selectedIds: new Set(ids),
          selectionVersion: (state.selectionVersion || 0) + 1,
          activeLayerId: layer?.id ?? state.activeLayerId,
          croppingImageId: null,
        };
      }),
    toggleSelect: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        const slide = s.doc.slides.find((candidate) => candidate.id === s.currentSlideId);
        const layer = slide ? getLayerForObject(slide, id) : undefined;
        return {
          selectedIds: next,
          selectionVersion: (s.selectionVersion || 0) + 1,
          activeLayerId: layer?.id ?? s.activeLayerId,
          croppingImageId: null,
        };
      }),
    clearSelection: () =>
      set((s) => ({
        selectedIds: new Set(),
        selectionVersion: (s.selectionVersion || 0) + 1,
        croppingImageId: null,
      })),

    addElement: (el, label = "add element") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => ({
        ...mapCurrentSlide(cur, (sl) => {
          const added = { ...el, z: nextZ(sl) } as EngineElement;
          const layerId = sl.layers.some((layer) => layer.id === cur.activeLayerId)
            ? cur.activeLayerId
            : sl.layers[0]?.id;
          if (!layerId) return sl;
          return recomputeArrowBindings(addObjectToLayer(sl, added, layerId));
        }),
        selectedIds: new Set([el.id]),
      }));
    },

    addElements: (elements, label = "add elements") => {
      if (!elements.length) return;
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => ({
        ...mapCurrentSlide(cur, (sl) => {
          let next = sl;
          const layerId = sl.layers.some((layer) => layer.id === cur.activeLayerId)
            ? cur.activeLayerId
            : sl.layers[0]?.id;
          if (!layerId) return sl;
          for (const el of elements) {
            const added = { ...el, z: nextZ(next) } as EngineElement;
            next = addObjectToLayer(next, added, layerId);
          }
          return recomputeArrowBindings(next);
        }),
        selectedIds: new Set(elements.map((e) => e.id)),
      }));
    },

    applyTemplate: (result, mode = "replace", label = "apply template") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => {
        const current = cur.doc.slides.find((slide) => slide.id === cur.currentSlideId);
        if (!current) return cur;
        const outcome = applyTemplateToSlide(current, result, mode);
        return {
          doc: {
            ...cur.doc,
            slides: cur.doc.slides.map((slide) =>
              slide.id === current.id ? outcome.slide : slide,
            ),
            updatedAt: Date.now(),
          },
          activeLayerId: outcome.layerId,
          selectedIds: new Set(outcome.objectIds),
          croppingImageId: null,
        };
      });
    },

    addLayer: () => {
      const s = get();
      const slide = s.currentSlide();
      const layer = createEngineLayer({
        name: `Layer ${(slide?.layers.length ?? 0) + 1}`,
        z: nextLayerZ(slide?.layers ?? []),
      });
      pushHistory(s.history, s.doc, "add layer");
      set((cur) => ({
        ...mapCurrentSlide(cur, (current) => ({
          ...current,
          layers: [...current.layers, layer],
        })),
        activeLayerId: layer.id,
        selectedIds: new Set(),
      }));
      return layer.id;
    },

    renameLayer: (id, name) => {
      const s = get();
      const trimmed = name.trim();
      if (!trimmed) return;
      const layer = s.currentSlide()?.layers.find((candidate) => candidate.id === id);
      if (!layer || layer.name === trimmed) return;
      pushHistory(s.history, s.doc, "rename layer");
      set((cur) =>
        mapCurrentSlide(cur, (slide) => ({
          ...slide,
          layers: slide.layers.map((candidate) =>
            candidate.id === id ? { ...candidate, name: trimmed } : candidate,
          ),
        })),
      );
    },

    setLayerVisibility: (id, visible) => {
      const s = get();
      const layer = s.currentSlide()?.layers.find((candidate) => candidate.id === id);
      if (!layer || layer.visible === visible) return;
      pushHistory(s.history, s.doc, visible ? "show layer" : "hide layer");
      const objectIds = new Set(layer.objectIds);
      set((cur) => ({
        ...mapCurrentSlide(cur, (slide) => ({
          ...slide,
          layers: slide.layers.map((candidate) =>
            candidate.id === id ? { ...candidate, visible } : candidate,
          ),
        })),
        selectedIds: visible
          ? cur.selectedIds
          : new Set([...cur.selectedIds].filter((selectedId) => !objectIds.has(selectedId))),
        croppingImageId:
          cur.croppingImageId && objectIds.has(cur.croppingImageId) && !visible
            ? null
            : cur.croppingImageId,
      }));
    },

    setLayerLocked: (id, locked) => {
      const s = get();
      const layer = s.currentSlide()?.layers.find((candidate) => candidate.id === id);
      if (!layer || layer.locked === locked) return;
      pushHistory(s.history, s.doc, locked ? "lock layer" : "unlock layer");
      const objectIds = new Set(layer.objectIds);
      set((cur) => ({
        ...mapCurrentSlide(cur, (slide) => ({
          ...slide,
          layers: slide.layers.map((candidate) =>
            candidate.id === id ? { ...candidate, locked } : candidate,
          ),
        })),
        selectedIds: locked
          ? new Set([...cur.selectedIds].filter((selectedId) => !objectIds.has(selectedId)))
          : cur.selectedIds,
      }));
    },

    moveLayer: (id, direction) => {
      const s = get();
      const slide = s.currentSlide();
      if (!slide) return;
      const ordered = [...slide.layers].sort((a, b) => a.z - b.z);
      const index = ordered.findIndex((layer) => layer.id === id);
      const swapIndex = direction === "forward" ? index + 1 : index - 1;
      if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) return;
      pushHistory(s.history, s.doc, "layer order");
      const currentZ = ordered[index].z;
      const swapZ = ordered[swapIndex].z;
      set((cur) =>
        mapCurrentSlide(cur, (current) => ({
          ...current,
          layers: current.layers.map((layer) => {
            if (layer.id === id) return { ...layer, z: swapZ };
            if (layer.id === ordered[swapIndex].id) return { ...layer, z: currentZ };
            return layer;
          }),
        })),
      );
    },

    moveObjectsToLayer: (ids, layerId) => {
      if (!ids.length) return;
      const s = get();
      pushHistory(s.history, s.doc, "move objects to layer");
      set((cur) => ({
        ...mapCurrentSlide(cur, (slide) =>
          recomputeArrowBindings(moveObjectsToLayerModel(slide, ids, layerId)),
        ),
        activeLayerId: layerId,
      }));
    },

    setElementVisibility: (elementId, visible) => {
      const s = get();
      pushHistory(s.history, s.doc, visible ? "show element" : "hide element");
      set((cur) => ({
        ...mapCurrentSlide(cur, (sl) => setElementVisibility(sl, elementId, visible)),
        selectedIds: visible
          ? cur.selectedIds
          : new Set([...cur.selectedIds].filter((id) => id !== elementId)),
        croppingImageId: cur.croppingImageId === elementId && !visible ? null : cur.croppingImageId,
      }));
    },

    setElementLocked: (elementId, locked) => {
      const s = get();
      pushHistory(s.history, s.doc, locked ? "lock element" : "unlock element");
      set((cur) => ({
        ...mapCurrentSlide(cur, (sl) => setElementLocked(sl, elementId, locked)),
        selectedIds: locked
          ? new Set([...cur.selectedIds].filter((id) => id !== elementId))
          : cur.selectedIds,
      }));
    },

    moveElementZ: (elementId, direction) => {
      const s = get();
      pushHistory(s.history, s.doc, `reorder ${direction}`);
      set((cur) => mapCurrentSlide(cur, (sl) => moveElementZ(sl, elementId, direction)));
    },

    reorderElement: (sourceId, targetId) => {
      const s = get();
      if (sourceId === targetId) return;
      pushHistory(s.history, s.doc, "reorder layers");
      set((cur) => mapCurrentSlide(cur, (sl) => reorderElementsInSlide(sl, sourceId, targetId)));
    },

    renameElement: (elementId, name) => {
      const s = get();
      const trimmed = name.trim();
      if (!trimmed) return;
      const element = s.currentSlide()?.elements.find((e) => e.id === elementId);
      if (!element || element.name === trimmed) return;
      pushHistory(s.history, s.doc, "rename element");
      set((cur) =>
        mapCurrentSlide(cur, (sl) => ({
          ...sl,
          elements: sl.elements.map((e) =>
            e.id === elementId ? { ...e, name: trimmed, version: e.version + 1 } : e,
          ),
          layers: sl.layers.map((l) =>
            l.id === elementId || l.objectIds.includes(elementId) ? { ...l, name: trimmed } : l,
          ),
        })),
      );
    },

    updateElements: (patches, label = "update element") => {
      interactionController.flush();
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => mapDoc(cur, (sl) => applyElementPatches(sl, patches)));
    },

    updateAppearance: (ids, operation, label = "appearance") => {
      interactionController.flush();
      const s = get();
      const slide = s.currentSlide();
      if (!slide) {
        return { ok: false, error: { code: "item_not_found", message: "No current slide" } };
      }
      const prepared = appearancePatchesFor(slide, ids, operation);
      if (!prepared.ok) return prepared;
      if (!prepared.changed) return { ok: true, changed: false };
      pushHistory(s.history, s.doc, label);
      set((cur) => mapDoc(cur, (sl) => applyElementPatches(sl, prepared.patches)));
      return { ok: true, changed: true };
    },

    previewAppearance: (ids, operation) => {
      const s = get();
      const slide = s.currentSlide();
      if (!slide) {
        return { ok: false, error: { code: "item_not_found", message: "No current slide" } };
      }
      const prepared = appearancePatchesFor(slide, ids, operation);
      if (!prepared.ok) return prepared;
      if (!prepared.changed) return { ok: true, changed: false };
      interactionController.preview(prepared.patches);
      return { ok: true, changed: true };
    },

    checkpointInteraction: (label) => {
      const s = get();
      pushHistory(s.history, s.doc, label);
    },

    previewElements: (patches) => {
      interactionController.preview(patches);
    },

    commitInteraction: () => {
      interactionController.flush();
      set((cur) => ({
        doc: { ...cur.doc, updatedAt: nextRevision(cur.doc.updatedAt) },
      }));
    },

    deleteElements: (ids) => {
      if (!ids.length) return;
      const s = get();
      pushHistory(s.history, s.doc, "delete");
      set((cur) =>
        mapDoc(cur, (sl) => {
          const additionalIds = sl.elements
            .filter(
              (el) =>
                el.type === "text" &&
                ids.includes((el as import("./types").TextElement).containerId!),
            )
            .map((el) => el.id);
          const allIds = [...ids, ...additionalIds];
          return recomputeArrowBindings({
            ...sl,
            elements: sl.elements.map((el) =>
              allIds.includes(el.id) ? ({ ...el, isDeleted: true } as EngineElement) : el,
            ),
          });
        }),
      );
      set((cur) => {
        const next = new Set(cur.selectedIds);
        for (const id of ids) next.delete(id);
        const clearsRasterSelection = ids.includes(cur.activeRasterSelection?.imageId ?? "");
        return {
          selectedIds: next,
          croppingImageId: null,
          ...(clearsRasterSelection ? { activeRasterSelection: null } : {}),
        };
      });
    },

    bringToFront: (ids) => {
      const s = get();
      pushHistory(s.history, s.doc, "z-order");
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          const top = nextZ(sl);
          let i = 0;
          return {
            ...sl,
            elements: sl.elements.map((el) =>
              ids.includes(el.id) ? ({ ...el, z: top + i++ } as EngineElement) : el,
            ),
          };
        }),
      );
    },

    sendToBack: (ids) => {
      const s = get();
      pushHistory(s.history, s.doc, "z-order");
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          let minZ = 0;
          for (const el of sl.elements) if (el.z < minZ) minZ = el.z;
          let i = 0;
          return {
            ...sl,
            elements: sl.elements.map((el) =>
              ids.includes(el.id) ? ({ ...el, z: minZ - 1 - i++ } as EngineElement) : el,
            ),
          };
        }),
      );
    },

    bringForward: (ids) => {
      const s = get();
      if (!ids.length) return;
      pushHistory(s.history, s.doc, "z-order");
      const idSet = new Set(ids);
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          const order = [...sl.elements].sort((a, b) => a.z - b.z);
          // Move each selected element up one slot, scanning from top so
          // selected items don't fight each other.
          for (let i = order.length - 2; i >= 0; i--) {
            if (idSet.has(order[i].id) && !idSet.has(order[i + 1].id)) {
              const tmp = order[i];
              order[i] = order[i + 1];
              order[i + 1] = tmp;
            }
          }
          const zMap = new Map<string, number>();
          order.forEach((el, idx) => zMap.set(el.id, idx));
          return {
            ...sl,
            elements: sl.elements.map(
              (el) => ({ ...el, z: zMap.get(el.id) ?? el.z }) as EngineElement,
            ),
          };
        }),
      );
    },

    sendBackward: (ids) => {
      const s = get();
      if (!ids.length) return;
      pushHistory(s.history, s.doc, "z-order");
      const idSet = new Set(ids);
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          const order = [...sl.elements].sort((a, b) => a.z - b.z);
          for (let i = 1; i < order.length; i++) {
            if (idSet.has(order[i].id) && !idSet.has(order[i - 1].id)) {
              const tmp = order[i];
              order[i] = order[i - 1];
              order[i - 1] = tmp;
            }
          }
          const zMap = new Map<string, number>();
          order.forEach((el, idx) => zMap.set(el.id, idx));
          return {
            ...sl,
            elements: sl.elements.map(
              (el) => ({ ...el, z: zMap.get(el.id) ?? el.z }) as EngineElement,
            ),
          };
        }),
      );
    },

    selectAll: () => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const ids = getInteractiveElements(slide).map((el) => el.id);
      set({ selectedIds: new Set(ids) });
    },

    alignSelectedElements: (mode, relativeTo) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const selected = slide.elements.filter(
        (el) => s.selectedIds.has(el.id) && !el.isDeleted && !isObjectLocked(slide, el.id),
      );
      if (!selected.length) return;
      const patches = alignElements(
        selected,
        mode,
        { width: slide.width, height: slide.height },
        relativeTo,
      );
      if (patches.length) s.updateElements(patches);
    },

    distributeSelectedElements: (axis) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const selected = slide.elements.filter(
        (el) => s.selectedIds.has(el.id) && !el.isDeleted && !isObjectLocked(slide, el.id),
      );
      if (selected.length < 3) return;
      const patches = distributeElements(selected, axis);
      if (patches.length) s.updateElements(patches);
    },

    applyBooleanOperation: (op) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      let selected = slide.elements
        .filter(
          (el) =>
            s.selectedIds.has(el.id) &&
            !el.isDeleted &&
            !isObjectLocked(slide, el.id) &&
            isShapeElement(el),
        )
        .sort((a, b) => a.z - b.z);

      // If directly selected shapes < 2, check if selection is a group with 2+ shapes
      if (selected.length < 2) {
        const groupIds = new Set(
          slide.elements
            .filter((el) => s.selectedIds.has(el.id))
            .flatMap((el) => el.groupIds ?? []),
        );
        if (groupIds.size > 0) {
          selected = slide.elements
            .filter(
              (el) =>
                !el.isDeleted &&
                !isObjectLocked(slide, el.id) &&
                isShapeElement(el) &&
                el.groupIds?.some((g) => groupIds.has(g)),
            )
            .sort((a, b) => a.z - b.z);
        }
      }

      if (selected.length < 2) return;

      const outcome = applyBooleanOp(selected, op);
      if (!outcome) return;

      const resultElements = Array.isArray(outcome) ? outcome : [outcome];
      if (resultElements.length === 0) return;

      pushHistory(s.history, s.doc, `pathfinder ${op}`);

      const removedIds = new Set(selected.map((el) => el.id));
      const nextElements = slide.elements.filter((el) => !removedIds.has(el.id));

      for (const res of resultElements) {
        res.z = nextZ({ ...slide, elements: nextElements });
        nextElements.push(res);
      }

      const nextLayers = slide.layers.map((layer) => ({
        ...layer,
        objectIds: layer.objectIds
          .filter((id) => !removedIds.has(id))
          .concat(layer.id === s.activeLayerId ? resultElements.map((r) => r.id) : []),
      }));

      const updatedSlide = {
        ...slide,
        elements: nextElements,
        layers: nextLayers,
      };

      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === slide.id ? updatedSlide : sl)),
          updatedAt: Date.now(),
        },
        selectedIds: new Set(resultElements.map((r) => r.id)),
      }));
    },

    replaceElementsWithMerged: (ids, mergedElement) => {
      if (!ids.length) return;
      const s = get();
      const slide = s.currentSlide();
      if (!slide) return;

      pushHistory(s.history, s.doc, "merge images");

      const removedIds = new Set(ids);
      const nextElements = slide.elements.filter((el) => !removedIds.has(el.id));

      const targetLayer =
        slide.layers.find((layer) => layer.objectIds.some((id) => removedIds.has(id))) ??
        slide.layers.find((layer) => layer.id === s.activeLayerId) ??
        slide.layers[0];
      const targetLayerId = targetLayer?.id;

      mergedElement.z = nextZ({ ...slide, elements: nextElements });
      nextElements.push(mergedElement);

      const nextLayers = slide.layers.map((layer) => ({
        ...layer,
        objectIds: layer.objectIds
          .filter((id) => !removedIds.has(id))
          .concat(layer.id === targetLayerId ? [mergedElement.id] : []),
      }));

      const updatedSlide = recomputeArrowBindings({
        ...slide,
        elements: nextElements,
        layers: nextLayers,
      });

      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === slide.id ? updatedSlide : sl)),
          updatedAt: Date.now(),
        },
        selectedIds: new Set([mergedElement.id]),
      }));
    },

    setFrameImage: (frameId, imageFileId) => {
      const s = get();
      s.updateElements(
        [
          {
            id: frameId,
            patch: {
              imageFileId,
              cropOffsetX: 0,
              cropOffsetY: 0,
              cropZoom: 1,
            },
          },
        ],
        "set frame image",
      );
    },

    setFrameShape: (frameId, shape) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      const frame = slide?.elements.find((el) => el.id === frameId);
      s.updateElements(
        [
          {
            id: frameId,
            patch: {
              shape,
              cornerRadius:
                shape === "roundedRect"
                  ? frame && "cornerRadius" in frame && frame.cornerRadius
                    ? frame.cornerRadius
                    : 24
                  : undefined,
            },
          },
        ],
        "set frame shape",
      );
    },

    detachFrameImage: (frameId) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const frame = slide.elements.find((el) => el.id === frameId);
      if (frame?.type !== "frame" || !frame.imageFileId) return;

      const cached = getCached(frame.imageFileId);
      const naturalW = cached?.width && cached.width > 0 ? cached.width : frame.width;
      const naturalH = cached?.height && cached.height > 0 ? cached.height : frame.height;

      // Preserve natural image aspect ratio based on frame size
      const aspect = naturalW / naturalH;
      let finalW = frame.width;
      let finalH = frame.height;
      if (aspect >= 1) {
        finalW = Math.max(frame.width, frame.height * aspect);
        finalH = finalW / aspect;
      } else {
        finalH = Math.max(frame.height, frame.width / aspect);
        finalW = finalH * aspect;
      }

      const newImage = createImage({
        fileId: frame.imageFileId,
        x: Math.round(frame.x + (frame.width - finalW) / 2 + 20),
        y: Math.round(frame.y + (frame.height - finalH) / 2 + 20),
        width: Math.round(finalW),
        height: Math.round(finalH),
        naturalWidth: naturalW,
        naturalHeight: naturalH,
      });

      pushHistory(s.history, s.doc, "detach frame image");

      const targetLayer = getLayerForObject(slide, frameId) ?? slide.layers[0];
      const nextSlide = targetLayer
        ? addObjectToLayer(slide, newImage, targetLayer.id)
        : { ...slide, elements: [...slide.elements, newImage] };

      const updatedSlide = {
        ...nextSlide,
        elements: nextSlide.elements.map((el) =>
          el.id === frameId
            ? {
                ...el,
                imageFileId: undefined,
                cropOffsetX: 0,
                cropOffsetY: 0,
                cropZoom: 1,
                cropRotation: 0,
              }
            : el,
        ),
      };

      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === slide.id ? updatedSlide : sl)),
          updatedAt: Date.now(),
        },
        selectedIds: new Set([newImage.id]),
      }));
    },

    convertShapeToFrame: (elementId, imageFileId) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return undefined;
      const target = slide.elements.find((el) => el.id === elementId && !el.isDeleted);
      if (!target || !isConvertibleShape(target)) return undefined;

      const frame = convertShapeToFrame(target, imageFileId);

      pushHistory(s.history, s.doc, "convert shape to frame");

      const nextElements = slide.elements.map((el) => (el.id === elementId ? frame : el));
      const nextSlide = { ...slide, elements: nextElements };

      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === slide.id ? nextSlide : sl)),
          updatedAt: Date.now(),
        },
        selectedIds: new Set([frame.id]),
      }));

      return frame;
    },

    addSlide: () => {
      const s = get();
      pushHistory(s.history, s.doc, "add slide");
      const sl = newSlide(`${s.doc.slides.length + 1}`);
      set((cur) => ({
        doc: { ...cur.doc, slides: [...cur.doc.slides, sl], updatedAt: Date.now() },
        currentSlideId: sl.id,
        activeLayerId: sl.layers[0].id,
        selectedIds: new Set(),
      }));
      return sl.id;
    },

    addInfinityCanvasSlide: () => {
      const s = get();
      pushHistory(s.history, s.doc, "add infinity canvas");
      const sl = newSlide(INFINITY_CANVAS_LABEL, SLIDE_KIND_INFINITY_CANVAS);
      set((cur) => ({
        doc: { ...cur.doc, slides: [...cur.doc.slides, sl], updatedAt: Date.now() },
        currentSlideId: sl.id,
        activeLayerId: sl.layers[0].id,
        selectedIds: new Set(),
      }));
      return sl.id;
    },

    groupElements: (ids) => {
      if (ids.length < 2) return;
      const s = get();
      pushHistory(s.history, s.doc, "group");
      const groupId = crypto.randomUUID();
      set((cur) =>
        mapDoc(cur, (sl) => ({
          ...sl,
          elements: sl.elements.map((el) =>
            ids.includes(el.id)
              ? ({ ...el, groupIds: [...el.groupIds, groupId] } as EngineElement)
              : el,
          ),
        })),
      );
    },

    ungroupElements: (ids) => {
      const s = get();
      const slide = s.currentSlide();
      const targets = slide?.elements.filter((el) => ids.includes(el.id) && !el.isDeleted) ?? [];
      if (targets.some((el) => el.type === "vectorized")) return;
      pushHistory(s.history, s.doc, "ungroup");
      set((cur) =>
        mapDoc(cur, (sl) => ({
          ...sl,
          elements: sl.elements.map((el) => {
            if (!ids.includes(el.id)) return el;
            const next = [...el.groupIds];
            next.pop();
            return { ...el, groupIds: next } as EngineElement;
          }),
        })),
      );
    },

    flipHorizontal: (ids) => {
      const state = get();
      if (!ids.length) return;
      const slide = state.currentSlide();
      if (!slide) return;
      const targets = slide.elements.filter(
        (element) =>
          ids.includes(element.id) && !element.isDeleted && !isObjectLocked(slide, element.id),
      );
      if (!targets.length) return;

      pushHistory(state.history, state.doc, "flip horizontal");
      const minX = Math.min(...targets.map((element) => element.x));
      const maxX = Math.max(...targets.map((element) => element.x + element.width));
      const centerX = (minX + maxX) / 2;
      const targetIds = new Set(targets.map((element) => element.id));

      set((cur) => {
        const mapped = mapCurrentSlide(cur, (currentSlide) => {
          const updatedElements = currentSlide.elements.map((element) => {
            if (!targetIds.has(element.id)) return element;
            return {
              ...element,
              x: targets.length > 1 ? 2 * centerX - (element.x + element.width) : element.x,
              angle: element.angle === 0 ? 0 : -element.angle,
              flipX: !element.flipX,
              version: element.version + 1,
            } as EngineElement;
          });
          return recomputeArrowBindings({ ...currentSlide, elements: updatedElements });
        });
        return mapped;
      });
    },

    flipVertical: (ids) => {
      const state = get();
      if (!ids.length) return;
      const slide = state.currentSlide();
      if (!slide) return;
      const targets = slide.elements.filter(
        (element) =>
          ids.includes(element.id) && !element.isDeleted && !isObjectLocked(slide, element.id),
      );
      if (!targets.length) return;

      pushHistory(state.history, state.doc, "flip vertical");
      const minY = Math.min(...targets.map((element) => element.y));
      const maxY = Math.max(...targets.map((element) => element.y + element.height));
      const centerY = (minY + maxY) / 2;
      const targetIds = new Set(targets.map((element) => element.id));

      set((cur) => {
        const mapped = mapCurrentSlide(cur, (currentSlide) => {
          const updatedElements = currentSlide.elements.map((element) => {
            if (!targetIds.has(element.id)) return element;
            return {
              ...element,
              y: targets.length > 1 ? 2 * centerY - (element.y + element.height) : element.y,
              angle: element.angle === 0 ? 0 : -element.angle,
              flipY: !element.flipY,
              version: element.version + 1,
            } as EngineElement;
          });
          return recomputeArrowBindings({ ...currentSlide, elements: updatedElements });
        });
        return mapped;
      });
    },

    copyElements: (ids, options) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const copies = slide.elements
        .filter((el) => ids.includes(el.id) && !el.isDeleted)
        .map((el) => structuredClone(el));
      set({ clipboard: copies });
      if (options?.systemClipboard !== false && copies.length) {
        void publishEngineClipboard(copies);
      }
    },

    cutElements: (ids) => {
      const s = get();
      s.copyElements(ids);
      s.deleteElements(ids);
    },

    pasteElements: () => {
      const clip = get().clipboard;
      if (clip?.length) {
        commitPastedElements(clip);
        return;
      }
      void (async () => {
        const html = await readSystemClipboardHtml();
        if (!html || get().clipboard?.length) return;
        get().pasteClipboardHtml(html);
      })();
    },

    pasteExternalElements: (elements, assets = {}) => {
      if (!elements.length) return;
      const entries = Object.entries(assets).filter((entry): entry is [string, string] =>
        Boolean(entry[1]),
      );
      if (!entries.length) {
        commitPastedElements(elements);
        return;
      }
      void (async () => {
        await Promise.all(
          entries.map(async ([fileId, src]) => {
            try {
              await loadDataURL(src, fileId);
            } catch {
              // fileId-only or unloadable source: the object still pastes.
            }
          }),
        );
        commitPastedElements(elements);
      })();
    },

    pasteClipboardHtml: (html) => {
      const slide = htmlToInternalSlide(html);
      if (slide) {
        void pasteLegacySlide(slide);
        return true;
      }
      const artshift = htmlToArtShiftElements(html);
      if (artshift?.elements.length) {
        get().pasteExternalElements(artshift.elements, artshift.assets);
        return true;
      }
      const objects = htmlToInternalObjects(html);
      if (objects?.length) {
        void (async () => {
          const elements = await legacyObjectsToEngineElements(objects);
          if (elements.length) commitPastedElements(elements);
        })();
        return true;
      }
      return false;
    },

    setSlideBackground: (id, color) => {
      const s = get();
      pushHistory(s.history, s.doc, "slide background");
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === id ? { ...sl, background: color } : sl)),
          updatedAt: Date.now(),
        },
      }));
    },

    renameSlide: (id, name) => {
      const s = get();
      pushHistory(s.history, s.doc, "rename slide");
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === id ? { ...sl, name } : sl)),
          updatedAt: Date.now(),
        },
      }));
    },

    setSlideDimensions: (id, width, height, resizeContents = true) => {
      const s = get();
      pushHistory(s.history, s.doc, "slide dimensions");
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((slide) =>
            slide.id === id ? resizeArtworkSlide(slide, width, height, resizeContents) : slide,
          ),
          updatedAt: Date.now(),
        },
      }));
    },

    createArtworkVariant: (sourceId, width, height, name, resizeContents = true) => {
      const s = get();
      const source = s.doc.slides.find((slide) => slide.id === sourceId);
      if (!source) return "";
      const id = crypto.randomUUID();
      const rootId = source.variantOf ?? source.id;
      const draft: EngineSlide = {
        ...structuredClone(source),
        id,
        name: name ?? `${source.name} · ${Math.round(width)}×${Math.round(height)}`,
        variantOf: rootId,
        variantLabel: `${Math.round(width)}×${Math.round(height)}`,
      };
      const variant = resizeArtworkSlide(draft, width, height, resizeContents);
      pushHistory(s.history, s.doc, "create artwork variant");
      set((cur) => ({
        doc: { ...cur.doc, slides: [...cur.doc.slides, variant], updatedAt: Date.now() },
        currentSlideId: id,
        activeLayerId: variant.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
        selectedIds: new Set(),
      }));
      return id;
    },

    syncElementsToVariants: (ids) => {
      if (!ids.length) return;
      const s = get();
      const sourceSlide = s.currentSlide();
      if (!sourceSlide) return;
      const rootId = sourceSlide.variantOf ?? sourceSlide.id;
      const sources = new Map(
        sourceSlide.elements
          .filter((element) => ids.includes(element.id))
          .map((element) => [element.id, element]),
      );
      if (!sources.size) return;
      pushHistory(s.history, s.doc, "sync artwork variants");
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((slide) => {
            const slideRoot = slide.variantOf ?? slide.id;
            if (slide.id === sourceSlide.id || slideRoot !== rootId) return slide;
            return {
              ...slide,
              elements: slide.elements.map((element) => {
                const source = sources.get(element.id);
                if (!source || source.type !== element.type) return element;
                return syncVariantElementContent(element, source);
              }),
            };
          }),
          updatedAt: Date.now(),
        },
      }));
    },

    setGridSnap: (size) => {
      const s = get();
      pushHistory(s.history, s.doc, "grid snap");
      set((cur) => ({
        doc: {
          ...cur.doc,
          snapGrid: size,
          updatedAt: Date.now(),
        },
      }));
    },

    reorderSlides: (fromIndex, toIndex) => {
      const s = get();
      const slides = s.doc.slides;
      if (fromIndex < 0 || fromIndex >= slides.length) return;
      if (toIndex < 0 || toIndex > slides.length) return;
      if (fromIndex === toIndex) return;
      pushHistory(s.history, s.doc, "reorder slides");
      const next = [...slides];
      const [moved] = next.splice(fromIndex, 1);
      // Adjust toIndex if the removal shifted indices.
      const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
      next.splice(insertAt, 0, moved);
      set((cur) => ({ doc: { ...cur.doc, slides: next, updatedAt: Date.now() } }));
    },

    deleteSlide: (id) => {
      const s = get();
      if (s.doc.slides.length <= 1) return;
      pushHistory(s.history, s.doc, "delete slide");
      set((cur) => {
        const slides = cur.doc.slides.filter((sl) => sl.id !== id);
        const currentSlideId = cur.currentSlideId === id ? slides[0].id : cur.currentSlideId;
        return {
          doc: { ...cur.doc, slides, updatedAt: Date.now() },
          currentSlideId,
          activeLayerId: slides.find((slide) => slide.id === currentSlideId)?.layers[0]?.id ?? "",
          selectedIds: new Set(),
        };
      });
    },

    undo: () => {
      const s = get();
      const transition = historyUndoWithMetadata(s.history, s.doc, s.activeRasterSelection);
      if (!transition) return;
      const prev = transition.doc;
      const stillExists = prev.slides.find((sl) => sl.id === s.currentSlideId);
      set({
        doc: prev,
        currentSlideId: stillExists ? s.currentSlideId : prev.slides[0].id,
        activeLayerId: activeLayerAfterHistory(
          prev,
          stillExists ? s.currentSlideId : prev.slides[0].id,
          s.activeLayerId,
        ),
        selectedIds: new Set(),
        activeRasterSelection:
          transition.rasterSelection === undefined
            ? s.activeRasterSelection
            : transition.rasterSelection,
      });
    },
    redo: () => {
      const s = get();
      const transition = historyRedoWithMetadata(s.history, s.doc, s.activeRasterSelection);
      if (!transition) return;
      const next = transition.doc;
      const stillExists = next.slides.find((sl) => sl.id === s.currentSlideId);
      set({
        doc: next,
        currentSlideId: stillExists ? s.currentSlideId : next.slides[0].id,
        activeLayerId: activeLayerAfterHistory(
          next,
          stillExists ? s.currentSlideId : next.slides[0].id,
          s.activeLayerId,
        ),
        selectedIds: new Set(),
        activeRasterSelection:
          transition.rasterSelection === undefined
            ? s.activeRasterSelection
            : transition.rasterSelection,
      });
    },

    loadDoc: (doc) => {
      interactionController.cancel();
      // Clear renderer cache so stale bitmaps aren't reused.
      import("@/lib/renderer/cache").then((m) => m.clearElementCache?.());
      const normalized = normalizeDocumentLayers(doc);
      set({
        doc: normalized,
        currentSlideId: normalized.slides[0]?.id ?? "",
        activeLayerId: normalized.slides[0]?.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
        selectedIds: new Set(),
        history: createHistory(),
        smartArrangePreview: null,
        croppingImageId: null,
        activeRasterSelection: null,
      });
    },
    setDocTitle: (title) => {
      set((cur) => ({
        doc: {
          ...cur.doc,
          title,
          updatedAt: Date.now(),
        },
      }));
    },
    croppingImageId: null,
    setCroppingImageId: (id) => set({ croppingImageId: id }),
  };
});

// ——— internals ———

function mapDoc(
  state: EngineState,
  fn: (slide: EngineSlide) => EngineSlide,
  touchRevision = true,
): Partial<EngineState> {
  return {
    doc: mapCurrentSlide(state, fn, touchRevision).doc,
  };
}

function nextLayerZ(layers: EngineLayer[]): number {
  return layers.reduce((max, layer) => Math.max(max, layer.z), 0) + 1;
}

export function cloneElementsForDuplicate(
  source: EngineElement[],
  offsetX = 0,
  offsetY = 0,
): EngineElement[] {
  const idMap = new Map(source.map((element) => [element.id, crypto.randomUUID()]));
  const groupMap = new Map<string, string>();
  for (const element of source) {
    for (const groupId of element.groupIds) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, crypto.randomUUID());
    }
  }

  return source.map((sourceElement) => {
    const element = structuredClone(sourceElement);
    element.id = idMap.get(sourceElement.id)!;
    element.x += offsetX;
    element.y += offsetY;
    element.groupIds = element.groupIds.map((id) => groupMap.get(id) ?? id);

    if (element.type === "arrow") {
      element.startBinding = remapBinding(element.startBinding, idMap);
      element.endBinding = remapBinding(element.endBinding, idMap);
    } else if (element.type === "text" && element.containerId) {
      element.containerId = idMap.get(element.containerId) ?? null;
    } else if (element.type === "frame") {
      element.childIds = element.childIds.flatMap((id) => {
        const remapped = idMap.get(id);
        return remapped ? [remapped] : [];
      });
    }

    return element;
  });
}

function cloneElementsForPaste(source: EngineElement[]): EngineElement[] {
  return cloneElementsForDuplicate(source, 20, 20);
}

/** Keep pasted geometry visible on the destination slide (cross-slide paste). */
export function clampElementsToSlide(
  elements: EngineElement[],
  slideWidth: number,
  slideHeight: number,
  margin = 8,
): EngineElement[] {
  const maxW = Math.max(margin * 2, slideWidth);
  const maxH = Math.max(margin * 2, slideHeight);
  return elements.map((element) => {
    const next = structuredClone(element);
    const width = Math.max(1, Math.min(next.width, maxW - margin * 2));
    const height = Math.max(1, Math.min(next.height, maxH - margin * 2));
    next.width = width;
    next.height = height;
    next.x = Math.min(Math.max(margin, next.x), maxW - width - margin);
    next.y = Math.min(Math.max(margin, next.y), maxH - height - margin);
    return next;
  });
}

function remapBinding<T extends { elementId: string }>(
  binding: T | null,
  idMap: Map<string, string>,
): T | null {
  if (!binding) return null;
  const elementId = idMap.get(binding.elementId);
  return elementId ? { ...binding, elementId } : null;
}

function syncVariantElementContent(target: EngineElement, source: EngineElement): EngineElement {
  const synced = structuredClone(source);
  return {
    ...synced,
    id: target.id,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    angle: target.angle,
    z: target.z,
    isDeleted: target.isDeleted,
    version: target.version + 1,
  } as EngineElement;
}

function activeLayerAfterHistory(doc: EngineDoc, slideId: string, preferredId: string): string {
  const slide = doc.slides.find((candidate) => candidate.id === slideId);
  if (!slide) return "";
  if (slide.layers.some((layer) => layer.id === preferredId)) return preferredId;
  return slide.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "";
}

function mapCurrentSlide(
  state: EngineState,
  fn: (slide: EngineSlide) => EngineSlide,
  touchRevision = true,
): { doc: EngineDoc } {
  const slides = state.doc.slides.map((sl) => (sl.id === state.currentSlideId ? fn(sl) : sl));
  return {
    doc: {
      ...state.doc,
      slides,
      updatedAt: touchRevision ? nextRevision(state.doc.updatedAt) : state.doc.updatedAt,
    },
  };
}

function nextRevision(previous: number): number {
  return Math.max(Date.now(), previous + 1);
}

function appearancePatchesFor(
  slide: EngineSlide,
  ids: string[],
  operation: AppearanceOperation | ((element: EngineElement) => AppearanceOperation | null),
):
  | {
      ok: true;
      changed: boolean;
      patches: Array<{ id: string; patch: Partial<EngineElement> }>;
    }
  | { ok: false; error: AppearanceError } {
  const patches: Array<{ id: string; patch: Partial<EngineElement> }> = [];
  for (const id of ids) {
    const element = slide.elements.find((candidate) => candidate.id === id && !candidate.isDeleted);
    if (!element) {
      return { ok: false, error: { code: "item_not_found", message: `Element ${id} not found` } };
    }
    const resolved = typeof operation === "function" ? operation(element) : operation;
    if (!resolved) continue;
    const result = changeAppearance(element, resolved);
    if (!result.ok) return result;
    if (!result.changed) continue;
    const patch: Partial<EngineElement> = appearanceElementPatch(result.appearance, element);
    if (result.element.type === "text") {
      const spacing = (result.element as import("./types").TextElement).letterSpacingEm;
      if (spacing !== undefined) {
        (patch as Partial<import("./types").TextElement>).letterSpacingEm = spacing;
      }
    }
    patches.push({ id, patch });
  }
  return { ok: true, changed: patches.length > 0, patches };
}

function applyElementPatches(
  slide: EngineSlide,
  patches: Array<{ id: string; patch: Partial<EngineElement> }>,
): EngineSlide {
  const normalizedPatches = patches.map((item) => {
    const element = slide.elements.find((candidate) => candidate.id === item.id);
    if (!element) return item;
    if (element.type === "text") {
      return {
        ...item,
        patch: normalizeTextPatch(element, item.patch as Partial<TextElement>),
      };
    }
    if (!isMediaElement(element)) return item;
    return {
      ...item,
      patch: normalizeMediaPatch(element, item.patch, {
        artwork: { x: 0, y: 0, width: slide.width, height: slide.height },
      }),
    };
  });
  const additionalPatches: Array<{ id: string; patch: Partial<EngineElement> }> = [];
  for (const item of normalizedPatches) {
    const boundTexts = slide.elements.filter(
      (element) =>
        element.type === "text" &&
        (element as import("./types").TextElement).containerId === item.id,
    );
    for (const textElement of boundTexts) {
      const patch: Partial<EngineElement> = {};
      if (item.patch.x !== undefined) patch.x = item.patch.x;
      if (item.patch.y !== undefined) patch.y = item.patch.y;
      if (item.patch.width !== undefined) patch.width = item.patch.width;
      if (item.patch.height !== undefined) patch.height = item.patch.height;
      if (item.patch.angle !== undefined) patch.angle = item.patch.angle;
      if (item.patch.isDeleted !== undefined) patch.isDeleted = item.patch.isDeleted;
      if (Object.keys(patch).length > 0) {
        additionalPatches.push({ id: textElement.id, patch });
      }
    }
  }
  const allPatches = [...normalizedPatches, ...additionalPatches];
  const patchedSlide: EngineSlide = {
    ...slide,
    elements: slide.elements.map((element) => {
      const item = allPatches.find((candidate) => candidate.id === element.id);
      if (!item) return element;
      const merged = {
        ...element,
        ...item.patch,
        version: shouldInvalidateElementRender(item.patch) ? element.version + 1 : element.version,
      } as EngineElement;
      return syncElementAppearance(element, merged, item.patch);
    }),
  };
  return recomputeArrowBindings(patchedSlide);
}

const VIEWPORT_ONLY_PATCH_KEYS = new Set([
  "x",
  "y",
  "angle",
  "z",
  "opacity",
  "blendMode",
  "hidden",
  "visible",
  "isDeleted",
  "locked",
  "name",
  "groupIds",
]);

function shouldInvalidateElementRender(patch: Partial<EngineElement>): boolean {
  return Object.keys(patch).some((key) => !VIEWPORT_ONLY_PATCH_KEYS.has(key));
}
