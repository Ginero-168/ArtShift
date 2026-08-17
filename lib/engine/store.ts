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
import type { TemplateResult } from "../templates";
import { type AlignMode, alignElements, type DistributeAxis, distributeElements } from "./align";
import { recomputeArrowBindings } from "./binding";
import { createImage } from "./factory";
import { convertShapeToFrame, isConvertibleShape } from "./frameMask";
import { blockRectForPlacement, getHexGridDimensions } from "./hexLayout";
import {
  createHistory,
  type HistoryState,
  redo as historyRedo,
  undo as historyUndo,
  pushHistory,
} from "./history";
import { getCached } from "./imageCache";
import {
  addObjectToLayer,
  commitBlockObject,
  convertLayerMode,
  createEngineLayer,
  getInteractiveElements,
  getLayerForObject,
  isObjectLocked,
  moveElementZ,
  moveObjectsToLayer as moveObjectsToLayerModel,
  normalizeDocumentLayers,
  reflowBlockObjects,
  reorderElementsInSlide,
  setBlockPlacement,
  setElementLocked,
  setElementVisibility,
  setObjectLayoutMode,
  toggleObjectLayoutMode,
} from "./layers";
import { isMediaElement, normalizeMediaPatch } from "./mediaLayout";
import { resizeArtworkSlide } from "./resizeArtwork";
import { applyTemplateToSlide, type TemplateApplyMode } from "./templateApplication";
import { measureTextElementHeight } from "./textLayout";
import {
  type BlockPlacement,
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineLayer,
  type EngineSlide,
  type FrameElement,
  type FrameMaskShape,
  type LayerMode,
  SLIDE_H,
  SLIDE_W,
  type TextElement,
  type WorkspaceStrictness,
} from "./types";
import {
  applyBooleanOperation as applyBooleanOp,
  type BooleanOperation,
  isShapeElement,
} from "./vectorBoolean";

export type Tool =
  | "select"
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
  | "frame";

export type LayerFilter = "all" | "block" | "free";
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
  tool: Tool;
  lineSubtype: LineSubtype;
  history: HistoryState;
  /** Whether the hex block grid overlay is visible on the canvas. */
  showHexGrid: boolean;
  /** Viewport layer filter: show all, block-only, or free-only elements. */
  layerFilter: LayerFilter;

  // ——— selectors (call as plain functions; they rely on getState) ———
  currentSlide: () => EngineSlide | undefined;

  // ——— mutators ———
  setTool: (t: Tool) => void;
  setLineSubtype: (subtype: LineSubtype) => void;
  setCurrentSlide: (id: string) => void;
  setActiveLayer: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  addElement: (el: EngineElement, label?: string) => void;
  addElements: (elements: EngineElement[], label?: string) => void;
  applyTemplate: (result: TemplateResult, mode?: TemplateApplyMode, label?: string) => void;
  /** Snap an Object in a Block layer and move collisions according to Strictness. */
  commitBlockLayout: (id: string) => void;
  updateBlockPlacement: (id: string, patch: Partial<BlockPlacement>) => void;
  addLayer: (mode: LayerMode) => string;
  renameLayer: (id: string, name: string) => void;
  setLayerMode: (id: string, mode: LayerMode) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerLocked: (id: string, locked: boolean) => void;
  moveLayer: (id: string, direction: "forward" | "backward") => void;
  moveObjectsToLayer: (ids: string[], layerId: string) => void;
  toggleObjectLayoutMode: (elementId: string) => void;
  setObjectLayoutMode: (elementId: string, mode: LayerMode) => void;
  setElementVisibility: (elementId: string, visible: boolean) => void;
  setElementLocked: (elementId: string, locked: boolean) => void;
  moveElementZ: (elementId: string, direction: "forward" | "backward" | "front" | "back") => void;
  reorderElement: (sourceId: string, targetId: string) => void;
  renameElement: (elementId: string, name: string) => void;
  setWorkspaceStrictness: (strictness: WorkspaceStrictness, customValue?: number) => void;
  setStrictnessValue: (level: 2 | 3, value: number) => void;
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label?: string,
  ) => void;
  /** One undo snapshot at the beginning of a pointer interaction. */
  checkpointInteraction: (label: string) => void;
  /** Live geometry update that intentionally does not add another undo step. */
  previewElements: (patches: Array<{ id: string; patch: Partial<EngineElement> }>) => void;
  deleteElements: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  selectAll: () => void;
  alignSelectedElements: (mode: AlignMode, relativeTo?: "selection" | "slide") => void;
  distributeSelectedElements: (axis: DistributeAxis) => void;
  applyBooleanOperation: (op: BooleanOperation) => void;
  setFrameImage: (frameId: string, imageFileId: string | undefined) => void;
  setFrameShape: (frameId: string, shape: FrameMaskShape) => void;
  detachFrameImage: (frameId: string) => void;
  convertShapeToFrame: (elementId: string, imageFileId?: string) => FrameElement | undefined;

  addSlide: () => string;
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
  copyElements: (ids: string[]) => void;
  cutElements: (ids: string[]) => void;
  pasteElements: () => void;

  undo: () => void;
  redo: () => void;
  /** Replace the entire document (e.g. on file open). */
  loadDoc: (doc: EngineDoc) => void;
  setGridSnap: (size: number | null) => void;
  setShowHexGrid: (show: boolean) => void;
  setLayerFilter: (filter: LayerFilter) => void;
  croppingImageId: string | null;
  setCroppingImageId: (id: string | null) => void;
};

