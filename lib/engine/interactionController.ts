import type { EngineElement } from "./types";

export type PreviewPatch = {
  id: string;
  patch: Partial<EngineElement>;
};

type FrameScheduler = {
  request(callback: () => void): number;
  cancel(id: number): void;
};

export type InteractionController = {
  preview(patches: PreviewPatch[]): void;
  flush(): void;
  cancel(): void;
};

/** Coalesces high-frequency pointer patches into one render-frame update. */
export function createInteractionController(
  applyPreview: (patches: PreviewPatch[]) => void,
  scheduler: FrameScheduler = browserFrameScheduler(),
): InteractionController {
  let pending: PreviewPatch[] | null = null;
  let frameId: number | null = null;

  const flush = () => {
    if (frameId !== null) {
      scheduler.cancel(frameId);
      frameId = null;
    }
    const patches = pending;
    pending = null;
    if (patches) applyPreview(patches);
  };

  return {
    preview(patches) {
      pending = patches;
      if (frameId !== null) return;
      frameId = scheduler.request(() => {
        frameId = null;
        const next = pending;
        pending = null;
        if (next) applyPreview(next);
      });
    },
    flush,
    cancel() {
      if (frameId !== null) scheduler.cancel(frameId);
      frameId = null;
      pending = null;
    },
  };
}

function browserFrameScheduler(): FrameScheduler {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return {
      request(callback) {
        callback();
        return 0;
      },
      cancel() {},
    };
  }

  return {
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (id) => window.cancelAnimationFrame(id),
  };
}
