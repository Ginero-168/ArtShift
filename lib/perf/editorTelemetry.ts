export type EditorInteractionKind = "pointerDown" | "pointerMove" | "pointerUp";

export type EditorInteractionStats = {
  count: number;
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type EditorInteractionSnapshot = Record<EditorInteractionKind, EditorInteractionStats>;

const MAX_SAMPLES_PER_KIND = 128;
const PUBLISH_INTERVAL_MS = 100;
const samples = new Map<EditorInteractionKind, number[]>();
const listeners = new Set<() => void>();
let snapshot: EditorInteractionSnapshot = {} as EditorInteractionSnapshot;
let lastPublishedAt = 0;

/** Record synchronous work performed while dispatching one Canvas pointer event. */
export function recordEditorInteraction(kind: EditorInteractionKind, durationMs: number): void {
  const list = samples.get(kind) ?? [];
  list.push(Math.max(0, durationMs));
  if (list.length > MAX_SAMPLES_PER_KIND) list.splice(0, list.length - MAX_SAMPLES_PER_KIND);
  samples.set(kind, list);
  snapshot = buildSnapshot();

  const now = Date.now();
  if (kind !== "pointerMove" || now - lastPublishedAt >= PUBLISH_INTERVAL_MS) {
    lastPublishedAt = now;
    for (const listener of listeners) listener();
  }
}

export function getEditorInteractionSnapshot(): EditorInteractionSnapshot {
  return snapshot;
}

export function resetEditorTelemetry(): void {
  samples.clear();
  snapshot = {} as EditorInteractionSnapshot;
  lastPublishedAt = 0;
  for (const listener of listeners) listener();
}

export function subscribeEditorTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function buildSnapshot(): EditorInteractionSnapshot {
  const next = {} as EditorInteractionSnapshot;
  for (const [kind, values] of samples) {
    const sorted = [...values].sort((a, b) => a - b);
    next[kind] = {
      count: values.length,
      lastMs: values.at(-1) ?? 0,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted.at(-1) ?? 0,
    };
  }
  return next;
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}
