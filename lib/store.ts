"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { DEFAULT_THAI_FONT_FAMILY } from "./fonts";
import { migrateDoc } from "./migrate";
import {
  CURRENT_SCHEMA_VERSION,
  type ImageObject,
  type ObjectId,
  type ShapeKind,
  type ShapeObject,
  type Slide,
  type SlideDoc,
  type SlideId,
  type SlideObject,
  type TextObject,
  type Tool,
} from "./types";

const SLIDE_W = 1280;
const SLIDE_H = 720;
const STORAGE_KEY = "mighty-slides:doc:v1";
const UI_STORAGE_KEY = "mighty-slides:ui:v1";

export type ThemeName = "midnight" | "paper" | "cool";

export type CanvasView = {
  stageX: number;
  stageY: number;
  scale: number;
  containerLeft: number;
  containerTop: number;
};

function newTextObject(partial: Partial<TextObject> = {}): TextObject {
  return {
    id: nanoid(8),
    type: "text",
    x: 120,
    y: 120,
    width: 480,
    height: 80,
    rotation: 0,
    opacity: 1,
    text: "Double click to edit",
    fontSize: 40,
    fontFamily: DEFAULT_THAI_FONT_FAMILY,
    fontStyle: "normal",
    align: "left",
    fill: "#111111",
    lineHeight: 1.25,
    ...partial,
  };
}

function newImageObject(src: string, partial: Partial<ImageObject> = {}): ImageObject {
  return {
    id: nanoid(8),
    type: "image",
    x: 160,
    y: 120,
    width: 480,
    height: 320,
    rotation: 0,
    opacity: 1,
    src,
    ...partial,
  };
}

function newShapeObject(shape: ShapeKind, partial: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: nanoid(8),
    type: "shape",
    shape,
    x: 200,
    y: 200,
    width: 240,
    height: 160,
    rotation: 0,
    opacity: 1,
    fill: "#6366f1",
    stroke: "#1f2230",
    strokeWidth: 0,
    cornerRadius: shape === "rect" ? 8 : 0,
    ...partial,
  };
}

function emptySlide(name = "Slide"): Slide {
  return {
    id: nanoid(8),
    name,
    background: "#ffffff",
    objects: [],
  };
}