function newSlide(name: string): EngineSlide {
  // Absolute placement is the least surprising default for a precision editor.
  // Block layout remains available as an explicit Layer-level behavior.
  const layer = createEngineLayer("free", { name: "Free layer 1" });
  return {
    id: crypto.randomUUID(),
    name,
    background: "#ffffff",
    elements: [],
    layers: [layer],
    width: SLIDE_W,
    height: SLIDE_H,
  };
}

function emptyDoc(): EngineDoc {
  const slide = newSlide("1");
  return {
    id: crypto.randomUUID(),
    title: "Untitled",
    width: SLIDE_W,
    height: SLIDE_H,
    slides: [slide],
    snapGrid: null,
    workspaceStrictness: 1,
    strictnessLevel: 1,
    strictnessValues: { 2: 1, 3: 2 },
    updatedAt: Date.now(),
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

function nextZ(slide: EngineSlide): number {
  let z = 0;
  for (const el of slide.elements) if (el.z > z) z = el.z;
  return z + 1;
}

export const useEngine = create<EngineState>((set, get) => {
  const initial = emptyDoc();
  return {
    doc: initial,
    currentSlideId: initial.slides[0].id,
    activeLayerId: initial.slides[0].layers[0].id,
    selectedIds: new Set<string>(),
    tool: "select" as Tool,
    clipboard: null as EngineElement[] | null,
    history: createHistory(),
    showHexGrid: true,
    layerFilter: "all" as LayerFilter,
    lineSubtype: "solid" as LineSubtype,

    currentSlide: () => {
      const s = get();
      return s.doc.slides.find((sl) => sl.id === s.currentSlideId);
    },

    setTool: (tool) => set({ tool }),
    setLineSubtype: (lineSubtype) => set({ lineSubtype }),
    setCurrentSlide: (id) =>
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === id);
        return {
          currentSlideId: id,
          activeLayerId: slide?.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
          selectedIds: new Set(),
        };
      }),
    setActiveLayer: (id) =>
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
        if (!slide?.layers.some((layer) => layer.id === id)) return state;
        return { activeLayerId: id, selectedIds: new Set(), croppingImageId: null };
      }),

    selectOnly: (ids) =>
      set((state) => {
        const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
        const layer = ids[0] && slide ? getLayerForObject(slide, ids[0]) : undefined;
        return {
          selectedIds: new Set(ids),
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
          activeLayerId: layer?.id ?? s.activeLayerId,
          croppingImageId: null,
        };
      }),
    clearSelection: () => set({ selectedIds: new Set(), croppingImageId: null }),

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
          return recomputeArrowBindings(
            addObjectToLayer(sl, added, layerId, cur.doc.workspaceStrictness),
          );
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
            next = addObjectToLayer(next, added, layerId, cur.doc.workspaceStrictness);
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

    commitBlockLayout: (id) => {
      set((cur) =>
        mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings(commitBlockObject(sl, id, cur.doc.workspaceStrictness)),
        ),
      );
    },

    updateBlockPlacement: (id, patch) => {
      const s = get();
      pushHistory(s.history, s.doc, "resize block");
      set((cur) =>
        mapCurrentSlide(cur, (current) =>
          recomputeArrowBindings(
            setBlockPlacement(current, id, patch, cur.doc.workspaceStrictness),
          ),
        ),
      );
    },

    addLayer: (mode) => {
      const s = get();
      const slide = s.currentSlide();
      const sameModeCount = slide?.layers.filter((layer) => layer.mode === mode).length ?? 0;
      const layer = createEngineLayer(mode, {
        name: `${mode === "block" ? "Block" : "Free"} layer ${sameModeCount + 1}`,
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

    setLayerMode: (id, mode) => {
      const s = get();
      const layer = s.currentSlide()?.layers.find((candidate) => candidate.id === id);
      if (!layer || layer.mode === mode) return;
      pushHistory(s.history, s.doc, `change layer to ${mode}`);
      set((cur) =>
        mapCurrentSlide(cur, (slide) =>
          recomputeArrowBindings(convertLayerMode(slide, id, mode, cur.doc.workspaceStrictness)),
        ),
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
          recomputeArrowBindings(
            moveObjectsToLayerModel(slide, ids, layerId, cur.doc.workspaceStrictness),
          ),
        ),
        activeLayerId: layerId,
      }));
    },

    toggleObjectLayoutMode: (elementId) => {
      const s = get();
      const slide = s.currentSlide();
      if (!slide) return;
      const element = slide.elements.find((e) => e.id === elementId);
      if (!element) return;
      const currentMode = element.layoutMode ?? "block";
      const nextMode = currentMode === "block" ? "free" : "block";
      pushHistory(s.history, s.doc, `change to ${nextMode}`);
      set((cur) =>
        mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings(
            toggleObjectLayoutMode(sl, elementId, cur.doc.workspaceStrictness),
          ),
        ),
      );
    },

    setObjectLayoutMode: (elementId, mode) => {
      const s = get();
      const slide = s.currentSlide();
      if (!slide) return;
      const element = slide.elements.find((e) => e.id === elementId);
      if (!element || element.layoutMode === mode) return;
      pushHistory(s.history, s.doc, `change to ${mode}`);
      set((cur) =>
        mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings(
            setObjectLayoutMode(sl, elementId, mode, cur.doc.workspaceStrictness),
          ),
        ),
      );
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

    setWorkspaceStrictness: (levelOrStrictness, customValue) => {
      const s = get();
      const doc = s.doc;
      const currentValues = doc.strictnessValues ?? { 2: 1, 3: 2 };
      let level: 1 | 2 | 3 = 1;
      let effectiveStrictness = 1;
      const nextValues = { ...currentValues };

      if (levelOrStrictness === 1) {
        level = 1;
        effectiveStrictness = 1;
      } else if (levelOrStrictness === 2) {
        level = 2;
        const val =
          customValue !== undefined
            ? Math.max(1, Math.min(99, customValue))
            : (currentValues[2] ?? 1);
        nextValues[2] = val;
        effectiveStrictness = val + 1;
      } else if (levelOrStrictness === 3) {
        level = 3;
        const val =
          customValue !== undefined
            ? Math.max(1, Math.min(99, customValue))
            : (currentValues[3] ?? 2);
        nextValues[3] = val;
        effectiveStrictness = val + 1;
      } else {
        effectiveStrictness = Math.max(1, levelOrStrictness);
        level = effectiveStrictness === 1 ? 1 : effectiveStrictness === 2 ? 2 : 3;
      }

      if (
        doc.workspaceStrictness === effectiveStrictness &&
        doc.strictnessLevel === level &&
        doc.strictnessValues?.[2] === nextValues[2] &&
        doc.strictnessValues?.[3] === nextValues[3]
      ) {
        return;
      }

      pushHistory(s.history, s.doc, "workspace strictness");
      set((cur) => ({
        doc: {
          ...cur.doc,
          workspaceStrictness: effectiveStrictness,
          strictnessLevel: level,
          strictnessValues: nextValues,
          slides: cur.doc.slides.map((slide) =>
            recomputeArrowBindings(reflowBlockObjects(slide, effectiveStrictness)),
          ),
          updatedAt: Date.now(),
        },
      }));
    },

    setStrictnessValue: (level, value) => {
      const s = get();
      const doc = s.doc;
      const currentValues = doc.strictnessValues ?? { 2: 1, 3: 2 };
      const safeVal = Math.max(1, Math.min(99, Math.round(value) || 1));
      const nextValues = { ...currentValues, [level]: safeVal };
      const activeLevel =
        doc.strictnessLevel ??
        (doc.workspaceStrictness === 1 ? 1 : doc.workspaceStrictness === 2 ? 2 : 3);
      const effectiveStrictness =
        activeLevel === 1 ? 1 : (nextValues[activeLevel as 2 | 3] ?? 1) + 1;

      pushHistory(s.history, s.doc, "workspace strictness");
      set((cur) => ({
        doc: {
          ...cur.doc,
          workspaceStrictness: effectiveStrictness,
          strictnessValues: nextValues,
          slides: cur.doc.slides.map((slide) =>
            recomputeArrowBindings(reflowBlockObjects(slide, effectiveStrictness)),
          ),
          updatedAt: Date.now(),
        },
      }));
    },

    updateElements: (patches, label = "update element") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) =>
        mapDoc(cur, (sl) => applyElementPatches(sl, patches, cur.doc.workspaceStrictness)),
      );
    },

    checkpointInteraction: (label) => {
      const s = get();
      pushHistory(s.history, s.doc, label);
    },

    previewElements: (patches) => {
      set((cur) =>
        mapDoc(cur, (sl) => applyElementPatches(sl, patches, cur.doc.workspaceStrictness)),
      );
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
        return { selectedIds: next, croppingImageId: null };
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
        ? addObjectToLayer(slide, newImage, targetLayer.id, s.doc.workspaceStrictness)
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
      const s = get();
      if (!ids.length) return;
      pushHistory(s.history, s.doc, "flip horizontal");
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const targets = slide.elements.filter(
        (el) => ids.includes(el.id) && !el.isDeleted && !isObjectLocked(slide, el.id),
      );
      if (!targets.length) return;
      // Mirror around AABB center of the selection.
      let minX = Infinity;
      let maxX = -Infinity;
      for (const el of targets) {
        if (el.x < minX) minX = el.x;
        if (el.x + el.width > maxX) maxX = el.x + el.width;
      }
      const cx = (minX + maxX) / 2;
      const flipMap = new Map<string, EngineElement>();
      for (const el of targets) {
        let next: EngineElement = { ...el, x: 2 * cx - (el.x + el.width), angle: -el.angle };
        if (el.type === "line" || el.type === "arrow") {
          const pts = el.points.map(([px, py]) => [el.width - px, py] as [number, number]);
          next = { ...next, points: pts } as EngineElement;
        } else if (el.type === "freedraw") {
          const pts = el.points.map(
            ([px, py, pr]) => [el.width - px, py, pr] as [number, number, number],
          );
          next = { ...next, points: pts } as EngineElement;
        }
        flipMap.set(el.id, next);
      }
      set((cur) =>
        mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings({
            ...sl,
            elements: sl.elements.map((el) => flipMap.get(el.id) ?? el),
          }),
        ),
      );
    },

    flipVertical: (ids) => {
      const s = get();
      if (!ids.length) return;
      pushHistory(s.history, s.doc, "flip vertical");
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const targets = slide.elements.filter(
        (el) => ids.includes(el.id) && !el.isDeleted && !isObjectLocked(slide, el.id),
      );
      if (!targets.length) return;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const el of targets) {
        if (el.y < minY) minY = el.y;
        if (el.y + el.height > maxY) maxY = el.y + el.height;
      }
      const cy = (minY + maxY) / 2;
      const flipMap = new Map<string, EngineElement>();
      for (const el of targets) {
        let next: EngineElement = { ...el, y: 2 * cy - (el.y + el.height), angle: -el.angle };
        if (el.type === "line" || el.type === "arrow") {
          const pts = el.points.map(([px, py]) => [px, el.height - py] as [number, number]);
          next = { ...next, points: pts } as EngineElement;
        } else if (el.type === "freedraw") {
          const pts = el.points.map(
            ([px, py, pr]) => [px, el.height - py, pr] as [number, number, number],
          );
          next = { ...next, points: pts } as EngineElement;
        }
        flipMap.set(el.id, next);
      }
      set((cur) =>
        mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings({
            ...sl,
            elements: sl.elements.map((el) => flipMap.get(el.id) ?? el),
          }),
        ),
      );
    },

    copyElements: (ids) => {
      const s = get();
      const slide = s.doc.slides.find((sl) => sl.id === s.currentSlideId);
      if (!slide) return;
      const copies = slide.elements
        .filter((el) => ids.includes(el.id) && !el.isDeleted)
        .map((el) => structuredClone(el));
      set({ clipboard: copies });
    },

    cutElements: (ids) => {
      const s = get();
      s.copyElements(ids);
      s.deleteElements(ids);
    },

    pasteElements: () => {
      const s = get();
      const clip = s.clipboard;
      if (!clip?.length) return;
      pushHistory(s.history, s.doc, "paste");
      const pasted = cloneElementsForPaste(clip);
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          let next = sl;
          const layerId = sl.layers.some((layer) => layer.id === cur.activeLayerId)
            ? cur.activeLayerId
            : sl.layers[0]?.id;
          if (!layerId) return sl;
          for (const el of pasted) {
            el.z = nextZ(next);
            next = addObjectToLayer(next, el, layerId, cur.doc.workspaceStrictness);
          }
          return recomputeArrowBindings(next);
        }),
      );
      if (pasted.length) set({ selectedIds: new Set(pasted.map((e) => e.id)) });
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
            slide.id === id
              ? resizeArtworkSlide(
                  slide,
                  width,
                  height,
                  cur.doc.workspaceStrictness,
                  resizeContents,
                )
              : slide,
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
      const variant = resizeArtworkSlide(
        draft,
        width,
        height,
        s.doc.workspaceStrictness,
        resizeContents,
      );
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

    setShowHexGrid: (show) => set({ showHexGrid: show }),
    setLayerFilter: (filter) => set({ layerFilter: filter }),

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
      const prev = historyUndo(s.history, s.doc);
      if (!prev) return;
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
      });
    },
    redo: () => {
      const s = get();
      const next = historyRedo(s.history, s.doc);
      if (!next) return;
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
      });
    },

    loadDoc: (doc) => {
      // Clear renderer cache so stale bitmaps aren't reused.
      import("@/lib/renderer/cache").then((m) => m.clearElementCache?.());
      const normalized = normalizeDocumentLayers(doc);
      set({
        doc: normalized,
        currentSlideId: normalized.slides[0]?.id ?? "",
        activeLayerId: normalized.slides[0]?.layers.toSorted((a, b) => b.z - a.z)[0]?.id ?? "",
        selectedIds: new Set(),
        history: createHistory(),
        croppingImageId: null,
      });
    },
    croppingImageId: null,
    setCroppingImageId: (id) => set({ croppingImageId: id }),
  };
});

