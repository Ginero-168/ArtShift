"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type AIProgressStatus, reportAIProgress, reportAIResult } from "@/lib/ai/progressReporter";
import { removeBackgroundWithRuntime } from "@/lib/ai/removeBg";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL } from "@/lib/engine/imageCache";
import {
  getProcessingPreviewBounds,
  updateProcessingPreview,
} from "@/lib/engine/processingPreview";
import {
  cancelProcessingJob,
  enqueueProcessingJob,
  type ProcessingJobContext,
} from "@/lib/engine/processingQueue";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  VECTORIZE_PRESET_CONFIGS,
  VectorizeCancelledError,
  type VectorizeClustering,
  type VectorizeComposition,
  type VectorizeOptions,
  type VectorizePreset,
  type VectorizeProgress,
  type VectorizeTraceMode,
  vectorizeImage,
} from "@/lib/vectorize/vectorizer";
import {
  DEFAULT_VECTORIZE_BACKEND,
  getVTracerPresetDefaults,
  type VectorizeBackend,
} from "@/lib/vectorize/vectorizerBackend";
import {
  getSvgViewport,
  parseVTracerSvgResult,
  RECRAFT_SVG_LIMITS,
} from "@/lib/vectorize/vtracerAdapter";
import {
  createSam2Session,
  groundingDinoDetect,
  type Sam2Session,
  type VisionMask,
} from "@/lib/vision/advancedVision";
import { findAlphaComponents } from "@/lib/vision/alphaComponents";
import {
  enqueueAssetAnalysis,
  getAssetAnalysis,
  subscribeAssetAnalysis,
} from "@/lib/vision/assetAnalysisBrowser";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import {
  alphaCoverageFromRgba,
  hasUsableForeground,
  isForegroundForSource,
} from "@/lib/vision/foreground";
import { resolveInstanceMaskOverlaps } from "@/lib/vision/instanceMask";
import {
  mergeVisionWithAlphaComponents,
  shouldPreserveAlphaForProposal,
} from "@/lib/vision/objectBoxes";
import { resetAICache } from "@/lib/vision/resetCache";
import {
  cropImageRegion,
  cropImageRegionWithMask,
  trimTransparentRegion,
  visionDenseDetect,
  visionDetect,
} from "@/lib/vision/visionEngine";
import { mergeVisionDetections, shouldRunVisionRecall } from "@/lib/vision/visionRecall";

interface DetectedObject {
  label: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

type VectorizeEngineSettings = {
  preset: VectorizePreset;
  colors: number;
  detailLevel: 1 | 2 | 3 | 4 | 5;
  smoothing: number;
  cornerSharpness: number;
  minArea: number;
  vtracerMode: VectorizeTraceMode;
  vtracerComposition: VectorizeComposition;
  vtracerClustering: VectorizeClustering;
  vtracerLayerDifference: number;
  vtracerFilterSpeckle: number;
  vtracerBinaryThreshold: number;
  vtracerMaxColors: number | null;
  vtracerUsePresetDefaults: boolean;
  vtracerSimplifyEnabled: boolean;
};

function createVectorizeEngineSettings(isVTracer = false): VectorizeEngineSettings {
  const preset = "highFidelity" as const;
  const generic = VECTORIZE_PRESET_CONFIGS[preset];
  const native = getVTracerPresetDefaults(preset);
  return {
    preset,
    colors: isVTracer ? (native.maxColors ?? generic.colors) : generic.colors,
    detailLevel: generic.detailLevel,
    smoothing: generic.smoothing,
    cornerSharpness: generic.cornerSharpness,
    minArea: generic.minArea,
    vtracerMode: native.mode,
    vtracerComposition: native.hierarchical,
    vtracerClustering: native.clustering,
    vtracerLayerDifference: native.layerDifference,
    vtracerFilterSpeckle: native.filterSpeckle,
    vtracerBinaryThreshold: native.binaryThreshold,
    vtracerMaxColors: isVTracer ? native.maxColors : null,
    vtracerUsePresetDefaults: isVTracer,
    vtracerSimplifyEnabled: false,
  };
}

const VTRACER_PRESET_BUTTONS: readonly {
  value: Exclude<VectorizePreset, "custom">;
  label: string;
}[] = [
  { value: "highFidelity", label: "Poster (Official)" },
  { value: "photoDetailed", label: "Photo (Official)" },
  { value: "lineArt", label: "B&W (Official)" },
];

async function measureAlphaCoverage(dataUrl: string): Promise<number> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not inspect extracted foreground."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const context = canvas.getContext("2d");
  if (!context || canvas.width < 1 || canvas.height < 1) return 0;

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return alphaCoverageFromRgba(pixels);
}

async function detectAlphaObjectBoxes(
  dataUrl: string,
  maxDimension = 768,
): Promise<DetectedObject[]> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not inspect the transparent foreground."));
  });

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) throw new Error("Could not create the foreground analysis canvas.");
  fullContext.drawImage(image, 0, 0, width, height);

  const rgba = fullContext.getImageData(0, 0, width, height).data;
  return findAlphaComponents(rgba, width, height, {
    alphaThreshold: 24,
    minAreaRatio: 0.0005,
    maxComponents: 128,
    padding: 2,
    thinComponentMinArea: 8,
    thinComponentMaxThickness: 8,
    thinComponentMinLength: 12,
  })
    .sort((first, second) => second.area - first.area)
    .slice(0, 128)
    .sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min)
    .map(({ area: _area, ...box }) => ({ label: "object", ...box }));
}

function createProgressReporter(operation: string) {
  const taskId = crypto.randomUUID();
  const report = (
    stage: string,
    message: string,
    status: AIProgressStatus = "step",
    progress?: number,
  ) => {
    reportAIProgress({ taskId, operation, stage, message, status, progress });
  };
  return Object.assign(report, {
    result: (message: string) => reportAIResult({ taskId, operation, message }),
  });
}

function processingPreviewInput(
  element: ImageElement,
  kind: "extract" | "remove-bg" | "vectorize",
  label: string,
  sourceDataUrl?: string,
) {
  return {
    ...getProcessingPreviewBounds(element),
    kind,
    label,
    progress: 0,
    message: "กำลังเตรียมผลลัพธ์…",
    sourceDataUrl,
  } as const;
}

