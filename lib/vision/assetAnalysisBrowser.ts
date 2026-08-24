import {
  type AssetAnalysisAdapter,
  type AssetAnalysisInput,
  type AssetAnalysisResult,
  type AssetAnalysisStage,
  createAssetAnalysisScheduler,
  summarizeAssetPixels,
} from "./assetAnalysis";
import { analyzeAssetInWorker, canRunAssetAnalysisWorker } from "./assetAnalysisWorkerClient";

const ANALYSIS_SAMPLE_MAX_DIMENSION = 768;
const FOREGROUND_SAMPLE_MAX_DIMENSION = 1024;

const browserAnalyzer: AssetAnalysisAdapter = async (input, signal, onProgress) => {
  onProgress?.(0.08, "sampling");
  const base = await analyzeAssetAlpha(input, signal, ANALYSIS_SAMPLE_MAX_DIMENSION);
  onProgress?.(0.35, "components");

  if (base.hasTransparency) {
    return { ...base, foregroundStatus: "not-needed" };
  }

  if (!shouldPrepareForegroundPreview()) {
    return { ...base, foregroundStatus: "skipped" };
  }

  try {
    onProgress?.(0.4, "foreground");
    const preview = await createImagePreview(
      input.dataURL,
      FOREGROUND_SAMPLE_MAX_DIMENSION,
      signal,
    );
    const { removeBackground } = await import("@/lib/ai/removeBg");
    const foregroundPreviewUrl = await removeBackground(preview.dataURL, {
      signal,
      onProgress: (progress) => onProgress?.(0.4 + progress * 0.4, "foreground"),
    });
    const foreground = await analyzeAssetAlpha(
      {
        ...input,
        dataURL: foregroundPreviewUrl,
        width: preview.width,
        height: preview.height,
      },
      signal,
      FOREGROUND_SAMPLE_MAX_DIMENSION,
    );
    onProgress?.(0.95, "components");
    return {
      ...base,
      foregroundCoverage: foreground.alphaCoverage,
      foregroundComponents: foreground.alphaComponents,
      foregroundPreviewUrl,
      foregroundStatus: "ready",
      mode: "foreground-preview",
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return {
      ...base,
      foregroundStatus: "failed",
      foregroundError: error instanceof Error ? error.message : String(error),
    };
  }
};

let scheduler: ReturnType<typeof createAssetAnalysisScheduler> | null = null;

export function getAssetAnalysisScheduler() {
  if (scheduler) return scheduler;
  scheduler = createAssetAnalysisScheduler({
    analyze: browserAnalyzer,
  });
  return scheduler;
}

export function enqueueAssetAnalysis(input: AssetAnalysisInput): void {
  getAssetAnalysisScheduler().enqueue(input);
}

export function getAssetAnalysis(fileId: string) {
  return getAssetAnalysisScheduler().get(fileId);
}

export function subscribeAssetAnalysis(listener: () => void): () => void {
  return getAssetAnalysisScheduler().subscribe(listener);
}

async function analyzeAssetAlpha(
  input: AssetAnalysisInput,
  signal: AbortSignal,
  maxDimension: number,
): Promise<AssetAnalysisResult> {
  if (canRunAssetAnalysisWorker()) {
    return analyzeAssetInWorker(input, { signal, maxDimension });
  }

  const image = await decodeImage(input.dataURL, signal);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the asset analysis canvas.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  return summarizeAssetPixels(input.fileId, input.width, input.height, pixels.data, width, height);
}

async function createImagePreview(
  dataURL: string,
  maxDimension: number,
  signal: AbortSignal,
): Promise<{ dataURL: string; width: number; height: number }> {
  const image = await decodeImage(dataURL, signal);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the foreground preview canvas.");
  context.drawImage(image, 0, 0, width, height);
  throwIfAborted(signal);
  return { dataURL: canvas.toDataURL("image/png"), width, height };
}

function decodeImage(dataURL: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const image = new Image();
    const onAbort = () => {
      image.onload = null;
      image.onerror = null;
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    image.onload = () => {
      signal.removeEventListener("abort", onAbort);
      resolve(image);
    };
    image.onerror = () => {
      signal.removeEventListener("abort", onAbort);
      reject(new Error("Could not decode the image for background analysis."));
    };
    image.src = dataURL;
  });
}

function shouldPrepareForegroundPreview(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return deviceMemory === undefined || deviceMemory > 2;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function abortError(): Error {
  const error = new Error("Asset analysis was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export type { AssetAnalysisStage };