// ——— internals ———

function mapDoc(state: EngineState, fn: (slide: EngineSlide) => EngineSlide): Partial<EngineState> {
  return {
    doc: mapCurrentSlide(state, fn).doc,
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
): { doc: EngineDoc } {
  const slides = state.doc.slides.map((sl) => (sl.id === state.currentSlideId ? fn(sl) : sl));
  return { doc: { ...state.doc, slides, updatedAt: Date.now() } };
}

function applyElementPatches(
  slide: EngineSlide,
  patches: Array<{ id: string; patch: Partial<EngineElement> }>,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const normalizedPatches = patches.map((item) => {
    const element = slide.elements.find((candidate) => candidate.id === item.id);
    if (!element) return item;
    const layer = getLayerForObject(slide, element.id);
    if (element.type === "text" && layer?.mode !== "block" && !element.containerId) {
      const next = { ...element, ...item.patch } as TextElement;
      return {
        ...item,
        patch: {
          ...item.patch,
          height: Math.max(next.height, measureTextElementHeight(next)),
        },
      };
    }
    if (!isMediaElement(element)) return item;
    const placement = layer?.mode === "block" ? layer.placements[element.id] : undefined;
    const container = placement
      ? blockRectForPlacement(placement, slide.width, slide.height)
      : undefined;
    return {
      ...item,
      patch: normalizeMediaPatch(element, item.patch, {
        container,
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
  const patchedIds = new Set(allPatches.map((item) => item.id));
  const patchedSlide: EngineSlide = {
    ...slide,
    elements: slide.elements.map((element) => {
      const item = allPatches.find((candidate) => candidate.id === element.id);
      return item
        ? ({ ...element, ...item.patch, version: element.version + 1 } as EngineElement)
        : element;
    }),
  };
  return recomputeArrowBindings(growBlockTextPlacements(patchedSlide, patchedIds, strictness));
}

function growBlockTextPlacements(
  slide: EngineSlide,
  patchedIds: Set<string>,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const grid = getHexGridDimensions(slide.width, slide.height);
  const byId = new Map(slide.elements.map((element) => [element.id, element]));
  let changed = false;
  const layers = slide.layers.map((layer) => {
    if (layer.mode !== "block") return layer;
    const placements = { ...layer.placements };
    let layerChanged = false;
    for (const id of layer.objectIds) {
      if (!patchedIds.has(id)) continue;
      const element = byId.get(id);
      const placement = placements[id];
      if (element?.type !== "text" || !placement) continue;
      const rect = blockRectForPlacement(placement, slide.width, slide.height);
      const requiredHeight = measureTextElementHeight({
        ...element,
        width: rect.width,
        height: rect.height,
      });
      let rowSpan = placement.rowSpan;
      const maxRowSpan = Math.max(1, grid.rows - placement.row);
      while (
        rowSpan < maxRowSpan &&
        blockRectForPlacement({ ...placement, rowSpan }, slide.width, slide.height).height <
          requiredHeight
      ) {
        rowSpan += 1;
      }
      if (rowSpan !== placement.rowSpan) {
        placements[id] = { ...placement, rowSpan };
        layerChanged = true;
        changed = true;
      }
    }
    return layerChanged ? { ...layer, placements } : layer;
  });
  return changed ? reflowBlockObjects({ ...slide, layers }, strictness) : slide;
}
