export type RasterTelemetrySample = {
  kind: string;
  durationMs: number;
  success: boolean;
  at: number;
};

export type RasterTelemetryStats = {
  count: number;
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  failures: number;
};

export type RasterTelemetrySnapshot = Record<string, RasterTelemetryStats>;

const MAX_SAMPLES_PER_KIND = 64;
const samples = new Map<string, RasterTelemetrySample[]>();
const listeners = new Set<() => void>();
let snapshot: RasterTelemetrySnapshot = {};

export function recordRasterJob(kind: string, durationMs: number, success = true): void {
  const list = samples.get(kind) ?? [];
  list.push({ kind, durationMs: Math.max(0, durationMs), success, at: Date.now() });
  if (list.length > MAX_SAMPLES_PER_KIND) list.splice(0, list.length - MAX_SAMPLES_PER_KIND);
  samples.set(kind, list);
  snapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function getRasterTelemetrySnapshot(): RasterTelemetrySnapshot {
  return snapshot;
}

export function resetRasterTelemetry(): void {
  samples.clear();
  snapshot = {};
  for (const listener of listeners) listener();
}

export function subscribeRasterTelemetry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function buildSnapshot(): RasterTelemetrySnapshot {
  const next: RasterTelemetrySnapshot = {};
  for (const [kind, list] of samples) {
    const durations = list.map((sample) => sample.durationMs).sort((a, b) => a - b);
    next[kind] = {
      count: list.length,
      lastMs: list.at(-1)?.durationMs ?? 0,
      p50Ms: percentile(durations, 0.5),
      p95Ms: percentile(durations, 0.95),
      maxMs: durations.at(-1) ?? 0,
      failures: list.filter((sample) => !sample.success).length,
    };
  }
  return next;
}

function percentile(sorted: number[], ratio: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}
