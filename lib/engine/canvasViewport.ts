export type CanvasViewportSnapshot = {
  width: number;
  height: number;
  scale: number;
  tx: number;
  ty: number;
  slideWidth: number;
  slideHeight: number;
};

let snapshot: CanvasViewportSnapshot | null = null;
const listeners = new Set<() => void>();

export function publishCanvasViewport(next: CanvasViewportSnapshot): void {
  snapshot = {
    ...next,
    width: Math.max(0, next.width),
    height: Math.max(0, next.height),
    scale: Math.max(0.0001, next.scale),
  };
  for (const listener of listeners) listener();
}

export function getCanvasViewport(): CanvasViewportSnapshot | null {
  return snapshot ? { ...snapshot } : null;
}

export function subscribeCanvasViewport(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearCanvasViewport(): void {
  snapshot = null;
  for (const listener of listeners) listener();
}
