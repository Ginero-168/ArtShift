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
  /** Folder id the preset belongs to. */
  folderId: string | null;
  /** ISO timestamp of creation. */
  createdAt: number;
}

export interface PresetFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface PresetState {
  presets: Preset[];
  folders: PresetFolder[];

  /** Save selected elements as a new preset. */
  savePreset: (name: string, elements: EngineElement[], folderId?: string | null) => void;
  /** Delete a preset by id. */
  deletePreset: (id: string) => void;
  /** Rename a preset. */
  renamePreset: (id: string, name: string) => void;
  /** Move a preset to a folder. */
  movePresetToFolder: (id: string, folderId: string | null) => void;
  /** Create a new folder. */
  createFolder: (name: string) => string;
  /** Delete a folder and move its presets to root. */
  deleteFolder: (id: string) => void;
  /** Rename a folder. */
  renameFolder: (id: string, name: string) => void;
  /** Load presets and folders from localStorage. */
  hydrate: () => void;
}

const PRESETS_KEY = "mighty-presets";
const FOLDERS_KEY = "mighty-preset-folders";

interface PersistedState {
  presets: Preset[];
  folders: PresetFolder[];
}

function persist(state: PersistedState) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(state.presets));
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(state.folders));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    return parsed.map((p) => ({ ...p, folderId: p.folderId ?? null }));
  } catch {
    return [];
  }
}

function loadFolders(): PresetFolder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PresetFolder[];
  } catch {
    return [];
  }
}

export const usePresetStore = create<PresetState>((set, get) => ({
  presets: [],
  folders: [],

  savePreset: (name, elements, folderId = null) => {
    const clones = elements.map((el) => {
      const c = structuredClone(el);
      c.id = ""; // will be reassigned on paste
      return c;
    });

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
      folderId,
      createdAt: Date.now(),
    };

    const next = { presets: [...get().presets, preset], folders: get().folders };
    persist(next);
    set(next);
  },

  deletePreset: (id) => {
    const next = { presets: get().presets.filter((p) => p.id !== id), folders: get().folders };
    persist(next);
    set(next);
  },

  renamePreset: (id, name) => {
    const next = {
      presets: get().presets.map((p) => (p.id === id ? { ...p, name } : p)),
      folders: get().folders,
    };
    persist(next);
    set(next);
  },

  movePresetToFolder: (id, folderId) => {
    const next = {
      presets: get().presets.map((p) => (p.id === id ? { ...p, folderId } : p)),
      folders: get().folders,
    };
    persist(next);
    set(next);
  },

  createFolder: (name) => {
    const folder: PresetFolder = { id: crypto.randomUUID(), name, createdAt: Date.now() };
    const next = { presets: get().presets, folders: [...get().folders, folder] };
    persist(next);
    set(next);
    return folder.id;
  },

  deleteFolder: (id) => {
    const next = {
      presets: get().presets.map((p) => (p.folderId === id ? { ...p, folderId: null } : p)),
      folders: get().folders.filter((f) => f.id !== id),
    };
    persist(next);
    set(next);
  },

  renameFolder: (id, name) => {
    const next = {
      presets: get().presets,
      folders: get().folders.map((f) => (f.id === id ? { ...f, name } : f)),
    };
    persist(next);
    set(next);
  },

  hydrate: () => {
    set({ presets: loadPresets(), folders: loadFolders() });
  },
}));
