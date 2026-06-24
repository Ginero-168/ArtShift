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
import {
  createHistory,
  type HistoryState,
  redo as historyRedo,
  undo as historyUndo,
  pushHistory,
} from "./history";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineSlide,
  SLIDE_H,
  SLIDE_W,
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
  selectedIds: Set<string>;
  tool: Tool;
  history: HistoryState;

  // ——— selectors (call as plain functions; they rely on getState) ———
  currentSlide: () => EngineSlide | undefined;

  // ——— mutators ———
  setTool: (t: Tool) => void;
  setCurrentSlide: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;

  addElement: (el: EngineElement, label?: string) => void;
  updateElements: (
    patches: Array<{ id: string; patch: Partial<EngineElement> }>,
    label?: string,
  ) => void;
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
  setSlideDimensions: (id: string, width: number, height: number) => void;
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
  return {
    id: crypto.randomUUID(),
    name,
    background: "#ffffff",
    elements: [],
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
    selectedIds: new Set<string>(),
    tool: "select" as Tool,
    clipboard: null as EngineElement[] | null,
    history: createHistory(),

    currentSlide: () => {
      const s = get();
      return s.doc.slides.find((sl) => sl.id === s.currentSlideId);
    },

    setTool: (tool) => set({ tool }),
    setCurrentSlide: (id) => set({ currentSlideId: id, selectedIds: new Set() }),

    selectOnly: (ids) => set({ selectedIds: new Set(ids), croppingImageId: null }),
    toggleSelect: (id) =>
      set((s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selectedIds: next, croppingImageId: null };
      }),
    clearSelection: () => set({ selectedIds: new Set(), croppingImageId: null }),

    addElement: (el, label = "add element") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) => ({
        ...mapCurrentSlide(cur, (sl) =>
          recomputeArrowBindings({
            ...sl,
            elements: [...sl.elements, { ...el, z: nextZ(sl) }],
          }),
        ),
        selectedIds: new Set([el.id]),
      }));
    },

    updateElements: (patches, label = "update element") => {
      const s = get();
      pushHistory(s.history, s.doc, label);
      set((cur) =>
        mapDoc(cur, (sl) => {
          const additionalPatches: { id: string; patch: Partial<EngineElement> }[] = [];
          for (const p of patches) {
            const boundTexts = sl.elements.filter(
              (el) =>
                el.type === "text" && (el as import("./types").TextElement).containerId === p.id,
            );
            for (const textEl of boundTexts) {
              const newPatch: Partial<EngineElement> = {};
              if (p.patch.x !== undefined) newPatch.x = p.patch.x;
              if (p.patch.y !== undefined) newPatch.y = p.patch.y;
              if (p.patch.width !== undefined) newPatch.width = p.patch.width;
              if (p.patch.height !== undefined) newPatch.height = p.patch.height;
              if (p.patch.angle !== undefined) newPatch.angle = p.patch.angle;
              if (p.patch.isDeleted !== undefined) newPatch.isDeleted = p.patch.isDeleted;
              if (Object.keys(newPatch).length > 0) {
                additionalPatches.push({ id: textEl.id, patch: newPatch });
              }
            }
          }
          const allPatches = [...patches, ...additionalPatches];
          return recomputeArrowBindings({
            ...sl,
            elements: sl.elements.map((el) => {
              const p = allPatches.find((pp) => pp.id === el.id);
              return p ? ({ ...el, ...p.patch, version: el.version + 1 } as EngineElement) : el;
            }),
          });
        }),
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
      const ids = slide.elements.filter((el) => !el.isDeleted).map((el) => el.id);
      set({ selectedIds: new Set(ids) });
    },

    addSlide: () => {
      const s = get();
      pushHistory(s.history, s.doc, "add slide");
      const sl = newSlide(`${s.doc.slides.length + 1}`);
      set((cur) => ({
        doc: { ...cur.doc, slides: [...cur.doc.slides, sl], updatedAt: Date.now() },
        currentSlideId: sl.id,
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
        (el) => ids.includes(el.id) && !el.isDeleted && !el.locked,
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
        (el) => ids.includes(el.id) && !el.isDeleted && !el.locked,
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
      if (!clip || !clip.length) return;
      pushHistory(s.history, s.doc, "paste");
      const pasted: EngineElement[] = [];
      set((cur) =>
        mapCurrentSlide(cur, (sl) => {
          const next = [...sl.elements];
          for (const proto of clip) {
            const el = {
              ...proto,
              id: crypto.randomUUID(),
              x: proto.x + 20,
              y: proto.y + 20,
            } as EngineElement;
            el.z = nextZ({ elements: next } as EngineSlide);
            next.push(el);
            pasted.push(el);
          }
          return { ...sl, elements: next };
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

    setSlideDimensions: (id, width, height) => {
      const s = get();
      pushHistory(s.history, s.doc, "slide dimensions");
      set((cur) => ({
        doc: {
          ...cur.doc,
          slides: cur.doc.slides.map((sl) => (sl.id === id ? { ...sl, width, height } : sl)),
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
        selectedIds: new Set(),
      });
    },

    loadDoc: (doc) => {
      // Clear renderer cache so stale bitmaps aren't reused.
      import("@/lib/renderer/canvas").then((m) => m.clearElementCache?.());
      set({
        doc,
        currentSlideId: doc.slides[0]?.id ?? "",
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

function mapCurrentSlide(
  state: EngineState,
  fn: (slide: EngineSlide) => EngineSlide,
): { doc: EngineDoc } {
  const slides = state.doc.slides.map((sl) => (sl.id === state.currentSlideId ? fn(sl) : sl));
  return { doc: { ...state.doc, slides, updatedAt: Date.now() } };
}
