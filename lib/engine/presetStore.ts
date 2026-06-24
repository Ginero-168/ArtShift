"use client";

/**
 * My Presets — Zustand store for user-saved element presets.
 *
 * Each preset stores a deep clone of one or more EngineElements so the user
 * can quickly re-use common shapes, combinations, or styled groups.
 *
 * Persisted to localStorage under the key "mighty-presets".
 */

import { create } from "zustand";
import type { EngineElement } from "./types";

export interface Preset {
  id: string;
  name: string;
  /** Deep clones of the saved elements (ids stripped). */
  elements: EngineElement[];
  /** ISO timestamp of creation. */
  createdAt: number;
}

export interface PresetState {
  presets: Preset[];

  /** Save selected elements as a new preset. */
  savePreset: (name: string, elements: EngineElement[]) => void;
  /** Delete a preset by id. */
  deletePreset: (id: string) => void;
  /** Rename a preset. */
  renamePreset: (id: string, name: string) => void;
  /** Load presets from localStorage. */
  hydrate: () => void;
}

const STORAGE_KEY = "mighty-presets";

function persist(presets: Preset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function loadFromStorage(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Preset[];
  } catch {
    return [];
  }
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],

  savePreset: (name, elements) => {
    const clones = elements.map((el) => {
      const c = structuredClone(el);
      c.id = ""; // will be reassigned on paste
      return c;
    });

    // Normalize positions: offset so the group's top-left is at (0,0)
    let minX = Infinity,
      minY = Infinity;
    for (const el of clones) {
      if (el.x < minX) minX = el.x;
      if (el.y < minY) minY = el.y;
    }
    for (const el of clones) {
      el.x -= minX;
      el.y -= minY;
    }

    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      elements: clones,
      createdAt: Date.now(),
    };

    const next = [...get().presets, preset];
    persist(next);
    set({ presets: next });
  },

  deletePreset: (id) => {
    const next = get().presets.filter((p) => p.id !== id);
    persist(next);
    set({ presets: next });
  },

  renamePreset: (id, name) => {
    const next = get().presets.map((p) => (p.id === id ? { ...p, name } : p));
    persist(next);
    set({ presets: next });
  },

  hydrate: () => {
    set({ presets: loadFromStorage() });
  },
}));
