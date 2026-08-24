export type ModelStatus = "lazy" | "loading" | "loaded" | "failed";
export type ModelKind = "model" | "runtime" | "remote";
export type ModelCacheStatus = "cached" | "not-cached" | "unknown" | "not-applicable";

export type ModelDefinition = {
  id: string;
  label: string;
  provider: string;
  kind: ModelKind;
  mode: "local" | "api" | "hybrid";
  description: string;
  lazy: boolean;
  cacheIds: readonly string[];
};

export type ModelState = ModelDefinition & {
  status: ModelStatus;
  progress: number;
  error?: string;
  loadedAt?: number;
};

export type ModelCacheInfo = {
  modelId: string;
  status: ModelCacheStatus;
  bytes: number;
  entries: number;
  cacheNames: string[];
};

export type CacheStorageReport = {
  models: Record<string, ModelCacheInfo>;
  totalModelBytes: number;
  totalModelEntries: number;
  cacheNames: string[];
  usageBytes?: number;
  quotaBytes?: number;
  inspectedAt: number;
};

export const MODEL_DEFINITIONS: readonly ModelDefinition[] = [
  {
    id: "florence-2",
    label: "Florence-2",
    provider: "ONNX Community",
    kind: "model",
    mode: "local",
    description: "Caption, OCR, labels and optional vision fallback.",
    lazy: true,
    cacheIds: ["onnx-community/Florence-2-base-ft", "onnx-community/Florence-2-base"],
  },
  {
    id: "rmbg-1.4",
    label: "RMBG-1.4",
    provider: "BRIA",
    kind: "model",
    mode: "local",
    description: "Local background removal and foreground alpha.",
    lazy: true,
    cacheIds: ["briaai/RMBG-1.4"],
  },
  {
    id: "grounding-dino-tiny",
    label: "Grounding DINO Tiny",
    provider: "IDEA / ONNX Community",
    kind: "model",
    mode: "local",
    description: "Open-vocabulary object proposals and labels.",
    lazy: true,
    cacheIds: ["onnx-community/grounding-dino-tiny-ONNX"],
  },
  {
    id: "sam2-hiera-tiny",
    label: "SAM 2 Hiera Tiny",
    provider: "Meta / ONNX Community",
    kind: "model",
    mode: "local",
    description: "Promptable mask refinement from boxes and points.",
    lazy: true,
    cacheIds: ["onnx-community/sam2-hiera-tiny"],
  },
  {
    id: "opencv-js",
    label: "OpenCV.js",
    provider: "OpenCV",
    kind: "runtime",
    mode: "local",
    description: "Healing, GrabCut and advanced raster operations.",
    lazy: true,
    cacheIds: [],
  },
  {
    id: "vectorizer",
    label: "Vectorizer Runtime",
    provider: "ArtShift Local Worker",
    kind: "runtime",
    mode: "local",
    description: "Raster-to-vector tracing worker; no model download.",
    lazy: true,
    cacheIds: [],
  },
];

const definitionsById = new Map(MODEL_DEFINITIONS.map((definition) => [definition.id, definition]));
const stateById = new Map<string, ModelState>(
  MODEL_DEFINITIONS.map((definition) => [
    definition.id,
    {
      ...definition,
      status: "lazy",
      progress: 0,
    },
  ]),
);
const listeners = new Set<() => void>();
const releaseHandlers = new Map<string, Set<() => void | Promise<void>>>();
let snapshot = createSnapshot();

function createSnapshot(): readonly ModelState[] {
  return MODEL_DEFINITIONS.map((definition) => stateById.get(definition.id) as ModelState);
}

