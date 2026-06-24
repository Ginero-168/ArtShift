"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EngineElement } from "./types";

export type LibraryItem = {
  id: string;
  name: string;
  elements: EngineElement[];
  createdAt: number;
};

type LibraryState = {
  items: LibraryItem[];
  addItem: (name: string, elements: EngineElement[]) => void;
  removeItem: (id: string) => void;
  renameItem: (id: string, name: string) => void;
};

const STORAGE_KEY = "mighty-slides:library:v1";

export function cloneElementsForPaste(elements: EngineElement[]): EngineElement[] {
  const idMap = new Map<string, string>();
  for (const el of elements) {
    idMap.set(el.id, crypto.randomUUID());
  }
  const keptIds = new Set(elements.map((el) => el.id));
  return elements.map((el) => {
    const clone = structuredClone(el);
    clone.id = idMap.get(el.id)!;
    clone.groupIds = el.groupIds.map((gid) => idMap.get(gid) ?? gid);
    if (clone.type === "text" && clone.containerId) {
      clone.containerId = idMap.get(clone.containerId) ?? null;
    }
    if (clone.type === "arrow") {
      if (clone.startBinding?.elementId && idMap.has(clone.startBinding.elementId)) {
        clone.startBinding = {
          ...clone.startBinding,
          elementId: idMap.get(clone.startBinding.elementId)!,
        };
      } else {
        clone.startBinding = null;
      }
      if (clone.endBinding?.elementId && idMap.has(clone.endBinding.elementId)) {
        clone.endBinding = {
          ...clone.endBinding,
          elementId: idMap.get(clone.endBinding.elementId)!,
        };
      } else {
        clone.endBinding = null;
      }
    }
    if (clone.type === "frame") {
      clone.childIds = clone.childIds
        .map((cid) => idMap.get(cid) ?? cid)
        .filter((cid) => keptIds.has(cid) || !idMap.has(cid));
    }
    return clone;
  });
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (name, elements) => {
        const item: LibraryItem = {
          id: crypto.randomUUID(),
          name,
          elements: structuredClone(elements),
          createdAt: Date.now(),
        };
        set({ items: [...get().items, item] });
      },
      removeItem: (id) => {
        set({ items: get().items.filter((item) => item.id !== id) });
      },
      renameItem: (id, name) => {
        set({
          items: get().items.map((item) => (item.id === id ? { ...item, name } : item)),
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: {
        getItem: (name) => {
          try {
            const raw = localStorage.getItem(name);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch (err) {
            console.error("[library] persist failed", err);
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch (err) {
            console.error("[library] remove failed", err);
          }
        },
      },
    },
  ),
);
