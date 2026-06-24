/**
 * Undo/redo history for the engine document.
 *
 * Snapshot-based with structural sharing skipped for now (deep-clone per
 * commit). At ~50 snapshots × hundreds of elements this is fine; we can
 * upgrade to a delta log later if profiling demands.
 *
 * `pushHistory(label)` coalesces consecutive commits with the same label
 * inside `COALESCE_MS`. `batch(label, fn)` collapses everything inside the
 * callback into a single snapshot — used by AI mutation runners and
 * multi-element drag commits.
 */

import type { EngineDoc } from "./types";

const MAX_SNAPSHOTS = 50;
const COALESCE_MS = 500;

export type HistoryEntry = { label: string; doc: EngineDoc; at: number };

export type HistoryState = {
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Internal: counts open `batch()` frames so nested commits collapse. */
  batchDepth: number;
  /** Internal: did the current batch already snapshot? */
  batchSnapped: boolean;
  lastLabel: string;
  lastAt: number;
};

export function createHistory(): HistoryState {
  return {
    past: [],
    future: [],
    batchDepth: 0,
    batchSnapped: false,
    lastLabel: "",
    lastAt: 0,
  };
}

export function pushHistory(state: HistoryState, doc: EngineDoc, label: string): void {
  const now = Date.now();
  if (state.batchDepth > 0) {
    if (state.batchSnapped) return;
    state.batchSnapped = true;
    appendSnapshot(state, doc, label, now);
    return;
  }
  if (label && label === state.lastLabel && now - state.lastAt < COALESCE_MS) {
    state.lastAt = now;
    return;
  }
  state.lastLabel = label;
  state.lastAt = now;
  appendSnapshot(state, doc, label, now);
}

function appendSnapshot(state: HistoryState, doc: EngineDoc, label: string, at: number): void {
  state.past.push({ label, doc: structuredClone(doc), at });
  if (state.past.length > MAX_SNAPSHOTS) state.past.shift();
  state.future = [];
}

export async function batchHistory<T>(
  state: HistoryState,
  label: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  state.batchDepth++;
  if (state.batchDepth === 1) state.batchSnapped = false;
  try {
    return await fn();
  } finally {
    state.batchDepth--;
    if (state.batchDepth === 0) {
      state.batchSnapped = false;
      state.lastLabel = label;
      state.lastAt = Date.now();
    }
  }
}

export function undo(state: HistoryState, current: EngineDoc): EngineDoc | null {
  const prev = state.past.pop();
  if (!prev) return null;
  state.future.push({ label: prev.label, doc: structuredClone(current), at: Date.now() });
  return prev.doc;
}

export function redo(state: HistoryState, current: EngineDoc): EngineDoc | null {
  const next = state.future.pop();
  if (!next) return null;
  state.past.push({ label: next.label, doc: structuredClone(current), at: Date.now() });
  return next.doc;
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}
export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}
