"use client";

/**
 * LocalStorage persistence for the engine doc + image side-table.
 *
 * Storage layout:
 *   mighty-slides:engine:v1  → SerializedDoc (doc + files)
 *
 * On first load, if no engine entry exists but a legacy `mighty-slides:doc:v1`
 * is present, we transparently migrate via the adapter so users don't lose
 * work when switching to /editor-v2.
 */

import { legacyToEngineDoc } from "./adapter";
import { deserializeWithImages, type SerializedDoc, serializeWithImages } from "./serialize";
import type { EngineDoc } from "./types";

const KEY = "mighty-slides:engine:v1";

export function saveEngine(doc: EngineDoc): void {
  try {
    const payload = serializeWithImages(doc);
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("[engine] persist failed", err);
  }
}

export function clearEngine(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("mighty-slides:doc:v1");
  } catch (err) {
    console.error("[engine] clear failed", err);
  }
}

export async function loadEngine(): Promise<EngineDoc | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SerializedDoc;
      return await deserializeWithImages(parsed);
    }
  } catch (err) {
    console.error("[engine] load failed", err);
  }
  // Fallback: try migrating a legacy doc if present.
  try {
    const legacyRaw = localStorage.getItem("mighty-slides:doc:v1");
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw);
      // Legacy stored shape mirrors `SlideDoc` directly (not the wrapper).
      const doc = legacy.state?.doc ?? legacy.doc ?? legacy;
      if (doc?.slides) {
        const migrated = await legacyToEngineDoc(doc);
        saveEngine(migrated);
        return migrated;
      }
    }
  } catch (err) {
    console.error("[engine] legacy migration failed", err);
  }
  return null;
}