export function VisionObjectIsolator({ element }: { element: ImageElement }) {
  const addElement = useEngine((s) => s.addElement);
  const addElements = useEngine((s) => s.addElements);
  const selectOnly = useEngine((s) => s.selectOnly);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [detectedForegroundUrl, setDetectedForegroundUrl] = useState<string | null>(null);
  const [detectedForegroundFileId, setDetectedForegroundFileId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [allowServerFallback, setAllowServerFallback] = useState(false);
  const [lastRmbgRuntime, setLastRmbgRuntime] = useState<"local" | "vps-fallback">("local");
  // Vectorizer State — keep Custom and VTracer settings independent.
  const [backend, setBackend] = useState<VectorizeBackend>(DEFAULT_VECTORIZE_BACKEND);
  const [vectorizeOpen, setVectorizeOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customSettings, setCustomSettings] = useState<VectorizeEngineSettings>(() =>
    createVectorizeEngineSettings(),
  );
  const [vtracerSettings, setVTracerSettings] = useState<VectorizeEngineSettings>(() =>
    createVectorizeEngineSettings(true),
  );
  const activeSettings = backend === "custom" ? customSettings : vtracerSettings;
  const updateActiveSettings = (patch: Partial<VectorizeEngineSettings>) => {
    const update = (current: VectorizeEngineSettings) => ({ ...current, ...patch });
    if (backend === "custom") setCustomSettings(update);
    else setVTracerSettings(update);
  };
  const preset = activeSettings.preset;
  const colors = activeSettings.colors;
  const detailLevel = activeSettings.detailLevel;
  const smoothing = activeSettings.smoothing;
  const cornerSharpness = activeSettings.cornerSharpness;
  const minArea = activeSettings.minArea;
  const vtracerMode = activeSettings.vtracerMode;
  const vtracerComposition = activeSettings.vtracerComposition;
  const vtracerClustering = activeSettings.vtracerClustering;
  const vtracerLayerDifference = activeSettings.vtracerLayerDifference;
  const vtracerFilterSpeckle = activeSettings.vtracerFilterSpeckle;
  const vtracerBinaryThreshold = activeSettings.vtracerBinaryThreshold;
  const vtracerMaxColors = activeSettings.vtracerMaxColors;
  const vtracerUsePresetDefaults = activeSettings.vtracerUsePresetDefaults;
  const vtracerSimplifyEnabled = activeSettings.vtracerSimplifyEnabled;
  const setPreset = (value: VectorizePreset) => updateActiveSettings({ preset: value });
  const setColors = (value: number) => updateActiveSettings({ colors: value });
  const setDetailLevel = (value: 1 | 2 | 3 | 4 | 5) => updateActiveSettings({ detailLevel: value });
  const setSmoothing = (value: number) => updateActiveSettings({ smoothing: value });
  const setCornerSharpness = (value: number) => updateActiveSettings({ cornerSharpness: value });
  const setMinArea = (value: number) => updateActiveSettings({ minArea: value });
  const setVTracerMode = (value: VectorizeTraceMode) =>
    updateActiveSettings({ vtracerMode: value });
  const setVTracerComposition = (value: VectorizeComposition) =>
    updateActiveSettings({ vtracerComposition: value });
  const setVTracerClustering = (value: VectorizeClustering) =>
    updateActiveSettings({ vtracerClustering: value });
  const setVTracerLayerDifference = (value: number) =>
    updateActiveSettings({ vtracerLayerDifference: value });
  const setVTracerFilterSpeckle = (value: number) =>
    updateActiveSettings({ vtracerFilterSpeckle: value });
  const setVTracerBinaryThreshold = (value: number) =>
    updateActiveSettings({ vtracerBinaryThreshold: value });
  const setVTracerMaxColors = (value: number | null) =>
    updateActiveSettings({ vtracerMaxColors: value });
  const setVTracerUsePresetDefaults = (value: boolean) =>
    updateActiveSettings({ vtracerUsePresetDefaults: value });
  const setVTracerSimplifyEnabled = (value: boolean) =>
    updateActiveSettings({ vtracerSimplifyEnabled: value });
  const isMonochromeTrace =
    preset === "silhouette" || preset === "lineArt" || vtracerClustering === "bw";
  const processingJobIdRef = useRef<string | null>(null);
  const updateCanvasProcessingPreview = (
    id: string,
    patch: { progress?: number; message?: string },
  ) => {
    updateProcessingPreview(id, patch);
  };
  const currentFileId = element.fileId;
  const assetAnalysis = useSyncExternalStore(
    subscribeAssetAnalysis,
    () => getAssetAnalysis(currentFileId) ?? null,
    () => null,
  );

  useEffect(() => {
    if (!currentFileId) return;
    setDetectedObjects([]);
    if (detectedForegroundFileId !== currentFileId) {
      setDetectedForegroundUrl(null);
      setDetectedForegroundFileId(null);
      setLastRmbgRuntime("local");
    }
  }, [currentFileId, detectedForegroundFileId]);

  useEffect(() => {
    if (assetAnalysis || !currentFileId) return;
    const cached = getCached(currentFileId);
    if (!cached) return;
    enqueueAssetAnalysis({
      fileId: cached.fileId,
      dataURL: cached.dataURL,
      width: cached.width,
      height: cached.height,
    });
  }, [assetAnalysis, currentFileId]);

  useEffect(() => {
    const components =
      assetAnalysis?.result?.foregroundComponents ??
      (assetAnalysis?.result?.hasTransparency ? assetAnalysis.result.alphaComponents : undefined);
    if (
      assetAnalysis?.fileId !== currentFileId ||
      assetAnalysis.status !== "ready" ||
      !components?.length
    ) {
      return;
    }
    setDetectedObjects((current) =>
      current.length > 0
        ? current
        : components.map((component) => ({ label: "object", ...component })),
    );
  }, [assetAnalysis, currentFileId]);

  const applyPreset = (p: VectorizePreset) => {
    setPreset(p);
    const vtracerDefaults = getVTracerPresetDefaults(p);
    setVTracerMode(vtracerDefaults.mode);
    setVTracerComposition(vtracerDefaults.hierarchical);
    setVTracerClustering(vtracerDefaults.clustering);
    setVTracerLayerDifference(vtracerDefaults.layerDifference);
    setVTracerFilterSpeckle(vtracerDefaults.filterSpeckle);
    setVTracerBinaryThreshold(vtracerDefaults.binaryThreshold);
    setVTracerMaxColors(backend === "vtracer-wasm" ? vtracerDefaults.maxColors : null);
    setVTracerUsePresetDefaults(backend === "vtracer-wasm" && p !== "custom");
    setVTracerSimplifyEnabled(false);
    if (p !== "custom") {
      const cfg = VECTORIZE_PRESET_CONFIGS[p];
      setColors(
        backend === "vtracer-wasm" ? (vtracerDefaults.maxColors ?? cfg.colors) : cfg.colors,
      );
      setDetailLevel(cfg.detailLevel);
      setSmoothing(cfg.smoothing);
      setCornerSharpness(cfg.cornerSharpness);
      setMinArea(cfg.minArea);
    }
  };

  const toggleVectorizeSettings = (nextBackend: VectorizeBackend) => {
    if (backend === nextBackend && vectorizeOpen) {
      setVectorizeOpen(false);
      return;
    }
    setBackend(nextBackend);
    setVectorizeOpen(true);
    setShowAdvanced(nextBackend === "vtracer-wasm");
  };

  const getImageDataUrl = useCallback(async (): Promise<string | null> => {
    const cached = getCached(element.fileId);
    return cached?.dataURL ?? null;
  }, [element.fileId]);

  const handleVectorize = async (
    customOpts?: Partial<VectorizeOptions>,
    queuedContext?: ProcessingJobContext,
  ) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(
          element,
          "vectorize",
          backend === "vtracer-wasm" ? "VTracer WASM" : "Custom Auto-Trace",
          url,
        ),
        run: (context) => handleVectorize(customOpts, context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(0);
    setStatusMessage("Running high-precision Vector Trace...");
    const report = createProgressReporter("Vectorize");
    report("start", "เริ่มแปลงภาพเป็น Vector", "started", 0);

    try {
      const isMonochrome = isMonochromeTrace;
      const res = await vectorizeImage(
        url,
        getProcessingPreviewBounds(element),
        {
          backend,
          preset,
          mode: isMonochrome ? "monochrome" : "color",
          colors:
            isMonochrome || backend === "custom"
              ? isMonochrome
                ? 2
                : colors
              : (vtracerMaxColors ?? colors),
          detailLevel,
          smoothing,
          cornerSharpness,
          minArea,
          vtracer:
            backend === "vtracer-wasm"
              ? {
                  mode: vtracerMode,
                  hierarchical: vtracerComposition,
                  clustering: isMonochrome ? "bw" : vtracerClustering,
                  filterSpeckle: vtracerFilterSpeckle,
                  layerDifference: vtracerLayerDifference,
                  binaryThreshold: vtracerBinaryThreshold,
                  maxColors: vtracerMaxColors,
                  usePresetDefaults: vtracerUsePresetDefaults && preset !== "custom",
                  simplify: vtracerSimplifyEnabled
                    ? Number(Math.max(0.5, Math.min(2.5, 0.35 + smoothing * 2)).toFixed(2))
                    : null,
                }
              : undefined,
          ...customOpts,
        },
        {
          signal,
          onProgress: ({ progress, stage }: VectorizeProgress) => {
            const message =
              stage === "loading"
                ? backend === "vtracer-wasm"
                  ? "Loading VTracer WASM in the local Worker..."
                  : "Loading image for vectorization..."
                : stage === "quantizing"
                  ? backend === "vtracer-wasm"
                    ? "VTracer clustering image colors..."
                    : "Quantizing image colors..."
                  : stage === "tracing"
                    ? backend === "vtracer-wasm"
                      ? "VTracer fitting vector curves..."
                      : "Tracing contours in background..."
                    : backend === "vtracer-wasm"
                      ? "Converting VTracer SVG into editable paths..."
                      : "Building editable vector paths...";
            setProgress(Math.round(progress * 100));
            setStatusMessage(message);
            updateCanvasProcessingPreview(previewId, { progress, message });
          },
        },
      );

      if (res.elements.length === 0) {
        setStatusMessage("No distinct vector paths detected");
        report("complete", "ไม่พบเส้น Vector ที่แยกได้", "fallback", 100);
      } else {
        const usedBackend = res.backend ?? backend;
        const usedFallback = backend === "vtracer-wasm" && usedBackend === "custom";
        addElements(res.elements, "vectorize image to paths");
        selectOnly(res.elements.map((el) => el.id));
        setStatusMessage(
          `${usedBackend === "vtracer-wasm" ? "VTracer traced" : "Traced"} ${res.elements.length} vector layers (${res.totalNodes} anchor nodes, ${res.palette.length} colors)!${usedFallback ? " VTracer unavailable; Custom fallback used." : ""}`,
        );
        report(
          "complete",
          `${usedBackend === "vtracer-wasm" ? "VTracer WASM สร้าง" : "สร้าง"} Vector สำเร็จ ${res.elements.length} Layers${usedFallback ? " (ใช้ Custom fallback)" : ""}`,
          "success",
          100,
        );
      }
    } catch (err) {
      if (err instanceof VectorizeCancelledError || (err as Error).name === "AbortError") {
        setStatusMessage("Vectorization cancelled.");
      } else {
        console.warn("Vectorize failed:", err);
        setStatusMessage("Vectorize error: " + (err as Error).message);
        report("error", `แปลง Vector ไม่สำเร็จ: ${(err as Error).message}`, "error");
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleRecraftVectorize = async (queuedContext?: ProcessingJobContext) => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }
    if (!queuedContext) {
      if (
        !window.confirm(
          "Recraft Vectorize จะส่งภาพนี้ไปยัง Replicate เพื่อสร้าง SVG และอาจมีค่าใช้จ่ายตามบัญชี Replicate ดำเนินการต่อหรือไม่?",
        )
      ) {
        return;
      }
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "vectorize", "Recraft Vectorize", cached.dataURL),
        run: (context) => handleRecraftVectorize(context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(8);
    updateCanvasProcessingPreview(previewId, {
      progress: 0.08,
      message: "กำลังส่งภาพไปยัง Replicate…",
    });
    setStatusMessage("Sending image to Recraft via Replicate...");
    const report = createProgressReporter("Recraft Vectorize");
    report("consent", "ผู้ใช้ยืนยันการส่งภาพไป Replicate", "started", 0.08);

    try {
      const response = await fetch("/api/vectorize/recraft", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          task: "vectorize.recraft",
          input: {
            image: { dataUrl: cached.dataURL, mimeType: "image/png" },
            width: cached.width,
            height: cached.height,
          },
          options: {
            profile: "quality",
            provider: "replicate",
            modelAlias: "recraft-vectorize",
            cloudConsent: true,
            allowFallback: false,
            timeoutMs: 120_000,
            cache: false,
          },
        }),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        execution?: { output?: { svg?: unknown } };
        error?: { message?: unknown } | string;
      } | null;
      if (!response.ok) {
        const providerError =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.error?.message === "string"
              ? payload.error.message
              : "Recraft Vectorize request failed.";
        throw new Error(providerError);
      }
      const svg = payload?.execution?.output?.svg;
      if (typeof svg !== "string") throw new Error("Recraft returned no SVG output.");

      setProgress(82);
      setStatusMessage("Validating Recraft SVG and building editable paths...");
      updateCanvasProcessingPreview(previewId, {
        progress: 0.82,
        message: "กำลังตรวจสอบ SVG และสร้าง Vector ที่แก้ไขได้…",
      });
      const viewport = getSvgViewport(svg);
      const result = parseVTracerSvgResult(svg, {
        targetBounds: getProcessingPreviewBounds(element),
        sourceWidth: viewport.width,
        sourceHeight: viewport.height,
        ...RECRAFT_SVG_LIMITS,
      });
      if (result.elements.length === 0) {
        throw new Error("Recraft returned no editable vector paths.");
      }
      addElements(result.elements, "Recraft Vectorize image");
      selectOnly(result.elements.map((item) => item.id));
      setStatusMessage(
        `Recraft Vectorize สร้าง ${result.elements.length} vector layers (${result.totalNodes} anchor nodes, ${result.palette.length} colors)!`,
      );
      report(
        "complete",
        `Recraft Vectorize สร้าง Vector สำเร็จ ${result.elements.length} Layers`,
        "success",
        1,
      );
    } catch (error) {
      if (error instanceof VectorizeCancelledError || (error as Error).name === "AbortError") {
        setStatusMessage("Recraft Vectorization cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Unknown Recraft error.";
        console.warn("Recraft Vectorize failed:", error);
        setStatusMessage(`Recraft Vectorize error: ${message}`);
        report("error", `Recraft Vectorize ไม่สำเร็จ: ${message}`, "error");
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const cancelVectorize = () => {
    if (processingJobIdRef.current) {
      cancelProcessingJob(processingJobIdRef.current);
    }
  };

  const handleRemoveBg = async (queuedContext?: ProcessingJobContext) => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "remove-bg", "Remove Background", cached.dataURL),
        run: (context) => handleRemoveBg(context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(0);
    updateCanvasProcessingPreview(previewId, {
      progress: 0,
      message: "กำลังเตรียมภาพสำหรับลบพื้นหลัง…",
    });
    const report = createProgressReporter("Remove BG");
    report("start", "เริ่มลบพื้นหลังแบบ Local", "started", 0);
    setStatusMessage("Preparing local background removal...");

    try {
      const { dataUrl: resultUrl } = await removeBackgroundWithRuntime(cached.dataURL, {
        allowServerFallback,
        signal,
        onProgress: (value) => {
          const message =
            value < 0.1
              ? "Preparing image..."
              : value < 0.75
                ? "Running locally in the background..."
                : "Refining foreground edges...";
          setProgress(Math.round(value * 100));
          setStatusMessage(message);
          updateCanvasProcessingPreview(previewId, { progress: value, message });
        },
        onServerFallback: () => {
          setStatusMessage("Local model is still loading; using the VPS fallback...");
          updateCanvasProcessingPreview(previewId, {
            message: "โมเดล Local ยังโหลดอยู่ กำลังใช้ VPS fallback…",
          });
          report("vps-fallback", "Local RMBG ยังไม่พร้อม จึงส่งงานไป VPS", "fallback", 8);
        },
        onRuntime: setLastRmbgRuntime,
      });
      const newCached = await loadDataURL(resultUrl);
      const resultImage = createImage({
        ...getProcessingPreviewBounds(element),
        ...createCachedImageAsset(newCached),
      });
      updateProcessingPreview(previewId, {
        progress: 0.95,
        message: "กำลังวาง Duplicate ผลลัพธ์ลงบน Canvas…",
      });
      addElement(resultImage, "remove background duplicate");
      selectOnly([resultImage.id]);
      setDetectedForegroundUrl(resultUrl);
      setDetectedForegroundFileId(element.fileId);
      setDetectedObjects([]);
      setStatusMessage("Background removed successfully!");
      report("complete", "ลบพื้นหลังและสร้าง Alpha สำเร็จ", "success", 100);
    } catch (err) {
      console.warn("Remove BG failed:", err);
      setStatusMessage("Failed to remove background: " + (err as Error).message);
      report("error", `ลบพื้นหลังไม่สำเร็จ: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleResetCache = async () => {
    if (confirm("Reset and purge all cached AI models from browser storage?")) {
      setBusy(true);
      setStatusMessage("Purging AI model cache...");
      const res = await resetAICache();
      setBusy(false);
      setStatusMessage(`Cleared ${res.freedCount} cache entries! Space freed.`);
    }
  };

  const extractObjectBatch = async (
    foregroundUrl: string,
    objects: DetectedObject[],
    onProgress?: (progress: number) => void,
    options: {
      trimTransparent?: boolean;
      sam2Session?: Sam2Session | null;
      maskSourceUrl?: string;
      alphaComponents?: DetectedObject[];
      targetBounds?: { x: number; y: number; width: number; height: number };
      onMaskProgress?: (objectIndex: number, progress: number) => void;
    } = {},
  ) => {
    const newElements = [];
    const targetBounds = options.targetBounds ?? {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
    const masks: Array<VisionMask | null> = objects.map(() => null);

    if (options.sam2Session) {
      for (const [index, obj] of objects.entries()) {
        try {
          masks[index] = await options.sam2Session.segment(obj, (value) =>
            options.onMaskProgress?.(index, value),
          );
        } catch (error) {
          console.warn("SAM 2 mask failed for one object; using foreground crop.", error);
        }
      }

      const validMasks = masks.flatMap((mask, index) =>
        mask ? [{ index, box: objects[index], mask }] : [],
      );
      if (validMasks.length > 1) {
        const resolved = resolveInstanceMaskOverlaps(validMasks);
        for (const [resolvedIndex, candidate] of validMasks.entries()) {
          masks[candidate.index] = resolved[resolvedIndex];
        }
      }
    }

    for (const [index, obj] of objects.entries()) {
      let cropped: Awaited<ReturnType<typeof cropImageRegion>>;
      const mask = masks[index];
      if (mask) {
        try {
          const preserveExistingAlpha = options.alphaComponents
            ? shouldPreserveAlphaForProposal(obj, options.alphaComponents)
            : true;
          cropped = await cropImageRegionWithMask(
            preserveExistingAlpha ? foregroundUrl : (options.maskSourceUrl ?? foregroundUrl),
            obj,
            mask,
            { preserveExistingAlpha },
          );
        } catch (error) {
          console.warn("SAM 2 mask failed for one object; using foreground crop.", error);
          cropped = await cropImageRegion(foregroundUrl, obj);
        }
      } else {
        cropped = await cropImageRegion(foregroundUrl, obj);
      }
      const trimmed = options.trimTransparent
        ? await trimTransparentRegion(cropped.dataUrl, 2)
        : {
            dataUrl: cropped.dataUrl,
            width: cropped.width,
            height: cropped.height,
            offsetX: 0,
            offsetY: 0,
          };
      const alphaCoverage = await measureAlphaCoverage(trimmed.dataUrl);
      if (!hasUsableForeground(alphaCoverage)) {
        onProgress?.((index + 1) / objects.length);
        continue;
      }
      const cached = await loadDataURL(trimmed.dataUrl);
      const asset = createCachedImageAsset(cached);
      const objectWidth = obj.x_max - obj.x_min;
      const objectHeight = obj.y_max - obj.y_min;
      const x = obj.x_min + objectWidth * (trimmed.offsetX / Math.max(1, cropped.width));
      const y = obj.y_min + objectHeight * (trimmed.offsetY / Math.max(1, cropped.height));
      const newImg = createImage({
        x: Math.round(targetBounds.x + targetBounds.width * x),
        y: Math.round(targetBounds.y + targetBounds.height * y),
        width: Math.max(
          20,
          Math.round(
            targetBounds.width * objectWidth * (trimmed.width / Math.max(1, cropped.width)),
          ),
        ),
        height: Math.max(
          20,
          Math.round(
            targetBounds.height * objectHeight * (trimmed.height / Math.max(1, cropped.height)),
          ),
        ),
        ...asset,
      });
      newElements.push(newImg);
      onProgress?.((index + 1) / objects.length);
    }

    return newElements;
  };

  const handleExtractAll = async (queuedContext?: ProcessingJobContext) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "extract", "Extract All", url),
        run: (context) => handleExtractAll(context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(0);
    updateCanvasProcessingPreview(previewId, {
      progress: 0,
      message: "กำลังเตรียม Foreground…",
    });
    const report = createProgressReporter("Extract All");
    const setExtractProgress = (value: number, message?: string) => {
      setProgress(value);
      updateCanvasProcessingPreview(previewId, {
        progress: value / 100,
        ...(message ? { message } : {}),
      });
    };
    report("start", "เริ่มแยก Object ทั้งหมด", "started", 0);
    setStatusMessage("Preparing foreground extraction...");

    try {
      const reusableForeground = isForegroundForSource(
        element.fileId,
        detectedForegroundFileId,
        detectedForegroundUrl,
      )
        ? detectedForegroundUrl
        : null;
      let foregroundUrl: string;
      let foregroundRuntime: "local" | "vps-fallback" = lastRmbgRuntime;
      if (reusableForeground) {
        foregroundUrl = reusableForeground;
        setExtractProgress(70, "ใช้ผลลัพธ์ Remove BG ที่มีอยู่แล้ว…");
        setStatusMessage("Using the existing background-removed foreground...");
        report("foreground", "ใช้ผลลัพธ์ Remove BG ที่มีอยู่แล้ว", "success", 70);
      } else {
        setStatusMessage("Separating foreground pixels...");
        report("foreground", "กำลังลบพื้นหลังเพื่อเตรียม Alpha", "step", 5);
        const result = await removeBackgroundWithRuntime(url, {
          allowServerFallback,
          signal,
          onProgress: (value) => setExtractProgress(value * 70, "กำลังแยก Foreground pixels…"),
          onServerFallback: () => {
            setStatusMessage("Local model is still loading; using the VPS fallback...");
            updateCanvasProcessingPreview(previewId, {
              message: "โมเดล Local ยังโหลดอยู่ กำลังใช้ VPS fallback…",
            });
            report("vps-fallback", "Local RMBG ยังไม่พร้อม จึงส่ง Extract ไป VPS", "fallback", 5);
          },
          onRuntime: (runtime) => {
            foregroundRuntime = runtime;
            setLastRmbgRuntime(runtime);
          },
        });
        foregroundUrl = result.dataUrl;
        foregroundRuntime = result.runtime;
        report(
          "foreground",
          foregroundRuntime === "vps-fallback"
            ? "สร้าง Foreground Alpha สำเร็จด้วย VPS fallback"
            : "สร้าง Foreground Alpha สำเร็จ",
          "success",
          70,
        );
      }
      setDetectedForegroundUrl(foregroundUrl);
      setDetectedForegroundFileId(element.fileId);

      // Alpha extraction is the canonical geometry path. Florence-2 is optional
      // metadata here: its coarse boxes can label components, but must not
      // replace them or cause nearby objects to be merged again.
      setExtractProgress(74, "กำลังค้นหา Components ความละเอียดสูง…");
      setStatusMessage("Finding high-resolution foreground components...");
      report("components", "กำลังค้นหา Components ความละเอียดสูง", "step", 74);
      const alphaObjects = await detectAlphaObjectBoxes(foregroundUrl, 1536);
      let objects = alphaObjects;
      report("components", `พบ Components เบื้องต้น ${alphaObjects.length} ชิ้น`, "success", 78);

      let visionObjects: DetectedObject[] = [];
      try {
        setStatusMessage("Detecting object instances with Florence-2...");
        report("florence", "กำลังใช้ Florence-2 หา Object และชื่อ", "step", 79);
        const res = await visionDetect(url, (value) =>
          setExtractProgress(78 + value * 5, "กำลังตรวจจับ Object ด้วย Florence-2…"),
        );
        visionObjects = res.objects;
        report("florence", `Florence-2 พบ ${visionObjects.length} Proposal`, "success", 83);
      } catch (error) {
        console.warn("Florence-2 labels unavailable; keeping local alpha geometry.", error);
        report("florence", "Florence-2 ใช้งานไม่ได้ จึงใช้ Geometry เดิมต่อ", "fallback", 83);
      }

      if (shouldRunVisionRecall(visionObjects, alphaObjects)) {
        try {
          setStatusMessage("Running a dense recall pass for missed objects...");
          report("florence-recall", "กำลังค้นหา Object ที่ Florence-2 รอบแรกตกหล่น", "step", 84);
          const recall = await visionDenseDetect(url, (value) =>
            setExtractProgress(83 + value * 3, "กำลังค้นหา Object ที่อาจตกหล่น…"),
          );
          visionObjects = mergeVisionDetections(visionObjects, recall.objects);
          report(
            "florence-recall",
            `รวม Dense Recall แล้วเป็น ${visionObjects.length} Proposal`,
            "success",
            86,
          );
        } catch (error) {
          console.warn("Florence-2 dense recall unavailable; keeping primary proposals.", error);
          report("florence-recall", "Dense Recall ใช้งานไม่ได้ จึงใช้ผลรอบแรก", "fallback", 86);
        }
      }

      const candidateLabels = [
        ...new Set(
          visionObjects
            .map((object) => object.label.trim())
            .filter((label) => label && label.toLowerCase() !== "object"),
        ),
      ];
      if (candidateLabels.length > 0) {
        try {
          setStatusMessage("Finding repeated instances with Grounding DINO...");
          report("grounding-dino", "กำลังค้นหา Instance ซ้ำด้วย Grounding DINO", "step", 87);
          const grounded = await groundingDinoDetect(url, candidateLabels, (value) =>
            setExtractProgress(86 + value * 3, "กำลังตรวจจับ Instance ที่ซ้ำกัน…"),
          );
          visionObjects = mergeVisionDetections(visionObjects, grounded);
          report(
            "grounding-dino",
            `รวม Grounding DINO แล้วเป็น ${visionObjects.length} Proposal`,
            "success",
            89,
          );
        } catch (error) {
          console.warn("Grounding DINO unavailable; keeping Florence proposals.", error);
          report("grounding-dino", "Grounding DINO ใช้งานไม่ได้ จึงใช้ Florence ต่อ", "fallback", 89);
        }
      }

      objects = mergeVisionWithAlphaComponents(visionObjects, alphaObjects);
      report("proposal-fusion", `รวม Proposal สุดท้ายได้ ${objects.length} ชิ้น`, "success", 90);
      setDetectedObjects(objects);
      if (objects.length === 0) {
        setStatusMessage("No visible foreground objects were found");
        report("complete", "ไม่พบ Object ที่แยกได้จาก Foreground", "fallback", 100);
        return;
      }

      let sam2Session: Sam2Session | null = null;
      try {
        setStatusMessage("Refining object masks with SAM 2 Hiera Tiny...");
        report("sam2-load", "กำลังโหลดและเตรียม SAM 2 Hiera Tiny", "step", 91);
        sam2Session = await createSam2Session(url, (value) =>
          setExtractProgress(90 + value * 3, "กำลังปรับ Mask ของแต่ละ Object…"),
        );
        report("sam2-load", "เตรียม SAM 2 และ Image Embedding สำเร็จ", "success", 93);
      } catch (error) {
        console.warn("SAM 2 refinement unavailable; keeping alpha geometry.", error);
        setStatusMessage("SAM 2 unavailable; extracting from foreground geometry...");
        report("sam2-load", "SAM 2 ใช้งานไม่ได้ จึงใช้ Alpha Geometry แทน", "fallback", 93);
      }

      setStatusMessage(`Extracting all ${objects.length} foreground objects...`);
      report(
        "masks",
        sam2Session
          ? `กำลังสร้าง Mask จริงให้ ${objects.length} Object ด้วย SAM 2`
          : `กำลังสร้าง Object จาก Alpha Geometry จำนวน ${objects.length} ชิ้น`,
        "step",
        93,
      );
      setExtractProgress(92, "กำลังสร้างภาพจำลองของ Object ที่แยกได้…");
      const newElements = await extractObjectBatch(
        foregroundUrl,
        objects,
        (value) => setExtractProgress(92 + value * 7, "กำลังสร้าง Object ที่แก้ไขได้…"),
        {
          sam2Session,
          maskSourceUrl: url,
          alphaComponents: alphaObjects,
          targetBounds: getProcessingPreviewBounds(element),
          trimTransparent: true,
          onMaskProgress: (objectIndex, value) => {
            if (sam2Session) {
              setExtractProgress(
                92 + ((objectIndex + value) / Math.max(1, objects.length)) * 7,
                "กำลังปรับ Mask ของแต่ละ Object…",
              );
            }
          },
        },
      );
      if (newElements.length === 0) {
        setStatusMessage("No visible foreground objects were found");
      } else {
        addElements(newElements, "extract all foreground objects");
        selectOnly(newElements.map((el) => el.id));
        setStatusMessage(
          newElements.length === objects.length
            ? `Extracted ${newElements.length} transparent objects!`
            : `Extracted ${newElements.length} objects; skipped empty detections.`,
        );
        report(
          "complete",
          `แยก Object สำเร็จ ${newElements.length}/${objects.length} ชิ้น`,
          newElements.length === objects.length ? "success" : "fallback",
          100,
        );
      }
    } catch (err) {
      console.warn("Extract All failed:", err);
      setStatusMessage("Detection failed: " + (err as Error).message);
      report("error", `Extract All ไม่สำเร็จ: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleExtractGeometry = async (queuedContext?: ProcessingJobContext) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "extract", "Quick Extract", url),
        run: (context) => handleExtractGeometry(context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(0);
    updateCanvasProcessingPreview(previewId, {
      progress: 0,
      message: "กำลังเตรียม Foreground…",
    });
    const report = createProgressReporter("Quick Extract");
    const setQuickExtractProgress = (value: number, message?: string) => {
      setProgress(value);
      updateCanvasProcessingPreview(previewId, {
        progress: value / 100,
        ...(message ? { message } : {}),
      });
    };
    report("start", "เริ่มแยก Object แบบรวดเร็ว", "started", 0);
    setStatusMessage("Removing background for quick extraction...");

    try {
      const reusableForeground = isForegroundForSource(
        element.fileId,
        detectedForegroundFileId,
        detectedForegroundUrl,
      )
        ? detectedForegroundUrl
        : null;
      setQuickExtractProgress(
        reusableForeground ? 70 : 5,
        reusableForeground ? "ใช้ Foreground ที่มีอยู่แล้ว…" : "กำลังลบพื้นหลังเพื่อแยก Object…",
      );
      report(
        "foreground",
        reusableForeground ? "กำลังใช้ Foreground ที่มีอยู่แล้ว" : "กำลังลบพื้นหลังเพื่อแยก Object",
        "step",
        5,
      );
      const foregroundUrl =
        reusableForeground ??
        (
          await removeBackgroundWithRuntime(url, {
            allowServerFallback,
            signal,
            onProgress: (value) =>
              setQuickExtractProgress(value * 70, "กำลังแยก Foreground pixels…"),
            onServerFallback: () => {
              setStatusMessage("Local model is still loading; using the VPS fallback...");
              updateCanvasProcessingPreview(previewId, {
                message: "โมเดล Local ยังโหลดอยู่ กำลังใช้ VPS fallback…",
              });
              report(
                "vps-fallback",
                "Local RMBG ยังไม่พร้อม จึงส่ง Quick Extract ไป VPS",
                "fallback",
                5,
              );
            },
            onRuntime: setLastRmbgRuntime,
          })
        ).dataUrl;
      report("foreground", "เตรียม Foreground Alpha สำเร็จ", "success", 70);
      setDetectedForegroundUrl(foregroundUrl);
      setDetectedForegroundFileId(element.fileId);
      setQuickExtractProgress(74, "กำลังค้นหา Components…");
      const objects = await detectAlphaObjectBoxes(foregroundUrl);
      setDetectedObjects(objects);
      report("components", `พบ Components จำนวน ${objects.length} ชิ้น`, "success", 74);
      if (objects.length === 0) {
        setStatusMessage("No separate foreground objects found");
        report("complete", "ไม่พบ Object ที่แยกได้", "fallback", 100);
        return;
      }

      setStatusMessage(`Extracting ${objects.length} objects without Vision AI...`);
      const newElements = await extractObjectBatch(
        foregroundUrl,
        objects,
        (value) => setQuickExtractProgress(74 + value * 25, "กำลังสร้าง Object ที่แก้ไขได้…"),
        { targetBounds: getProcessingPreviewBounds(element) },
      );
      if (newElements.length === 0) {
        setStatusMessage("No visible foreground objects were found");
        return;
      }
      addElements(newElements, "quick extract foreground objects");
      selectOnly(newElements.map((el) => el.id));
      setStatusMessage(`Quick-extracted ${newElements.length} transparent objects!`);
      report("complete", `แยก Object แบบรวดเร็วสำเร็จ ${newElements.length} ชิ้น`, "success", 100);
    } catch (err) {
      console.warn("Quick extraction failed:", err);
      setStatusMessage("Quick extraction failed: " + (err as Error).message);
      report("error", `Quick Extract ไม่สำเร็จ: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const isolateSingleObject = async (obj: DetectedObject, queuedContext?: ProcessingJobContext) => {
    const url = await getImageDataUrl();
    if (!url) return;

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "extract", `Extract ${obj.label}`, url),
        run: (context) => isolateSingleObject(obj, context),
      });
      processingJobIdRef.current = job.id;
      setBusy(true);
      try {
        await job.promise;
      } finally {
        if (processingJobIdRef.current === job.id) processingJobIdRef.current = null;
        setBusy(false);
        setProgress(null);
      }
      return;
    }

    const { id: previewId, signal } = queuedContext;
    setBusy(true);
    setProgress(0);
    updateCanvasProcessingPreview(previewId, {
      progress: 0,
      message: "กำลังเตรียม Object…",
    });
    setStatusMessage(`Extracting ${obj.label}...`);

    try {
      const foregroundUrl =
        detectedForegroundUrl ??
        (
          await removeBackgroundWithRuntime(url, {
            allowServerFallback,
            signal,
            onServerFallback: () => {
              setStatusMessage("Local model is still loading; using the VPS fallback...");
              updateCanvasProcessingPreview(previewId, {
                progress: 0.2,
                message: "โมเดล Local ยังโหลดอยู่ กำลังใช้ VPS fallback…",
              });
            },
            onRuntime: setLastRmbgRuntime,
          })
        ).dataUrl;
      setProgress(78);
      updateCanvasProcessingPreview(previewId, {
        progress: 0.78,
        message: "กำลังตัดภาพ Object ที่เลือก…",
      });
      const cropped = await cropImageRegion(foregroundUrl, obj);
      const cached = await loadDataURL(cropped.dataUrl);
      const asset = createCachedImageAsset(cached);
      const targetBounds = getProcessingPreviewBounds(element);
      const newImg = createImage({
        x: Math.round(targetBounds.x + targetBounds.width * obj.x_min),
        y: Math.round(targetBounds.y + targetBounds.height * obj.y_min),
        width: Math.max(20, Math.round(targetBounds.width * (obj.x_max - obj.x_min))),
        height: Math.max(20, Math.round(targetBounds.height * (obj.y_max - obj.y_min))),
        ...asset,
      });

      setProgress(95);
      updateProcessingPreview(previewId, {
        progress: 0.95,
        message: "กำลังวางผลลัพธ์ลงบน Canvas…",
      });
      addElement(newImg, `isolate ${obj.label}`);
      selectOnly([newImg.id]);
      setStatusMessage(`Extracted ${obj.label} to canvas!`);
    } catch (err) {
      console.warn("Object extraction failed:", err);
      setStatusMessage("Extraction failed: " + (err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const analysisMessage =
    assetAnalysis?.status === "analyzing"
      ? `Preparing image intelligence… ${Math.round(assetAnalysis.progress * 100)}%`
      : assetAnalysis?.status === "queued"
        ? "Image intelligence queued in the background"
        : assetAnalysis?.status === "ready" && assetAnalysis.result?.foregroundStatus === "ready"
          ? `Ready for extraction · ${assetAnalysis.result.foregroundComponents?.length ?? 0} candidates`
          : assetAnalysis?.status === "ready" && assetAnalysis.result?.hasTransparency
            ? `Transparent alpha ready · ${assetAnalysis.result.alphaComponents.length} components`
            : assetAnalysis?.status === "ready"
              ? "Lightweight image analysis ready"
              : assetAnalysis?.status === "failed"
                ? "Background analysis unavailable; tools still work on demand"
                : null;

  return (
    <div
      style={{
        padding: "8px 10px",
        background: "rgba(99, 102, 241, 0.04)",
        borderRadius: 8,
        border: "1px solid rgba(99, 102, 241, 0.15)",
        marginBottom: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent, #6366f1)" }}>
          ✨ Image Intelligence
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {progress !== null && <span style={{ fontSize: 9, color: "#6b7280" }}>{progress}%</span>}
          <button
            type="button"
            onClick={handleResetCache}
            title="Reset AI models cached in browser storage"
            style={{
              background: "none",
              border: "none",
              padding: "1px 4px",
              fontSize: 9,
              color: "#94a3b8",
              cursor: "pointer",
              borderRadius: 3,
            }}
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      {analysisMessage && (
        <div
          style={{
            marginBottom: 6,
            padding: "3px 6px",
            borderRadius: 4,
            background: "rgba(16, 185, 129, 0.08)",
            color: "#047857",
            fontSize: 9,
          }}
        >
          {analysisMessage}
        </div>
      )}

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 5,
          marginBottom: 6,
          color: "#475569",
          fontSize: 9,
          lineHeight: 1.35,
          cursor: "pointer",
        }}
        title="Only explicit Extract actions may send this image to the ArtShift VPS."
      >
        <input
          type="checkbox"
          aria-label="Allow VPS fallback for extraction"
          checked={allowServerFallback}
          onChange={(event) => setAllowServerFallback(event.currentTarget.checked)}
          disabled={busy}
          style={{ margin: "1px 0 0" }}
        />
        <span>
          ถ้าโมเดล Local ยังโหลดไม่เสร็จ ให้ใช้ VPS ชั่วคราว
          {lastRmbgRuntime === "vps-fallback" ? " · ใช้ VPS ครั้งล่าสุด" : ""}
        </span>
      </label>

      {/* Row 1: AI Tools (alpha geometry is the recommended extraction path) */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRemoveBg()}
          title="Remove background from image with AI"
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "#fff",
            color: "var(--accent, #6366f1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 10,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          <span>🪄</span>
          <span>{busy ? "Processing..." : "Remove BG"}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExtractAll()}
          title="Extract using alpha geometry and optionally add Florence-2 labels"
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "#fff",
            color: "var(--accent, #6366f1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 10,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
          }}
        >
          {busy ? "Extracting..." : "Extract All"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExtractGeometry()}
          title="Recommended: remove the background and split visible regions locally"
          style={{
            flex: 1,
            padding: "5px 6px",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            border: "none",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 9.5,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            whiteSpace: "nowrap",
          }}
        >
          {busy ? "Processing..." : "Quick Extract"}
        </button>
      </div>

      {/* Row 2: Separate vectorizer actions */}
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <button
          type="button"
          disabled={busy}
          aria-pressed={backend === "custom" && vectorizeOpen}
          onClick={() => toggleVectorizeSettings("custom")}
          title="Open ArtShift Custom Auto-Trace settings"
          style={{
            flex: 1,
            padding: "6px 5px",
            background: backend === "custom" && vectorizeOpen ? "#0f172a" : "#fff",
            color: backend === "custom" && vectorizeOpen ? "#fff" : "var(--accent, #6366f1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 9.5,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            whiteSpace: "nowrap",
          }}
        >
          <span>✦</span>
          <span>Custom Auto-Trace</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={backend === "vtracer-wasm" && vectorizeOpen}
          onClick={() => toggleVectorizeSettings("vtracer-wasm")}
          title="Open VTracer WASM settings"
          style={{
            flex: 1,
            padding: "6px 5px",
            background: backend === "vtracer-wasm" && vectorizeOpen ? "#0f172a" : "#fff",
            color: backend === "vtracer-wasm" && vectorizeOpen ? "#fff" : "var(--accent, #6366f1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 9.5,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            whiteSpace: "nowrap",
          }}
        >
          <span>◇</span>
          <span>VTracer WASM</span>
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRecraftVectorize()}
          aria-label="Recraft Vectorize (Cloud)"
          title="Send this image to Recraft Vectorize through your Replicate account"
          style={{
            flex: 1,
            padding: "6px 5px",
            background: "#fff",
            color: "#0f766e",
            border: "1px solid rgba(13, 148, 136, 0.35)",
            borderRadius: 5,
            fontWeight: 700,
            fontSize: 9.5,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 3,
            whiteSpace: "nowrap",
          }}
        >
          <span>☁</span>
          <span>Recraft Vectorize (Cloud)</span>
        </button>
        {processingJobIdRef.current && !vectorizeOpen && (
          <button
            type="button"
            onClick={cancelVectorize}
            style={{
              padding: "6px 8px",
              fontSize: 9.5,
              fontWeight: 700,
              borderRadius: 5,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#be123c",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}
      </div>
      <div style={{ marginTop: 3, color: "#64748b", fontSize: 8 }}>
        Cloud vectorizer · sends the image to Replicate · requires your Replicate Key
      </div>

      {/* Ultra-High-Fidelity Vectorizer Options Panel */}
      {vectorizeOpen && (
        <div
          style={{
            marginTop: 6,
            padding: 8,
            background: "#fff",
            border: "1px solid var(--accent, #6366f1)",
            borderRadius: 6,
            fontSize: 9.5,
          }}
        >
          <div
            style={{
              marginBottom: 7,
              paddingBottom: 5,
              borderBottom: "1px solid #e0e7ff",
            }}
          >
            <strong style={{ display: "block", color: "#1e1b4b", fontSize: 10 }}>
              {backend === "vtracer-wasm" ? "VTracer WASM Settings" : "ArtShift Custom Settings"}
            </strong>
            <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
              {backend === "vtracer-wasm"
                ? "Local Rust/WASM trace with independent native controls"
                : "Original ArtShift auto-trace with editable path controls"}
            </span>
          </div>

          {/* Preset Selection Chips */}
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontWeight: 700,
                color: "#1e1b4b",
                fontSize: 9.5,
                display: "block",
                marginBottom: 3,
              }}
            >
              {backend === "vtracer-wasm"
                ? "Official VTracer Presets:"
                : "Select Trace Quality / Style:"}
            </span>
            <div
              style={{
                display: backend === "vtracer-wasm" ? "none" : "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
              }}
            >
              <button
                type="button"
                onClick={() => applyPreset("highFidelity")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "highFidelity" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "highFidelity" ? "#6366f1" : "#e2e8f0",
                  background: preset === "highFidelity" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "highFidelity" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🌟 High-Fidelity (24c)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("photoDetailed")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "photoDetailed" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "photoDetailed" ? "#6366f1" : "#e2e8f0",
                  background: preset === "photoDetailed" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "photoDetailed" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                📸 Photo Ultra (36c)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("illustration")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "illustration" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "illustration" ? "#6366f1" : "#e2e8f0",
                  background: preset === "illustration" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "illustration" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🎨 Illustration (12c)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("clipart")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "clipart" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "clipart" ? "#6366f1" : "#e2e8f0",
                  background: preset === "clipart" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "clipart" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🖼️ Clipart (8c)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("lineArt")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "lineArt" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "lineArt" ? "#6366f1" : "#e2e8f0",
                  background: preset === "lineArt" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "lineArt" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                ✒️ Line Art (Ink)
              </button>
              <button
                type="button"
                onClick={() => applyPreset("silhouette")}
                style={{
                  padding: "4px 4px",
                  fontSize: 8.5,
                  fontWeight: preset === "silhouette" ? 700 : 500,
                  borderRadius: 4,
                  border: "1px solid",
                  borderColor: preset === "silhouette" ? "#6366f1" : "#e2e8f0",
                  background: preset === "silhouette" ? "#e0e7ff" : "#f8fafc",
                  color: preset === "silhouette" ? "#4338ca" : "#334155",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                🖤 Silhouette (B&W)
              </button>
            </div>
            <div
              style={{
                display: backend === "vtracer-wasm" ? "grid" : "none",
                gridTemplateColumns: "1fr 1fr",
                gap: 3,
              }}
            >
              {VTRACER_PRESET_BUTTONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyPreset(option.value)}
                  style={{
                    padding: "5px 4px",
                    fontSize: 8.5,
                    fontWeight: preset === option.value ? 700 : 500,
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: preset === option.value ? "#6366f1" : "#e2e8f0",
                    background: preset === option.value ? "#e0e7ff" : "#f8fafc",
                    color: preset === option.value ? "#4338ca" : "#334155",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Color Count Bar */}
          {!isMonochromeTrace && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: "#475569" }}>
                {backend === "vtracer-wasm" ? "Palette max:" : "Colors:"}
              </span>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                {backend === "vtracer-wasm" ? (
                  <>
                    {[4, 8, 12, 16, 24, 32, 48].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setVTracerMaxColors(num);
                          setColors(num);
                          setVTracerUsePresetDefaults(false);
                          setPreset("custom");
                        }}
                        style={{
                          padding: "2px 5px",
                          fontSize: 8,
                          fontWeight: vtracerMaxColors === num ? 700 : 500,
                          borderRadius: 3,
                          border: "1px solid",
                          borderColor:
                            vtracerMaxColors === num ? "var(--accent, #6366f1)" : "#e2e8f0",
                          background: vtracerMaxColors === num ? "var(--accent, #6366f1)" : "#fff",
                          color: vtracerMaxColors === num ? "#fff" : "#475569",
                          cursor: "pointer",
                        }}
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-label="VTracer no palette limit"
                      onClick={() => {
                        setVTracerMaxColors(null);
                        setVTracerUsePresetDefaults(false);
                        setPreset("custom");
                      }}
                      style={{
                        padding: "2px 5px",
                        fontSize: 8,
                        fontWeight: vtracerMaxColors === null ? 700 : 500,
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor:
                          vtracerMaxColors === null ? "var(--accent, #6366f1)" : "#e2e8f0",
                        background: vtracerMaxColors === null ? "var(--accent, #6366f1)" : "#fff",
                        color: vtracerMaxColors === null ? "#fff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      No limit
                    </button>
                  </>
                ) : (
                  [4, 8, 16, 24, 32, 48].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setColors(num);
                        setPreset("custom");
                      }}
                      style={{
                        padding: "2px 5px",
                        fontSize: 8,
                        fontWeight: colors === num ? 700 : 500,
                        borderRadius: 3,
                        border: "1px solid",
                        borderColor: colors === num ? "var(--accent, #6366f1)" : "#e2e8f0",
                        background: colors === num ? "var(--accent, #6366f1)" : "#fff",
                        color: colors === num ? "#fff" : "#475569",
                        cursor: "pointer",
                      }}
                    >
                      {num}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Collapsible Advanced Parameters */}
          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 4, marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                background: "none",
                border: "none",
                color: "#6366f1",
                fontWeight: 600,
                fontSize: 8.5,
                padding: "2px 0",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span>{showAdvanced ? "▼" : "▶"}</span>
              <span>Advanced Detail & Curve Controls</span>
            </button>

            {showAdvanced && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                {backend === "vtracer-wasm" && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      padding: 6,
                      border: "1px solid #c7d2fe",
                      borderRadius: 5,
                      background: "#eef2ff",
                    }}
                  >
                    <strong style={{ color: "#312e81", fontSize: 9 }}>
                      VTracer Native Controls
                    </strong>
                    <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: "#475569" }}>Geometry:</span>
                      <select
                        aria-label="VTracer geometry"
                        value={vtracerMode}
                        onChange={(event) =>
                          (() => {
                            setVTracerMode(event.currentTarget.value as VectorizeTraceMode);
                            setPreset("custom");
                          })()
                        }
                        style={{ flex: 1, fontSize: 8.5 }}
                      >
                        <option value="spline">Smooth curves</option>
                        <option value="polygon">Sharp polygon</option>
                        <option value="pixel">Pixel exact</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: "#475569" }}>Region edges:</span>
                      <select
                        aria-label="VTracer composition"
                        value={vtracerComposition}
                        onChange={(event) =>
                          (() => {
                            setVTracerComposition(
                              event.currentTarget.value as VectorizeComposition,
                            );
                            setPreset("custom");
                          })()
                        }
                        style={{ flex: 1, fontSize: 8.5 }}
                      >
                        <option value="cutout">Seam-free (Cutout)</option>
                        <option value="stacked">Layered (Stacked)</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ color: "#475569" }}>Color clustering:</span>
                      <select
                        aria-label="VTracer clustering"
                        value={vtracerClustering}
                        disabled={preset === "lineArt" || preset === "silhouette"}
                        onChange={(event) =>
                          (() => {
                            setVTracerClustering(event.currentTarget.value as VectorizeClustering);
                            setPreset("custom");
                          })()
                        }
                        style={{ flex: 1, fontSize: 8.5 }}
                      >
                        <option value="color-cluster">Color cluster</option>
                        <option value="watershed">Watershed</option>
                        <option value="bw">Binary (B&amp;W)</option>
                      </select>
                    </label>
                    <div>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}
                      >
                        <span style={{ color: "#475569" }}>Color sensitivity:</span>
                        <strong style={{ color: "#0f172a" }}>{vtracerLayerDifference}</strong>
                      </div>
                      <input
                        type="range"
                        aria-label="VTracer color sensitivity"
                        min={0}
                        max={64}
                        step={1}
                        value={vtracerLayerDifference}
                        disabled={preset === "lineArt" || preset === "silhouette"}
                        onChange={(event) => {
                          setVTracerLayerDifference(Number(event.target.value));
                          setPreset("custom");
                        }}
                        style={{ width: "100%", height: 3, cursor: "pointer" }}
                      />
                      <span style={{ display: "block", color: "#64748b", fontSize: 7.5 }}>
                        Lower keeps more color regions; higher merges similar colors.
                      </span>
                    </div>
                    <div>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}
                      >
                        <span style={{ color: "#475569" }}>Noise filter (side):</span>
                        <strong style={{ color: "#0f172a" }}>{vtracerFilterSpeckle}px</strong>
                      </div>
                      <input
                        type="range"
                        aria-label="VTracer noise filter"
                        min={1}
                        max={12}
                        step={1}
                        value={vtracerFilterSpeckle}
                        onChange={(event) => {
                          setVTracerFilterSpeckle(Number(event.target.value));
                          setPreset("custom");
                        }}
                        style={{ width: "100%", height: 3, cursor: "pointer" }}
                      />
                    </div>
                    {isMonochromeTrace && (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 8.5,
                          }}
                        >
                          <span style={{ color: "#475569" }}>B&amp;W threshold:</span>
                          <strong style={{ color: "#0f172a" }}>{vtracerBinaryThreshold}</strong>
                        </div>
                        <input
                          type="range"
                          aria-label="VTracer B&amp;W threshold"
                          min={0}
                          max={255}
                          step={1}
                          value={vtracerBinaryThreshold}
                          onChange={(event) => {
                            setVTracerBinaryThreshold(Number(event.target.value));
                            setPreset("custom");
                          }}
                          style={{ width: "100%", height: 3, cursor: "pointer" }}
                        />
                        <span style={{ display: "block", color: "#64748b", fontSize: 7.5 }}>
                          Higher includes lighter pixels in the foreground.
                        </span>
                      </div>
                    )}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        color: "#475569",
                        fontSize: 8.5,
                      }}
                    >
                      <input
                        type="checkbox"
                        aria-label="VTracer extra curve simplification"
                        checked={vtracerSimplifyEnabled}
                        onChange={(event) => {
                          setVTracerSimplifyEnabled(event.currentTarget.checked);
                          setPreset("custom");
                        }}
                      />
                      Compact curves (may remove fine detail)
                    </label>
                  </div>
                )}

                {/* Detail Level Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}>
                    <span style={{ color: "#475569" }}>Detail Resolution:</span>
                    <strong style={{ color: "#0f172a" }}>Level {detailLevel} / 5</strong>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={detailLevel}
                    onChange={(e) => {
                      setDetailLevel(Number(e.target.value) as 1 | 2 | 3 | 4 | 5);
                      setPreset("custom");
                    }}
                    style={{ width: "100%", height: 3, cursor: "pointer" }}
                  />
                </div>

                {/* Corner Sharpness Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}>
                    <span style={{ color: "#475569" }}>Corner Sharpness:</span>
                    <strong style={{ color: "#0f172a" }}>
                      {Math.round(cornerSharpness * 100)}%
                    </strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={cornerSharpness}
                    onChange={(e) => {
                      setCornerSharpness(Number(e.target.value));
                      setPreset("custom");
                    }}
                    style={{ width: "100%", height: 3, cursor: "pointer" }}
                  />
                </div>

                {/* Smoothing Slider */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}>
                    <span style={{ color: "#475569" }}>Curve Smoothing:</span>
                    <strong style={{ color: "#0f172a" }}>{smoothing.toFixed(2)}</strong>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.0}
                    step={0.05}
                    value={smoothing}
                    onChange={(e) => {
                      setSmoothing(Number(e.target.value));
                      setPreset("custom");
                    }}
                    style={{ width: "100%", height: 3, cursor: "pointer" }}
                  />
                </div>

                {backend !== "vtracer-wasm" && (
                  <>
                    {/* Min Area (Noise Filter) */}
                    <div>
                      <div
                        style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}
                      >
                        <span style={{ color: "#475569" }}>Noise Filter:</span>
                        <strong style={{ color: "#0f172a" }}>{minArea}px</strong>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={30}
                        step={1}
                        value={minArea}
                        onChange={(e) => {
                          setMinArea(Number(e.target.value));
                          setPreset("custom");
                        }}
                        style={{ width: "100%", height: 3, cursor: "pointer" }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Action Trigger Button */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleVectorize()}
              style={{
                flex: 1,
                padding: "6px 8px",
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 5,
                border: "none",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                color: "#fff",
                cursor: busy ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                boxShadow: "0 1px 3px rgba(99, 102, 241, 0.3)",
              }}
            >
              <span>⚡</span>
              <span>
                {busy
                  ? "Tracing Vector..."
                  : backend === "vtracer-wasm"
                    ? "Generate VTracer Paths"
                    : "Generate Custom Paths"}
              </span>
            </button>
            {processingJobIdRef.current && (
              <button
                type="button"
                onClick={cancelVectorize}
                style={{
                  padding: "6px 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 5,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#be123c",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Detected objects chips */}
      {detectedObjects.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
          {detectedObjects.map((obj, idx) => (
            <button
              key={`${obj.label}-${idx}`}
              type="button"
              disabled={busy}
              onClick={() => isolateSingleObject(obj)}
              title={`Click to isolate ${obj.label} onto Canvas`}
              style={{
                padding: "3px 6px",
                borderRadius: 4,
                border: "1px solid rgba(99, 102, 241, 0.3)",
                background: "#fff",
                color: "#1e1b4b",
                fontSize: 9.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              <span>✂</span>
              <span>{obj.label}</span>
            </button>
          ))}
        </div>
      )}

      {statusMessage && (
        <div style={{ marginTop: 4, fontSize: 9.5, color: "#6b7280" }}>{statusMessage}</div>
      )}
    </div>
  );
}

// Keep a default export as the stable seam for lazy loading. This avoids a
// transient undefined component when Next.js refreshes a named export during
// development HMR.
export default VisionObjectIsolator;
