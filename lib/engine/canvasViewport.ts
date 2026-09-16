export type CanvasViewportSnapshot = {
  width: number;
  height: number;
  scale: number;
  tx: number;
  ty: number;
  slideWidth: number;
  slideHeight: number;
};

export type WorldRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type FitWorldRectHandler = (rect: WorldRect, padding?: number) => void;

let snapshot: CanvasViewportSnapshot | null = null;
const listeners = new Set<() => void>();
let fitWorldRectHandler: FitWorldRectHandler | null = null;

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

/** CanvasEditor registers this so chat/UI can zoom the viewport to an element. */
export function registerFitWorldRectHandler(handler: FitWorldRectHandler | null): void {
  fitWorldRectHandler = handler;
}

/** Zoom + pan so `rect` fills the canvas viewport (with padding). */
export function fitWorldRectToViewport(rect: WorldRect, padding = 56): boolean {
  if (!fitWorldRectHandler) return false;
  if (!(rect.width > 0) || !(rect.height > 0)) return false;
  fitWorldRectHandler(rect, padding);
  return true;
}
