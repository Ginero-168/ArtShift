export type ProcessingPreviewKind = "extract" | "remove-bg" | "vectorize" | "upscale" | "generate";
export type ProcessingPreviewPhase = "queued" | "running";

export const PROCESSING_PREVIEW_GAP = 32;

export type ProcessingPreviewSourceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Place a processing duplicate to the right without changing source geometry. */
export function getProcessingPreviewBounds(
  source: ProcessingPreviewSourceBounds,
): ProcessingPreviewSourceBounds {
  return {
    x: source.x + source.width + PROCESSING_PREVIEW_GAP,
    y: source.y,
    width: source.width,
    height: source.height,
  };
}

export type ProcessingPreview = {
  id: string;
  kind: ProcessingPreviewKind;
  label: string;
  message?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** null means the provider is running and no honest percentage is available. */
  progress: number | null;
  phase: ProcessingPreviewPhase;
  queuePosition?: number;
  sourceDataUrl?: string;
};

export type ProcessingPreviewInput = Omit<ProcessingPreview, "id" | "phase"> & {
  phase?: ProcessingPreviewPhase;
};

type Listener = () => void;

let previews: ProcessingPreview[] = [];
let sequence = 0;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function beginProcessingPreview(input: ProcessingPreviewInput): string {
  const id = `processing-preview-${++sequence}`;
  previews = [
    ...previews,
    {
      ...input,
      id,
      phase: input.phase ?? "running",
      progress: clampProgress(input.progress),
    },
  ];
  notify();
  return id;
}

export function updateProcessingPreview(
  id: string,
  patch: Partial<Omit<ProcessingPreview, "id">>,
): void {
  let changed = false;
  previews = previews.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return {
      ...item,
      ...patch,
      progress: clampProgress(patch.progress === undefined ? item.progress : patch.progress),
    };
  });
  if (changed) notify();
}

export function clearProcessingPreview(id: string): void {
  const next = previews.filter((item) => item.id !== id);
  if (next.length === previews.length) return;
  previews = next;
  notify();
}

/** Backward-compatible single-item accessor; returns the newest preview. */
export function getProcessingPreview(): ProcessingPreview | null {
  return previews.at(-1) ?? null;
}

export function getProcessingPreviews(): readonly ProcessingPreview[] {
  return previews;
}

export function subscribeProcessingPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clampProgress(value: number | null): number | null {
  if (value === null) return null;
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