function emit(): void {
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

function updateModel(id: string, patch: Partial<ModelState>): void {
  const current = stateById.get(id);
  if (!current) return;
  stateById.set(id, { ...current, ...patch });
  emit();
}

export function getModelStates(): readonly ModelState[] {
  return snapshot;
}

export function getModelDefinition(id: string): ModelDefinition | undefined {
  return definitionsById.get(id);
}

export function subscribeModelRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function markModelLoading(id: string): void {
  updateModel(id, { status: "loading", progress: 0, error: undefined });
}

export function markModelProgress(id: string, progress: number): void {
  const current = stateById.get(id);
  if (!current) return;
  updateModel(id, {
    status: current.status === "loaded" ? "loaded" : "loading",
    progress: Math.max(0, Math.min(1, progress)),
  });
}

export function markModelLoaded(id: string): void {
  updateModel(id, { status: "loaded", progress: 1, loadedAt: Date.now(), error: undefined });
}

export function markModelFailed(id: string, error: unknown): void {
  updateModel(id, {
    status: "failed",
    progress: 0,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function resetModelRuntimeStatus(id: string): void {
  updateModel(id, { status: "lazy", progress: 0, error: undefined, loadedAt: undefined });
}

export function registerModelRuntimeReleaser(
  id: string,
  release: () => void | Promise<void>,
): () => void {
  const handlers = releaseHandlers.get(id) ?? new Set<() => void | Promise<void>>();
  handlers.add(release);
  releaseHandlers.set(id, handlers);
  return () => handlers.delete(release);
}

export async function releaseModelRuntime(id: string): Promise<void> {
  const handlers = releaseHandlers.get(id);
  if (handlers) {
    for (const release of handlers) await release();
  }
  resetModelRuntimeStatus(id);
}

export async function releaseAllModelRuntimes(): Promise<void> {
  for (const definition of MODEL_DEFINITIONS) await releaseModelRuntime(definition.id);
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes < 1) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function cacheUrlMatchesModel(url: string, model: ModelDefinition): boolean {
  const decoded = decodeURIComponent(url).toLowerCase();
  return model.cacheIds.some((cacheId) => decoded.includes(cacheId.toLowerCase()));
}

function emptyCacheInfo(model: ModelDefinition): ModelCacheInfo {
  return {
    modelId: model.id,
    status: model.cacheIds.length ? "not-cached" : "not-applicable",
    bytes: 0,
    entries: 0,
    cacheNames: [],
  };
}

export async function inspectModelCache(): Promise<CacheStorageReport> {
  const models = Object.fromEntries(
    MODEL_DEFINITIONS.map((definition) => [definition.id, emptyCacheInfo(definition)]),
  ) as Record<string, ModelCacheInfo>;
  const cacheNames =
    typeof window !== "undefined" && "caches" in window ? await window.caches.keys() : [];

  for (const cacheName of cacheNames) {
    const cache = await window.caches.open(cacheName);
    const requests = await cache.keys();
    for (const request of requests) {
      const matched = MODEL_DEFINITIONS.filter((definition) =>
        cacheUrlMatchesModel(request.url, definition),
      );
      if (!matched.length) continue;
      const response = await cache.match(request);
      const headerBytes = Number(response?.headers.get("content-length") ?? 0);
      let bytes = Number.isFinite(headerBytes) ? headerBytes : 0;
      if (!bytes && response) {
        try {
          bytes = (await response.clone().blob()).size;
        } catch {
          bytes = 0;
        }
      }
      for (const definition of matched) {
        const info = models[definition.id];
        info.status = "cached";
        info.bytes += bytes;
        info.entries += 1;
        if (!info.cacheNames.includes(cacheName)) info.cacheNames.push(cacheName);
      }
    }
  }

  let usageBytes: number | undefined;
  let quotaBytes: number | undefined;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    usageBytes = estimate.usage;
    quotaBytes = estimate.quota;
  }

  return {
    models,
    totalModelBytes: Object.values(models).reduce((sum, info) => sum + info.bytes, 0),
    totalModelEntries: Object.values(models).reduce((sum, info) => sum + info.entries, 0),
    cacheNames,
    usageBytes,
    quotaBytes,
    inspectedAt: Date.now(),
  };
}

export async function clearModelCache(
  modelId: string,
): Promise<{ deleted: number; success: boolean }> {
  const definition = definitionsById.get(modelId);
  if (!definition || typeof window === "undefined" || !("caches" in window)) {
    await releaseModelRuntime(modelId);
    return { deleted: 0, success: true };
  }

  let deleted = 0;
  try {
    for (const cacheName of await window.caches.keys()) {
      const cache = await window.caches.open(cacheName);
      for (const request of await cache.keys()) {
        if (cacheUrlMatchesModel(request.url, definition) && (await cache.delete(request))) {
          deleted += 1;
        }
      }
    }
    await releaseModelRuntime(modelId);
    return { deleted, success: true };
  } catch (error) {
    markModelFailed(modelId, error);
    return { deleted, success: false };
  }
}

export async function clearKnownModelCaches(): Promise<{ deleted: number; success: boolean }> {
  let deleted = 0;
  let success = true;
  for (const definition of MODEL_DEFINITIONS) {
    const result = await clearModelCache(definition.id);
    deleted += result.deleted;
    success = success && result.success;
  }
  return { deleted, success };
}

/** Destructive escape hatch for the explicit “clear every CacheStorage entry” action. */
export async function clearAllCacheStorage(): Promise<{ deleted: number; success: boolean }> {
  if (typeof window === "undefined" || !("caches" in window)) {
    await releaseAllModelRuntimes();
    return { deleted: 0, success: true };
  }
  let deleted = 0;
  try {
    for (const cacheName of await window.caches.keys()) {
      if (await window.caches.delete(cacheName)) deleted += 1;
    }
    await releaseAllModelRuntimes();
    return { deleted, success: true };
  } catch (error) {
    console.warn("Failed to clear CacheStorage:", error);
    return { deleted, success: false };
  }
}
