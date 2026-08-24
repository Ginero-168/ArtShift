import { type AlphaComponentBox, findAlphaComponents } from "./alphaComponents";
import { alphaCoverageFromRgba } from "./foreground";

export type AssetAnalysisInput = {
  fileId: string;
  dataURL: string;
  width: number;
  height: number;
};

export type AssetAnalysisMode = "alpha" | "foreground-preview" | "metadata";
export type AssetForegroundStatus = "ready" | "not-needed" | "skipped" | "failed";

export type AssetAnalysisResult = {
  fileId: string;
  sourceWidth: number;
  sourceHeight: number;
  sampleWidth: number;
  sampleHeight: number;
  alphaCoverage: number;
  hasTransparency: boolean;
  alphaComponents: AlphaComponentBox[];
  foregroundCoverage?: number;
  foregroundComponents?: AlphaComponentBox[];
  foregroundPreviewUrl?: string;
  foregroundStatus?: AssetForegroundStatus;
  foregroundError?: string;
  analyzedAt: number;
  mode: AssetAnalysisMode;
};

export type AssetAnalysisStage = "queued" | "sampling" | "foreground" | "components" | "complete";

export type AssetAnalysisState = {
  fileId: string;
  status: "queued" | "analyzing" | "ready" | "failed" | "cancelled";
  progress: number;
  stage: AssetAnalysisStage;
  result?: AssetAnalysisResult;
  error?: string;
};

export type AssetAnalysisAdapter = (
  input: AssetAnalysisInput,
  signal: AbortSignal,
  onProgress?: (progress: number, stage: AssetAnalysisStage) => void,
) => Promise<AssetAnalysisResult>;

export type AssetAnalysisSchedulerOptions = {
  analyze: AssetAnalysisAdapter;
  schedule?: (task: () => void) => void;
};

export type AssetAnalysisScheduler = {
  enqueue(input: AssetAnalysisInput): void;
  get(fileId: string): AssetAnalysisState | undefined;
  subscribe(listener: () => void): () => void;
  cancel(fileId: string): void;
  whenIdle(): Promise<void>;
};

/**
 * Summarize an RGBA sample without loading a Vision model.
 *
 * This is intentionally deterministic and cheap enough for a Worker. The
 * returned boxes are normalized, so a low-resolution sample can still seed
 * later extraction and selection work at the source image's dimensions.
 */
export function summarizeAssetPixels(
  fileId: string,
  sourceWidth: number,
  sourceHeight: number,
  rgba: ArrayLike<number>,
  sampleWidth: number,
  sampleHeight: number,
): AssetAnalysisResult {
  const alphaCoverage = alphaCoverageFromRgba(rgba, 20);
  const hasTransparency = alphaCoverage < 0.995;
  const alphaComponents = findAlphaComponents(rgba, sampleWidth, sampleHeight, {
    alphaThreshold: 20,
    minAreaRatio: 0.0005,
    maxComponents: 128,
    padding: 0,
    thinComponentMinArea: 8,
    thinComponentMaxThickness: 8,
    thinComponentMinLength: 12,
  });

  return {
    fileId,
    sourceWidth,
    sourceHeight,
    sampleWidth,
    sampleHeight,
    alphaCoverage,
    hasTransparency,
    alphaComponents,
    analyzedAt: Date.now(),
    mode: hasTransparency ? "alpha" : "metadata",
    foregroundStatus: hasTransparency ? "not-needed" : undefined,
  };
}

type Entry = {
  input: AssetAnalysisInput;
  state: AssetAnalysisState;
  controller?: AbortController;
  promise?: Promise<void>;
};

const defaultSchedule = (task: () => void): void => {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(() => task(), { timeout: 1200 });
    return;
  }
  setTimeout(task, 0);
};

export function createAssetAnalysisScheduler(
  options: AssetAnalysisSchedulerOptions,
): AssetAnalysisScheduler {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const idleWaiters = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
    if ([...entries.values()].every((entry) => !entry.promise)) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  };

  const run = (entry: Entry) => {
    if (entry.state.status === "cancelled" || entry.promise) return;
    entry.state = {
      ...entry.state,
      status: "analyzing",
      progress: 0,
      stage: "sampling",
      error: undefined,
    };
    const controller = new AbortController();
    entry.controller = controller;
    emit();

    entry.promise = Promise.resolve()
      .then(() =>
        options.analyze(entry.input, controller.signal, (progress, stage) => {
          if (entry.state.status === "cancelled") return;
          entry.state = {
            ...entry.state,
            status: "analyzing",
            progress: clamp01(progress),
            stage,
          };
          emit();
        }),
      )
      .then((result) => {
        if (entry.state.status === "cancelled") return;
        entry.state = {
          ...entry.state,
          status: "ready",
          progress: 1,
          stage: "complete",
          result,
          error: undefined,
        };
      })
      .catch((error: unknown) => {
        if (entry.state.status === "cancelled") return;
        const name = error instanceof Error ? error.name : "";
        if (name === "AbortError") {
          entry.state = {
            ...entry.state,
            status: "cancelled",
            progress: 0,
            stage: "queued",
          };
          return;
        }
        entry.state = {
          ...entry.state,
          status: "failed",
          progress: 0,
          stage: "complete",
          error: error instanceof Error ? error.message : String(error),
        };
      })
      .finally(() => {
        entry.promise = undefined;
        entry.controller = undefined;
        emit();
      });
  };

  return {
    enqueue(input) {
      const existing = entries.get(input.fileId);
      if (
        existing &&
        (existing.state.status === "queued" ||
          existing.state.status === "analyzing" ||
          existing.state.status === "ready")
      ) {
        return;
      }

      const entry: Entry = {
        input,
        state: {
          fileId: input.fileId,
          status: "queued",
          progress: 0,
          stage: "queued",
        },
      };
      entries.set(input.fileId, entry);
      emit();
      (options.schedule ?? defaultSchedule)(() => run(entry));
    },

    get(fileId) {
      const state = entries.get(fileId)?.state;
      // Entries are immutable snapshots; returning the same object until the
      // next state transition keeps useSyncExternalStore snapshots stable.
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    cancel(fileId) {
      const entry = entries.get(fileId);
      if (!entry) return;
      entry.controller?.abort();
      entry.state = {
        ...entry.state,
        status: "cancelled",
        progress: 0,
        stage: "queued",
      };
      emit();
    },

    whenIdle() {
      if ([...entries.values()].every((entry) => !entry.promise)) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.add(resolve));
    },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
