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
import { recomputeArrowBindings } from "./binding";
import { blockRectForPlacement } from "./hexLayout";
import {
  createHistory,
  type HistoryState,
  redo as historyRedo,
  undo as historyUndo,
  pushHistory,
} from "./history";
import {
  addObjectToLayer,
  commitBlockObject,
  convertLayerMode,
  createEngineLayer,
  getInteractiveElements,
  getLayerForObject,
  isObjectLocked,
  moveObjectsToLayer as moveObjectsToLayerModel,
  normalizeDocumentLayers,
  reflowBlockObjects,
  remapBlockLayersToArtwork,
  setBlockPlacement,
} from "./layers";
import { isMediaElement, normalizeMediaPatch } from "./mediaLayout";
import {
  type BlockPlacement,
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineLayer,
  type EngineSlide,
  type LayerMode,
  SLIDE_H,
  SLIDE_W,
  type WorkspaceStrictness,
} from "./types";

export type Tool =
  | "select"
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
  | "text"
  | "image"
  | "eraser"
  | "frame";

export type EngineState = {
  doc: EngineDoc;
  currentSlideId: string;
  activeLayerId: string;
  selectedIds: Set<string>;
  tool: Tool;
  history: HistoryState;

  // ——— selectors (call as plain functions; they rely on getState) ———
  currentSlide: () => EngineSlide | undefined;

  // ——— mutators ———
  setTool: (t: Tool) => void;
  setCurrentSlide: (id: string) => void;
  setActiveLayer: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  addElement: (el: EngineElement, label?: string) => void;
  /** Snap an Object in a Block layer and move collisions according to Strictness. */
  commitBlockLayout: (id: string) => void;
  updateBlockPlacement: (id: string, patch: Partial<BlockPlacement>) => void;
  addLayer: (mode: LayerMode) => string;
  setLayerMode: (id: string, mode: LayerMode) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerLocked: (id: string, locked: boolean) => void;
  moveLayer: (id: string, direction: "forward" | "backward") => void;
  moveObjectsToLayer: (ids: string[], layerId: string) => void;
  setWorkspaceStrictness: (strictness: WorkspaceStrictness) => void;
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

  addSlide: () => string;
  deleteSlide: (id: string) => void;
  renameSlide: (id: string, name: string) => void;
  setSlideBackground: (id: string, color: string) => void;
  setSlideDimensions: (id: string, width: number, height: number, resizeContents?: boolean) => void;
  reorderSlides: (fromIndex: number, toIndex: number) => void;

  groupElements: (ids: string[]) => void;
  ungroupElements: (ids: string[]) => void;
  flipHorizontal: (ids: string[]) => void;
  flipVertical: (ids: string[]) => void;

  /** In-memory clipboard of elements (deep clones without ids). */
  clipboard: EngineElement[] | null;
  copyElements: (ids: string[]) => void;
  cutElements: (ids: string[]) => void;
  pasteElements: () => void;

  undo: () => void;
  redo: () => void;
  /** Replace the entire document (e.g. on file open). */
  loadDoc: (doc: EngineDoc) => void;
  setGridSnap: (size: number | null) => void;
  croppingImageId: string | null;
  setCroppingImageId: (id: string | null) => void;
};

function newSlide(name: string): EngineSlide {
  const layer = createEngineLayer("block", { name: "Block layer 1" });
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

    currentSlide: () => {
      const s = get();
      return s.doc.slides.find((sl) => sl.id === s.currentSlideId);
    },

    setTool: (tool) => set({ tool }),
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

    setWorkspaceStrictness: (strictness) => {
      const s = get();
      if (s.doc.workspaceStrictness === strictness) return;
      pushHistory(s.history, s.doc, "workspace strictness");
      set((cur) => ({
        doc: {
          ...cur.doc,
          workspaceStrictness: strictness,
          slides: cur.doc.slides.map((slide) => reflowBlockObjects(slide, strictness)),
          updatedAt: Date.now(),
        },
      }));
    },

    updateElements: (patches, label = "update element") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => mapDoc(cur, (sl) => applyElementPatches(sl, patches)));
    },

    checkpointInteraction: (label) => {
      const s = get();
      pushHistory(s.history, s.doc, label);
    },

    previewElements: (patches) => {
      set((cur) => mapDoc(cur, (sl) => applyElementPatches(sl, patches)));
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
      // Strip ids so paste generates new ones.
      for (const c of copies) {
        (c as EngineElement).id = "";
      }
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
      const pasted: EngineElement[] = [];
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          let next = sl;
          const layerId = sl.layers.some((layer) => layer.id === cur.activeLayerId)
            ? cur.activeLayerId
            : sl.layers[0]?.id;
          if (!layerId) return sl;
          for (const proto of clip) {
            const el = {
              ...proto,
              id: crypto.randomUUID(),
              x: proto.x + 20,
              y: proto.y + 20,
            } as EngineElement;
            el.z = nextZ(next);
            next = addObjectToLayer(next, el, layerId, cur.doc.workspaceStrictness);
            pasted.push(el);
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
      const safeWidth = Math.max(64, Math.min(10000, Math.round(width)));
      const safeHeight = Math.max(64, Math.min(10000, Math.round(height)));
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => {
            if (sl.id !== id) return sl;
            if (!resizeContents) {
              return reflowBlockObjects(
                remapBlockLayersToArtwork(sl, safeWidth, safeHeight),
                cur.doc.workspaceStrictness,
              );
            }
            const scaleX = safeWidth / Math.max(1, sl.width);
            const scaleY = safeHeight / Math.max(1, sl.height);
            const typeScale = Math.sqrt(scaleX * scaleY);
            const scaled = sl.elements.map((element) => {
              const media = isMediaElement(element);
              const nextWidth = element.width * (media ? typeScale : scaleX);
              const nextHeight = element.height * (media ? typeScale : scaleY);
              const centerX = (element.x + element.width / 2) * scaleX;
              const centerY = (element.y + element.height / 2) * scaleY;
              const next = {
                ...element,
                x: media ? centerX - nextWidth / 2 : element.x * scaleX,
                y: media ? centerY - nextHeight / 2 : element.y * scaleY,
                width: nextWidth,
                height: nextHeight,
                strokeWidth: element.strokeWidth * typeScale,
                version: element.version + 1,
              } as EngineElement;
              if (next.type === "text") next.fontSize *= typeScale;
              if (next.shadow) {
                next.shadow = {
                  ...next.shadow,
                  blur: next.shadow.blur * typeScale,
                  offsetX: next.shadow.offsetX * scaleX,
                  offsetY: next.shadow.offsetY * scaleY,
                };
              }
              return next;
            });
            const resized = remapBlockLayersToArtwork(
              { ...sl, elements: scaled },
              safeWidth,
              safeHeight,
            );
            return reflowBlockObjects(resized, cur.doc.workspaceStrictness);
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
): EngineSlide {
  const normalizedPatches = patches.map((item) => {
    const element = slide.elements.find((candidate) => candidate.id === item.id);
    if (!element || !isMediaElement(element)) return item;
    const layer = getLayerForObject(slide, element.id);
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
  return recomputeArrowBindings({
    ...slide,
    elements: slide.elements.map((element) => {
      const item = allPatches.find((candidate) => candidate.id === element.id);
      return item
        ? ({ ...element, ...item.patch, version: element.version + 1 } as EngineElement)
        : element;
    }),
  });
}