function defaultDoc(): SlideDoc {
  return {
    id: nanoid(10),
    title: "Untitled brief",
    width: SLIDE_W,
    height: SLIDE_H,
    slides: [emptySlide("Slide 1")],
    updatedAt: Date.now(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

type HistoryEntry = { doc: SlideDoc };

const HISTORY_COALESCE_MS = 500;
let _lastHistoryPushAt = 0;
let _lastHistoryKey = "";
let _historyBatchDepth = 0;
let _historyBatchPushed = false;

// Fields that must never be changed via updateObject's patch.
const IMMUTABLE_PATCH_KEYS: ReadonlySet<string> = new Set(["id", "type"]);

function sanitizePatch<T extends Partial<SlideObject>>(patch: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (IMMUTABLE_PATCH_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out as T;
}

export type DeckPlanSlideStatus = "pending" | "in_progress" | "done";
export type DeckPlanSlide = {
  title: string;
  summary: string;
  template: string;
  status: DeckPlanSlideStatus;
};
export type DeckPlan = {
  title: string;
  slides: DeckPlanSlide[];
  startedAt: number;
  done: boolean;
};

type Store = {
  doc: SlideDoc;
  currentSlideId: SlideId;
  selectedIds: ObjectId[];
  tool: Tool;
  lastShape: ShapeKind;
  zoom: number;
  theme: ThemeName;
  stripCollapsed: boolean;
  canvasView: CanvasView;
  clipboard: SlideObject[] | null;
  history: HistoryEntry[];
  future: HistoryEntry[];
  hydrated: boolean;
  deckPlan: DeckPlan | null;

  hydrate: () => void;
  persist: () => void;
  setTheme: (t: ThemeName) => void;
  cycleTheme: () => void;
  setStripCollapsed: (v: boolean) => void;
  setCanvasView: (v: CanvasView) => void;
  pushHistory: (coalesceKey?: string) => void;
  batchHistory: <T>(label: string, fn: () => T | Promise<T>) => Promise<T>;
  undo: () => void;
  redo: () => void;

  setTool: (t: Tool) => void;
  setLastShape: (s: ShapeKind) => void;
  setZoom: (z: number) => void;

  addSlide: () => void;
  duplicateSlide: (id: SlideId) => void;
  deleteSlide: (id: SlideId) => void;
  renameSlide: (id: SlideId, name: string) => void;
  reorderSlide: (from: number, to: number) => void;
  selectSlide: (id: SlideId) => void;
  setBackground: (color: string) => void;
  setDocTitle: (title: string) => void;
  setSlideSize: (width: number, height: number) => void;
  setSlideNotes: (id: SlideId, notes: string) => void;

  currentSlide: () => Slide;

  addObject: (obj: SlideObject) => void;
  addObjects: (objs: SlideObject[]) => void;
  addText: (partial?: Partial<TextObject>) => ObjectId;
  addImage: (src: string, partial?: Partial<ImageObject>) => ObjectId;
  addShape: (shape: ShapeKind, partial?: Partial<ShapeObject>) => ObjectId;
  applyTemplate: (objs: SlideObject[], background?: string) => void;
  updateObject: (id: ObjectId, patch: Partial<SlideObject>) => void;
  updateExcalidrawElements: (id: SlideId, elements: unknown[]) => void;
  deleteObjects: (ids: ObjectId[]) => void;
  selectObjects: (ids: ObjectId[]) => void;
  toggleSelect: (id: ObjectId, additive?: boolean) => void;
  bringToFront: (id: ObjectId) => void;
  sendToBack: (id: ObjectId) => void;

  copySelection: () => void;
  cutSelection: () => void;
  paste: () => void;
  pasteObjects: (objects: SlideObject[]) => void;
  pasteTable: (rows: string[][]) => void;
  pasteSlide: (slide: Slide, afterId?: SlideId) => void;

  setDeckPlan: (plan: { title: string; slides: Array<Omit<DeckPlanSlide, "status">> }) => void;
  advanceDeckPlan: (index: number) => void;
  finishDeckPlan: () => void;
  clearDeckPlan: () => void;

  resetDoc: () => void;
};

/** @deprecated Use `lib/engine/store` for artwork state. This store remains
 * only for theme preferences and the one-way legacy import bridge. */
export const useStore = create<Store>((set, get) => ({
  doc: defaultDoc(),
  currentSlideId: "",
  selectedIds: [],
  tool: "select",
  lastShape: "rect",
  zoom: 1,
  theme: "cool",
  stripCollapsed: false,
  canvasView: { stageX: 0, stageY: 0, scale: 1, containerLeft: 0, containerTop: 0 },
  clipboard: null,
  history: [],
  future: [],
  hydrated: false,
  deckPlan: null,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(STORAGE_KEY);
    let doc: SlideDoc | null = null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        doc = migrateDoc(parsed);
      } catch {
        doc = null;
      }
    }
    const base = doc ?? defaultDoc();
    if (!base.slides.length) base.slides.push(emptySlide("Slide 1"));

    let ui: { theme?: ThemeName; stripCollapsed?: boolean } = {};
    try {
      const raw2 = localStorage.getItem(UI_STORAGE_KEY);
      if (raw2) ui = JSON.parse(raw2);
    } catch {
      /* ignore */
    }

    set({
      doc: base,
      currentSlideId: base.slides[0].id,
      theme: ui.theme ?? "cool",
      stripCollapsed: ui.stripCollapsed ?? false,
      hydrated: true,
    });
  },

  persist: () => {
    if (typeof window === "undefined") return;
    const doc = { ...get().doc, updatedAt: Date.now() };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
    } catch {
      /* quota */
    }
  },

  setTheme: (t) => {
    set({ theme: t });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          UI_STORAGE_KEY,
          JSON.stringify({ theme: t, stripCollapsed: get().stripCollapsed }),
        );
      } catch {
        /* ignore */
      }
    }
  },
  cycleTheme: () => {
    const order: ThemeName[] = ["midnight", "paper", "cool"];
    const i = order.indexOf(get().theme);
    get().setTheme(order[(i + 1) % order.length]);
  },
  setStripCollapsed: (v) => {
    set({ stripCollapsed: v });
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(
          UI_STORAGE_KEY,
          JSON.stringify({ theme: get().theme, stripCollapsed: v }),
        );
      } catch {
        /* ignore */
      }
    }
  },
  setCanvasView: (v) => set({ canvasView: v }),

  pushHistory: (coalesceKey?: string) => {
    // Inside a batch: only the first push creates a snapshot; the rest are skipped.
    if (_historyBatchDepth > 0) {
      if (_historyBatchPushed) return;
      _historyBatchPushed = true;
      const snap: HistoryEntry = { doc: structuredClone(get().doc) };
      set((s) => ({ history: [...s.history, snap].slice(-50), future: [] }));
      return;
    }
    const now = Date.now();
    if (
      coalesceKey &&
      coalesceKey === _lastHistoryKey &&
      now - _lastHistoryPushAt < HISTORY_COALESCE_MS
    ) {
      _lastHistoryPushAt = now;
      return;
    }
    _lastHistoryKey = coalesceKey ?? "";
    _lastHistoryPushAt = now;
    const snap: HistoryEntry = { doc: structuredClone(get().doc) };
    set((s) => ({ history: [...s.history, snap].slice(-50), future: [] }));
  },

  batchHistory: async (_label, fn) => {
    _historyBatchDepth++;
    if (_historyBatchDepth === 1) _historyBatchPushed = false;
    try {
      return await fn();
    } finally {
      _historyBatchDepth--;
      if (_historyBatchDepth === 0) {
        _historyBatchPushed = false;
        _lastHistoryKey = "";
        _lastHistoryPushAt = Date.now();
      }
    }
  },

  undo: () => {
    const { history, doc } = get();
    if (!history.length) return;
    const prev = history[history.length - 1];
    _lastHistoryKey = "";
    _lastHistoryPushAt = 0;
    set((s) => ({
      history: s.history.slice(0, -1),
      future: [...s.future, { doc: structuredClone(doc) }],
      doc: prev.doc,
    }));
    get().persist();
  },

  redo: () => {
    const { future, doc } = get();
    if (!future.length) return;
    const next = future[future.length - 1];
    _lastHistoryKey = "";
    _lastHistoryPushAt = 0;
    set((s) => ({
      future: s.future.slice(0, -1),
      history: [...s.history, { doc: structuredClone(doc) }],
      doc: next.doc,
    }));
    get().persist();
  },

  setTool: (tool) => {
    const shapeKinds: ShapeKind[] = ["rect", "ellipse", "triangle", "line", "arrow"];
    if (shapeKinds.includes(tool as ShapeKind)) {
      set({ tool, lastShape: tool as ShapeKind });
    } else {
      set({ tool });
    }
  },
  setLastShape: (s) => set({ lastShape: s }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(3, z)) }),

  addSlide: () => {
    get().pushHistory();
    const slide = emptySlide(`Slide ${get().doc.slides.length + 1}`);
    set((s) => ({
      doc: { ...s.doc, slides: [...s.doc.slides, slide] },
      currentSlideId: slide.id,
      selectedIds: [],
    }));
    get().persist();
  },

  duplicateSlide: (id) => {
    get().pushHistory();
    const src = get().doc.slides.find((s) => s.id === id);
    if (!src) return;
    const copy: Slide = {
      ...structuredClone(src),
      id: nanoid(8),
      name: src.name + " copy",
      objects: src.objects.map((o) => ({ ...structuredClone(o), id: nanoid(8) })),
    };
    set((s) => {
      const idx = s.doc.slides.findIndex((x) => x.id === id);
      const slides = [...s.doc.slides];
      slides.splice(idx + 1, 0, copy);
      return { doc: { ...s.doc, slides }, currentSlideId: copy.id, selectedIds: [] };
    });
    get().persist();
  },

  deleteSlide: (id) => {
    const { doc } = get();
    if (doc.slides.length <= 1) return;
    get().pushHistory();
    const idx = doc.slides.findIndex((s) => s.id === id);
    const slides = doc.slides.filter((s) => s.id !== id);
    const nextId = slides[Math.max(0, idx - 1)].id;
    set({ doc: { ...doc, slides }, currentSlideId: nextId, selectedIds: [] });
    get().persist();
  },

  renameSlide: (id, name) => {
    get().pushHistory();
    set((s) => ({
      doc: { ...s.doc, slides: s.doc.slides.map((x) => (x.id === id ? { ...x, name } : x)) },
    }));
    get().persist();
  },

  reorderSlide: (from, to) => {
    get().pushHistory();
    set((s) => {
      const slides = [...s.doc.slides];
      const [moved] = slides.splice(from, 1);
      slides.splice(to, 0, moved);
      return { doc: { ...s.doc, slides } };
    });
    get().persist();
  },

  selectSlide: (id) => set({ currentSlideId: id, selectedIds: [] }),

  setBackground: (color) => {
    get().pushHistory();
    const id = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) => (sl.id === id ? { ...sl, background: color } : sl)),
      },
    }));
    get().persist();
  },

  setDocTitle: (title) => {
    set((s) => ({ doc: { ...s.doc, title } }));
    get().persist();
  },

  setSlideSize: (width, height) => {
    const w = Math.max(50, Math.round(width));
    const h = Math.max(50, Math.round(height));
    get().pushHistory();
    set((s) => ({ doc: { ...s.doc, width: w, height: h } }));
    get().persist();
  },

  setSlideNotes: (id, notes) => {
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((x) => (x.id === id ? { ...x, notes } : x)),
      },
    }));
    get().persist();
  },

  currentSlide: () => {
    const { doc, currentSlideId } = get();
    return doc.slides.find((s) => s.id === currentSlideId) ?? doc.slides[0];
  },

  addObject: (obj) => {
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id === sid ? { ...sl, objects: [...sl.objects, obj] } : sl,
        ),
      },
      selectedIds: [obj.id],
    }));
    get().persist();
  },

  addObjects: (objs) => {
    if (!objs.length) return;
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id === sid ? { ...sl, objects: [...sl.objects, ...objs] } : sl,
        ),
      },
      selectedIds: objs.map((o) => o.id),
    }));
    get().persist();
  },

  applyTemplate: (objs, background) => {
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== sid
            ? sl
            : {
                ...sl,
                background: background ?? sl.background,
                objects: objs,
              },
        ),
      },
      selectedIds: [],
    }));
    get().persist();
  },

  addText: (partial) => {
    const o = newTextObject(partial);
    get().addObject(o);
    return o.id;
  },
  addImage: (src, partial) => {
    const o = newImageObject(src, partial);
    get().addObject(o);
    return o.id;
  },
  addShape: (shape, partial) => {
    const o = newShapeObject(shape, partial);
    get().addObject(o);
    return o.id;
  },

  updateObject: (id, patch) => {
    const safePatch = sanitizePatch(patch);
    if (Object.keys(safePatch).length === 0) return;
    const coalesceKey = `update:${id}:${Object.keys(safePatch).sort().join("|")}`;
    get().pushHistory(coalesceKey);
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== sid
            ? sl
            : {
                ...sl,
                objects: sl.objects.map((o) =>
                  o.id === id ? ({ ...o, ...safePatch } as SlideObject) : o,
                ),
              },
        ),
      },
    }));
    get().persist();
  },

  updateExcalidrawElements: (id, elements) => {
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== id ? sl : { ...sl, excalidrawElements: elements },
        ),
      },
    }));
    get().persist();
  },

  deleteObjects: (ids) => {
    if (!ids.length) return;
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== sid ? sl : { ...sl, objects: sl.objects.filter((o) => !ids.includes(o.id)) },
        ),
      },
      selectedIds: [],
    }));
    get().persist();
  },

  selectObjects: (ids) => set({ selectedIds: ids }),
  toggleSelect: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedIds: [id] };
      const has = s.selectedIds.includes(id);
      return { selectedIds: has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id] };
    }),

  bringToFront: (id) => {
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) => {
          if (sl.id !== sid) return sl;
          const obj = sl.objects.find((o) => o.id === id);
          if (!obj) return sl;
          return { ...sl, objects: [...sl.objects.filter((o) => o.id !== id), obj] };
        }),
      },
    }));
    get().persist();
  },

  sendToBack: (id) => {
    get().pushHistory();
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) => {
          if (sl.id !== sid) return sl;
          const obj = sl.objects.find((o) => o.id === id);
          if (!obj) return sl;
          return { ...sl, objects: [obj, ...sl.objects.filter((o) => o.id !== id)] };
        }),
      },
    }));
    get().persist();
  },

  copySelection: () => {
    const slide = get().currentSlide();
    const ids = get().selectedIds;
    const objs = slide.objects.filter((o) => ids.includes(o.id));
    set({ clipboard: structuredClone(objs) });
  },
  cutSelection: () => {
    get().copySelection();
    get().deleteObjects(get().selectedIds);
  },
  paste: () => {
    const clip = get().clipboard;
    if (!clip?.length) return;
    get().pasteObjects(clip);
  },
  pasteObjects: (objects) => {
    get().pushHistory();
    const sid = get().currentSlideId;
    const cloned = objects.map((o) => {
      const maxX = Math.max(0, SLIDE_W - o.width);
      const maxY = Math.max(0, SLIDE_H - o.height);
      let nx = o.x + 24;
      let ny = o.y + 24;
      if (nx > maxX) nx = Math.min(24, maxX);
      if (ny > maxY) ny = Math.min(24, maxY);
      return {
        ...structuredClone(o),
        id: nanoid(8),
        x: nx,
        y: ny,
      };
    });
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== sid ? sl : { ...sl, objects: [...sl.objects, ...cloned] },
        ),
      },
      selectedIds: cloned.map((c) => c.id),
    }));
    get().persist();
  },

  pasteSlide: (slide, afterId) => {
    get().pushHistory();
    const copy: Slide = {
      ...structuredClone(slide),
      id: nanoid(8),
      name: (slide.name || "Slide") + " copy",
      objects: slide.objects.map((o) => ({ ...structuredClone(o), id: nanoid(8) })),
    };
    set((s) => {
      const anchor = afterId ?? s.currentSlideId;
      const idx = s.doc.slides.findIndex((x) => x.id === anchor);
      const slides = [...s.doc.slides];
      const insertAt = idx < 0 ? slides.length : idx + 1;
      slides.splice(insertAt, 0, copy);
      return { doc: { ...s.doc, slides }, currentSlideId: copy.id, selectedIds: [] };
    });
    get().persist();
  },

  pasteTable: (rows) => {
    if (!rows.length) return;
    get().pushHistory();
    const cellW = 220;
    const cellH = 60;
    const startX = 80;
    const startY = 80;
    const objs: SlideObject[] = [];
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        objs.push(
          newTextObject({
            x: startX + c * cellW,
            y: startY + r * cellH,
            width: cellW - 8,
            height: cellH - 8,
            text: cell,
            fontSize: 18,
            fontStyle: r === 0 ? "bold" : "normal",
          }),
        );
      });
    });
    const sid = get().currentSlideId;
    set((s) => ({
      doc: {
        ...s.doc,
        slides: s.doc.slides.map((sl) =>
          sl.id !== sid ? sl : { ...sl, objects: [...sl.objects, ...objs] },
        ),
      },
      selectedIds: objs.map((o) => o.id),
    }));
    get().persist();
  },

  setDeckPlan: (plan) => {
    set({
      deckPlan: {
        title: plan.title,
        slides: plan.slides.map((s, i) => ({ ...s, status: i === 0 ? "in_progress" : "pending" })),
        startedAt: Date.now(),
        done: false,
      },
    });
  },

  advanceDeckPlan: (index) => {
    set((s) => {
      if (!s.deckPlan) return {};
      const slides = s.deckPlan.slides.map((sl, i) => {
        if (i < index) return { ...sl, status: "done" as const };
        if (i === index) return { ...sl, status: "done" as const };
        if (i === index + 1) return { ...sl, status: "in_progress" as const };
        return { ...sl, status: "pending" as const };
      });
      return { deckPlan: { ...s.deckPlan, slides } };
    });
  },

  finishDeckPlan: () => {
    set((s) => {
      if (!s.deckPlan) return {};
      // Only set the top-level done flag; DO NOT force pending/in_progress slides
      // to "done". Leaving their real status intact lets the user see which
      // slides the AI actually built vs. promised but skipped.
      const slides = s.deckPlan.slides.map((sl) =>
        sl.status === "in_progress" ? { ...sl, status: "pending" as const } : sl,
      );
      return { deckPlan: { ...s.deckPlan, slides, done: true } };
    });
  },

  clearDeckPlan: () => set({ deckPlan: null }),

  resetDoc: () => {
    const d = defaultDoc();
    set({
      doc: d,
      currentSlideId: d.slides[0].id,
      selectedIds: [],
      history: [],
      future: [],
      deckPlan: null,
    });
    get().persist();
  },
}));

export const SLIDE_WIDTH = SLIDE_W;
export const SLIDE_HEIGHT = SLIDE_H;
