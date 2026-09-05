export type ProcessingPreviewKind = "extract" | "remove-bg" | "vectorize";

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
  progress: number;
  sourceDataUrl?: string;
};

type ProcessingPreviewInput = Omit<ProcessingPreview, "id">;

type Listener = () => void;

let preview: ProcessingPreview | null = null;
let sequence = 0;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function beginProcessingPreview(input: ProcessingPreviewInput): string {
  const id = `processing-preview-${++sequence}`;
  preview = {
    ...input,
    id,
    progress: clampProgress(input.progress),
  };
  notify();
  return id;
}

export function updateProcessingPreview(
  id: string,
  patch: Partial<Omit<ProcessingPreview, "id">>,
): void {
  if (!preview || preview.id !== id) return;
  preview = {
    ...preview,
    ...patch,
    progress: clampProgress(patch.progress ?? preview.progress),
  };
  notify();
}

export function clearProcessingPreview(id: string): void {
  if (!preview || preview.id !== id) return;
  preview = null;
  notify();
}

export function getProcessingPreview(): ProcessingPreview | null {
  return preview;
}

export function subscribeProcessingPreview(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
