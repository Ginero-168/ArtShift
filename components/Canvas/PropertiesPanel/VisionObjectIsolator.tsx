"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  IconCamera,
  IconChevronDown,
  IconCloud,
  IconContrast,
  IconLayers,
  IconPalette,
  IconPenTool,
  IconPolaroid,
  IconSparkles,
  IconTrash,
  IconWand,
  IconZap,
} from "@/components/icons";
import { type AIProgressStatus, reportAIProgress, reportAIResult } from "@/lib/ai/progressReporter";
import { removeBackgroundWithRuntime } from "@/lib/ai/removeBg";
import {
  DEFAULT_DECOMPOSE_LAYERS,
  getUpscaleTargetMegapixels,
  UPSCALE_RESOLUTION_PRESETS,
  type UpscaleResolutionPreset,
} from "@/lib/ai-runtime/contracts";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL, preloadDataURL } from "@/lib/engine/imageCache";
import {
  getProcessingPreviewBounds,
  getProcessingPreviewPlacement,
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
  createAtomicVectorizedFromResult,
  createAtomicVectorizedFromSvg,
  svgHasVectorContent,
} from "@/lib/vectorize/atomicVectorize";
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
import { getSvgViewport } from "@/lib/vectorize/vtracerAdapter";
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
import { claimImageActionRun, releaseImageActionRun } from "@/lib/vision/imageActionRunGuard";
import { preloadLayerSource } from "@/lib/vision/layerPreload";
import { resetAICache } from "@/lib/vision/resetCache";
import { cropImageRegion, trimTransparentRegion } from "@/lib/vision/visionEngine";
import {
  EXTRACT_LABEL,
  IMAGE_ACTION_LABELS,
  IMAGE_TOOL_LABELS,
  type ImageActionId,
  isVectorizeTool,
  LAYER_LABEL,
  VECTORIZE_TOOL_IDS,
  type VectorizeToolId,
} from "./imageToolTypes";

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

function createVectorizeEngineSettings(): VectorizeEngineSettings {
  const preset = "highFidelity" as const;
  const generic = VECTORIZE_PRESET_CONFIGS[preset];
  const native = getVTracerPresetDefaults(preset);
  return {
    preset,
    colors: native.maxColors ?? generic.colors,
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
    vtracerMaxColors: native.maxColors,
    vtracerUsePresetDefaults: true,
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
  kind: "extract" | "layer" | "remove-bg" | "vectorize" | "upscale",
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

export type VisionObjectIsolatorProps = {
  element: ImageElement;
  /** When provided, render the selected Option Bar tool's settings. */
  activeTool?: ImageActionId | null;
  /** Run an immediate tool action without showing its settings panel. */
  autoRun?: boolean;
  onToolComplete?: () => void;
  onToolChange?: (tool: VectorizeToolId) => void;
};

export function VisionObjectIsolator({
  element,
  activeTool,
  autoRun = false,
  onToolComplete,
  onToolChange,
}: VisionObjectIsolatorProps) {
  const addElement = useEngine((s) => s.addElement);
  const addElements = useEngine((s) => s.addElements);
  const selectOnly = useEngine((s) => s.selectOnly);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [detectedForegroundUrl, setDetectedForegroundUrl] = useState<string | null>(null);
  const [detectedForegroundFileId, setDetectedForegroundFileId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const allowServerFallback = true;
  const [, setLastRmbgRuntime] = useState<"local" | "vps-fallback">("local");
  const autoRunKeyRef = useRef<string | null>(null);
  const removeBgHandlerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const extractHandlerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const layerHandlerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const upscaleHandlerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  // VTracer settings are the single local vectorization configuration.
  const [backend, setBackend] = useState<VectorizeBackend>(DEFAULT_VECTORIZE_BACKEND);
  const [vectorizeOpen, setVectorizeOpen] = useState(false);
  const controlledToolMode = activeTool !== undefined;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [upscaleResolution, setUpscaleResolution] = useState<UpscaleResolutionPreset>("2k");
  const [vtracerSettings, setVTracerSettings] = useState<VectorizeEngineSettings>(() =>
    createVectorizeEngineSettings(),
  );
  useEffect(() => {
    if (activeTool === "vectorize2") {
      setBackend("vtracer-wasm");
      setVectorizeOpen(true);
      setShowAdvanced(true);
    } else if (controlledToolMode) {
      setVectorizeOpen(false);
      setShowAdvanced(false);
    }
  }, [activeTool, controlledToolMode]);
  const activeSettings = vtracerSettings;
  const selectedUpscaleResolution =
    UPSCALE_RESOLUTION_PRESETS.find((option) => option.value === upscaleResolution) ??
    UPSCALE_RESOLUTION_PRESETS[0];
  const upscaleTargetMegapixels = getUpscaleTargetMegapixels(upscaleResolution);
  const updateActiveSettings = (patch: Partial<VectorizeEngineSettings>) => {
    setVTracerSettings((current) => ({ ...current, ...patch }));
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

  // Decode the source as soon as Layer is the active tool, before confirm/run.
  useEffect(() => {
    if (activeTool !== "layer") return;
    void preloadLayerSource(element.fileId);
  }, [activeTool, element.fileId]);

  const applyPreset = (p: VectorizePreset) => {
    setPreset(p);
    const vtracerDefaults = getVTracerPresetDefaults(p);
    setVTracerMode(vtracerDefaults.mode);
    setVTracerComposition(vtracerDefaults.hierarchical);
    setVTracerClustering(vtracerDefaults.clustering);
    setVTracerLayerDifference(vtracerDefaults.layerDifference);
    setVTracerFilterSpeckle(vtracerDefaults.filterSpeckle);
    setVTracerBinaryThreshold(vtracerDefaults.binaryThreshold);
    setVTracerMaxColors(vtracerDefaults.maxColors);
    setVTracerUsePresetDefaults(p !== "custom");
    setVTracerSimplifyEnabled(false);
    if (p !== "custom") {
      const cfg = VECTORIZE_PRESET_CONFIGS[p];
      setColors(vtracerDefaults.maxColors ?? cfg.colors);
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
    optionOverrides?: Partial<VectorizeOptions>,
    queuedContext?: ProcessingJobContext,
  ) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "vectorize", "Vectorize", url),
        run: (context) => handleVectorize(optionOverrides, context),
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
        getProcessingPreviewPlacement(previewId, getProcessingPreviewBounds(element)),
        {
          backend,
          preset,
          mode: isMonochrome ? "monochrome" : "color",
          colors: isMonochrome ? 2 : (vtracerMaxColors ?? colors),
          detailLevel,
          smoothing,
          cornerSharpness,
          minArea,
          vtracer: {
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
          },
          ...optionOverrides,
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
                    : "Building a locked vector object...";
            setProgress(Math.round(progress * 100));
            setStatusMessage(message);
            updateCanvasProcessingPreview(previewId, { progress, message });
          },
        },
      );

      if (!svgHasVectorContent(res.svgString) && res.elements.length === 0) {
        setStatusMessage("No distinct vector paths detected");
        report("complete", "ไม่พบเส้น Vector ที่แยกได้", "fallback", 100);
        window.alert("ไม่พบเส้น Vector ที่สามารถแปลงได้จากภาพนี้ กรุณาลองปรับ Preset หรือ Detail Level");
      } else {
        const object = createAtomicVectorizedFromResult(
          res,
          getProcessingPreviewPlacement(previewId, getProcessingPreviewBounds(element)),
        );
        addElements([object], "vectorize image");
        selectOnly([object.id]);
        setStatusMessage(`VTracer created 1 vectorized object (${res.palette.length} colors).`);
        report("complete", "VTracer WASM สร้าง Vector สำเร็จ 1 วัตถุ", "success", 100);
      }
    } catch (err) {
      if (err instanceof VectorizeCancelledError || (err as Error).name === "AbortError") {
        setStatusMessage("Vectorization cancelled.");
      } else {
        const message = (err as Error).message || "Unknown error";
        console.warn("Vectorize failed:", err);
        setStatusMessage("Vectorize error: " + message);
        report("error", `แปลง Vector ไม่สำเร็จ: ${message}`, "error");
        window.alert(`แปลงภาพเป็น Vector ไม่สำเร็จ: ${message}`);
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
        preview: processingPreviewInput(element, "vectorize", "Vectorize(Cloud)", cached.dataURL),
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
      setStatusMessage("Validating Recraft SVG…");
      updateCanvasProcessingPreview(previewId, {
        progress: 0.82,
        message: "กำลังตรวจสอบ SVG…",
      });
      getSvgViewport(svg);
      const object = createAtomicVectorizedFromSvg({
        svg,
        bounds: getProcessingPreviewPlacement(previewId, getProcessingPreviewBounds(element)),
      });
      addElements([object], "Recraft Vectorize image");
      selectOnly([object.id]);
      setStatusMessage("Recraft Vectorize created 1 vectorized object.");
      report("complete", "Recraft Vectorize สร้าง Vector สำเร็จ 1 วัตถุ", "success", 1);
    } catch (error) {
      if (error instanceof VectorizeCancelledError || (error as Error).name === "AbortError") {
        setStatusMessage("Recraft Vectorization cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Unknown Recraft error.";
        console.warn("Recraft Vectorize failed:", error);
        setStatusMessage(`Recraft Vectorize error: ${message}`);
        report("error", `Recraft Vectorize ไม่สำเร็จ: ${message}`, "error");
        window.alert(`Recraft Vectorize ไม่สำเร็จ: ${message}`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleUpscale = async (queuedContext?: ProcessingJobContext) => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const preloaded = await preloadDataURL(cached.dataURL);
      if (
        !window.confirm(
          `P-Image-Upscale จะส่งภาพนี้ไปยัง Replicate เพื่อเพิ่มความคมชัดเป็น ${selectedUpscaleResolution.label} (${selectedUpscaleResolution.rangeLabel}) และอาจมีค่าใช้จ่ายตามบัญชี Replicate ดำเนินการต่อหรือไม่?`,
        )
      ) {
        return;
      }
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "upscale", "Upscale", preloaded.dataURL),
        run: (context) => handleUpscale(context),
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
    setProgress(5);
    updateCanvasProcessingPreview(previewId, {
      progress: 0.05,
      message: "กำลังเตรียมภาพต้นฉบับสำหรับ Upscale…",
    });
    const report = createProgressReporter("P-Image-Upscale");
    report("preload", "เตรียมภาพต้นฉบับแล้ว", "started", 0.05);

    try {
      setStatusMessage("Sending image to P-Image-Upscale...");
      updateCanvasProcessingPreview(previewId, {
        progress: 0.12,
        message: "กำลังส่งภาพไปยัง P-Image-Upscale…",
      });
      const response = await fetch("/api/upscale/recraft", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          task: "image.upscale",
          input: {
            image: {
              dataUrl: cached.dataURL,
              mimeType: cached.dataURL
                .match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]
                ?.toLowerCase(),
            },
            width: cached.width,
            height: cached.height,
            targetMegapixels: upscaleTargetMegapixels,
          },
          options: {
            profile: "quality",
            provider: "replicate",
            modelAlias: "p-image-upscale",
            cloudConsent: true,
            allowFallback: false,
            timeoutMs: 120_000,
            cache: false,
          },
        }),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        execution?: { output?: { dataUrl?: unknown } };
        error?: { message?: unknown } | string;
      } | null;
      if (!response.ok) {
        const providerError =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.error?.message === "string"
              ? payload.error.message
              : "P-Image-Upscale request failed.";
        throw new Error(providerError);
      }
      const resultDataUrl = payload?.execution?.output?.dataUrl;
      if (
        typeof resultDataUrl !== "string" ||
        !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(resultDataUrl)
      ) {
        throw new Error("P-Image-Upscale returned no valid image output.");
      }
      if (signal.aborted) return;

      setProgress(82);
      setStatusMessage("Loading the upscaled image and preparing a duplicate...");
      updateCanvasProcessingPreview(previewId, {
        progress: 0.82,
        message: "กำลังโหลดผลลัพธ์และเตรียม Duplicate…",
      });
      const resultCached = await loadDataURL(resultDataUrl);
      if (signal.aborted) return;
      const duplicateBounds = getProcessingPreviewPlacement(
        previewId,
        getProcessingPreviewBounds(element),
      );
      const resultImage = {
        ...createImage({
          ...duplicateBounds,
          ...createCachedImageAsset(resultCached),
        }),
        angle: element.angle,
        flipX: element.flipX,
        flipY: element.flipY,
        sourceName: element.sourceName ? `${element.sourceName} · Upscaled` : "Upscaled image",
      };
      updateProcessingPreview(previewId, {
        progress: 0.95,
        message: "กำลังวาง Duplicate ผลลัพธ์ลงบน Canvas…",
      });
      addElement(resultImage, "upscale image duplicate");
      selectOnly([resultImage.id]);
      setStatusMessage("Upscale completed as a duplicate image.");
      report("complete", "P-Image-Upscale สำเร็จและสร้าง Duplicate โดยคงต้นฉบับไว้", "success", 100);
    } catch (error) {
      if (signal.aborted || (error as Error).name === "AbortError") {
        setStatusMessage("P-Image-Upscale cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Unknown P-Image-Upscale error.";
        setStatusMessage(`P-Image-Upscale error: ${message}`);
        report("error", `P-Image-Upscale ไม่สำเร็จ: ${message}`, "error");
        window.alert(`Upscale ภาพไม่สำเร็จ: ${message}`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  upscaleHandlerRef.current = handleUpscale;

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
        preview: processingPreviewInput(element, "remove-bg", "RemoveBG", cached.dataURL),
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
      const duplicateBounds = getProcessingPreviewPlacement(
        previewId,
        getProcessingPreviewBounds(element),
      );
      const resultImage = createImage({
        ...duplicateBounds,
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

  removeBgHandlerRef.current = handleRemoveBg;

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
      targetBounds?: { x: number; y: number; width: number; height: number };
    } = {},
  ) => {
    const newElements = [];
    const targetBounds = options.targetBounds ?? {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };

    for (const [index, obj] of objects.entries()) {
      const cropped = await cropImageRegion(foregroundUrl, obj);
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

  const handleExtract = async (queuedContext?: ProcessingJobContext) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "extract", "Extract", url),
        run: (context) => handleExtract(context),
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
    const report = createProgressReporter("Extract");
    const setExtractProgress = (value: number, message?: string) => {
      setProgress(value);
      updateCanvasProcessingPreview(previewId, {
        progress: value / 100,
        ...(message ? { message } : {}),
      });
    };
    report("start", "เริ่มแยก Object แบบรวดเร็ว", "started", 0);
    setStatusMessage("Removing background for extraction...");

    try {
      const reusableForeground = isForegroundForSource(
        element.fileId,
        detectedForegroundFileId,
        detectedForegroundUrl,
      )
        ? detectedForegroundUrl
        : null;
      setExtractProgress(
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
            onProgress: (value) => setExtractProgress(value * 70, "กำลังแยก Foreground pixels…"),
            onServerFallback: () => {
              setStatusMessage("Local model is still loading; using the VPS fallback...");
              updateCanvasProcessingPreview(previewId, {
                message: "โมเดล Local ยังโหลดอยู่ กำลังใช้ VPS fallback…",
              });
              report("vps-fallback", "Local RMBG ยังไม่พร้อม จึงส่ง Extract ไป VPS", "fallback", 5);
            },
            onRuntime: setLastRmbgRuntime,
          })
        ).dataUrl;
      report("foreground", "เตรียม Foreground Alpha สำเร็จ", "success", 70);
      setDetectedForegroundUrl(foregroundUrl);
      setDetectedForegroundFileId(element.fileId);
      setExtractProgress(74, "กำลังค้นหา Components…");
      const objects = await detectAlphaObjectBoxes(foregroundUrl);
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
        (value) => setExtractProgress(74 + value * 25, "กำลังสร้าง Object ที่แก้ไขได้…"),
        {
          targetBounds: getProcessingPreviewPlacement(
            previewId,
            getProcessingPreviewBounds(element),
          ),
        },
      );
      if (newElements.length === 0) {
        setStatusMessage("No visible foreground objects were found");
        return;
      }
      addElements(newElements, "extract foreground objects");
      selectOnly(newElements.map((el) => el.id));
      setStatusMessage(`Extracted ${newElements.length} transparent objects!`);
      report("complete", `แยก Object สำเร็จ ${newElements.length} ชิ้น`, "success", 100);
    } catch (err) {
      console.warn("Extract failed:", err);
      setStatusMessage("Extract failed: " + (err as Error).message);
      report("error", `Extract ไม่สำเร็จ: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  extractHandlerRef.current = handleExtract;

  const handleLayer = async (queuedContext?: ProcessingJobContext) => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    if (!queuedContext) {
      await preloadLayerSource(element.fileId);
      const preloaded = getCached(element.fileId) ?? cached;
      if (
        !window.confirm(
          `Layer จะส่งภาพนี้ไปยัง Replicate (qwen/qwen-image-layered) เพื่อแยกเป็น ${DEFAULT_DECOMPOSE_LAYERS} เลเยอร์ RGBA และอาจมีค่าใช้จ่ายตามบัญชี Replicate ดำเนินการต่อหรือไม่?`,
        )
      ) {
        return;
      }
      const job = enqueueProcessingJob({
        preview: processingPreviewInput(element, "layer", LAYER_LABEL, preloaded.dataURL),
        run: (context) => handleLayer(context),
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
    setProgress(5);
    updateCanvasProcessingPreview(previewId, {
      progress: 0.05,
      message: "กำลังเตรียมภาพต้นฉบับสำหรับแยก Layer…",
    });
    const report = createProgressReporter("Layer");
    report("preload", "เตรียมภาพต้นฉบับแล้ว", "started", 0.05);

    try {
      const source = getCached(element.fileId) ?? cached;
      setStatusMessage("Sending image to Qwen Image Layered...");
      updateCanvasProcessingPreview(previewId, {
        progress: 0.12,
        message: "กำลังส่งภาพไปยัง Qwen Image Layered…",
      });
      report("consent", "ผู้ใช้ยืนยันการส่งภาพไป Replicate เพื่อแยก Layer", "step", 0.12);
      const response = await fetch("/api/layer/decompose", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          task: "image.decomposeLayers",
          input: {
            image: {
              dataUrl: source.dataURL,
              mimeType: source.dataURL
                .match(/^data:(image\/(?:jpeg|png|webp));/i)?.[1]
                ?.toLowerCase(),
            },
            width: source.width,
            height: source.height,
            numLayers: DEFAULT_DECOMPOSE_LAYERS,
          },
          options: {
            profile: "quality",
            provider: "replicate",
            modelAlias: "qwen-image-layered",
            cloudConsent: true,
            allowFallback: false,
            timeoutMs: 120_000,
            cache: false,
          },
        }),
        signal,
      });
      const payload = (await response.json().catch(() => null)) as {
        execution?: { output?: { layers?: unknown } };
        error?: { message?: unknown; code?: unknown } | string;
      } | null;
      if (!response.ok) {
        const providerError =
          typeof payload?.error === "string"
            ? payload.error
            : typeof payload?.error?.message === "string"
              ? payload.error.message
              : "Layer decompose request failed.";
        throw new Error(providerError);
      }
      const layerPayloads = payload?.execution?.output?.layers;
      if (!Array.isArray(layerPayloads) || layerPayloads.length === 0) {
        throw new Error("Layer decompose returned no layer images.");
      }
      const layerDataUrls = layerPayloads.map((item, index) => {
        const dataUrl =
          item && typeof item === "object" ? (item as { dataUrl?: unknown }).dataUrl : undefined;
        if (
          typeof dataUrl !== "string" ||
          !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(dataUrl)
        ) {
          throw new Error(`Layer ${index + 1} returned no valid image output.`);
        }
        return dataUrl;
      });
      if (signal.aborted) return;

      setProgress(78);
      setStatusMessage(`Loading ${layerDataUrls.length} RGBA layers...`);
      updateCanvasProcessingPreview(previewId, {
        progress: 0.78,
        message: `กำลังโหลด ${layerDataUrls.length} Layer…`,
      });

      // Place the layer stack at the Preload card (right of source, or wherever the
      // user dragged it) — same insert point Upscale / Remove BG / Extract use.
      const layerBounds = getProcessingPreviewPlacement(
        previewId,
        getProcessingPreviewBounds(element),
      );
      const newElements = [];
      for (const [index, dataUrl] of layerDataUrls.entries()) {
        if (signal.aborted) return;
        const layerCached = await loadDataURL(dataUrl);
        const layerImage = {
          ...createImage({
            ...layerBounds,
            ...createCachedImageAsset(layerCached),
          }),
          angle: element.angle,
          flipX: element.flipX,
          flipY: element.flipY,
          sourceName: element.sourceName
            ? `${element.sourceName} · Layer ${index + 1}`
            : `Layer ${index + 1}`,
        };
        newElements.push(layerImage);
        updateCanvasProcessingPreview(previewId, {
          progress: 0.78 + ((index + 1) / layerDataUrls.length) * 0.16,
          message: `กำลังวาง Layer ${index + 1}/${layerDataUrls.length}…`,
        });
      }
      if (newElements.length === 0) {
        throw new Error("No usable layers were produced.");
      }

      updateProcessingPreview(previewId, {
        progress: 0.96,
        message: "กำลังวาง Layer ลงบน Canvas…",
      });
      // Background-first order: first inserted sits at the bottom of the stack.
      addElements(newElements, "decompose image layers");
      selectOnly(newElements.map((el) => el.id));
      setStatusMessage(`Created ${newElements.length} editable RGBA layers.`);
      report("complete", `แยก Layer สำเร็จ ${newElements.length} ชิ้น และคงต้นฉบับไว้`, "success", 100);
    } catch (error) {
      if (signal.aborted || (error as Error).name === "AbortError") {
        setStatusMessage("Layer decompose cancelled.");
      } else {
        const message = error instanceof Error ? error.message : "Unknown Layer error.";
        setStatusMessage(`Layer error: ${message}`);
        report("error", `แยก Layer ไม่สำเร็จ: ${message}`, "error");
        window.alert(`แยก Layer ไม่สำเร็จ: ${message}`);
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  layerHandlerRef.current = handleLayer;

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
  const showAnalysisMessage = !controlledToolMode || activeTool === "extract";

  useEffect(() => {
    if (
      !autoRun ||
      (activeTool !== "remove-bg" &&
        activeTool !== "extract" &&
        activeTool !== "layer" &&
        activeTool !== "upscale")
    ) {
      return;
    }
    const runKey = activeTool;
    if (autoRunKeyRef.current === runKey || !claimImageActionRun(runKey)) return;
    autoRunKeyRef.current = runKey;
    const handler =
      activeTool === "remove-bg"
        ? removeBgHandlerRef.current
        : activeTool === "extract"
          ? extractHandlerRef.current
          : activeTool === "layer"
            ? layerHandlerRef.current
            : upscaleHandlerRef.current;
    void handler().finally(() => {
      releaseImageActionRun(runKey);
      onToolComplete?.();
    });
  }, [activeTool, autoRun, onToolComplete]);

  if (
    autoRun &&
    (activeTool === "remove-bg" ||
      activeTool === "extract" ||
      activeTool === "layer" ||
      activeTool === "upscale")
  )
    return null;

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
          {activeTool ? (
            `${IMAGE_ACTION_LABELS[activeTool]} Settings`
          ) : (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <IconSparkles size={13} color="var(--accent, #6366f1)" />
              Image Intelligence
            </span>
          )}
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
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
              <IconTrash size={10} color="#94a3b8" />
              Clear
            </span>
          </button>
        </div>
      </div>

      {showAnalysisMessage && analysisMessage && (
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

      {controlledToolMode && isVectorizeTool(activeTool) && (
        <div
          role="tablist"
          aria-label="Vectorize modes"
          data-testid="vectorize-tabs"
          style={{ display: "flex", gap: 4, marginBottom: 6 }}
        >
          {VECTORIZE_TOOL_IDS.map((tool) => {
            const selected = activeTool === tool;
            return (
              <button
                key={tool}
                type="button"
                role="tab"
                aria-selected={selected}
                data-vectorizer-tab={tool}
                onClick={() => onToolChange?.(tool)}
                style={{
                  flex: 1,
                  padding: "5px 6px",
                  border: selected ? "1px solid #6366f1" : "1px solid #cbd5e1",
                  borderRadius: 5,
                  background: selected ? "#eef2ff" : "#fff",
                  color: selected ? "#3730a3" : "#475569",
                  fontSize: 9.5,
                  fontWeight: selected ? 700 : 600,
                  cursor: "pointer",
                }}
              >
                {IMAGE_TOOL_LABELS[tool]}
              </button>
            );
          })}
        </div>
      )}

      {/* Row 1: AI Tools (alpha geometry is the recommended extraction path) */}
      <div style={{ display: controlledToolMode ? "none" : "flex", gap: 4 }}>
        <button
          type="button"
          disabled={busy}
          aria-label="RemoveBG"
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
          <span>
            <IconWand size={12} color="var(--accent, #6366f1)" />
          </span>
          <span>{busy ? "Processing..." : "RemoveBG"}</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExtract()}
          title="Extract foreground objects locally with alpha geometry"
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
          {busy ? "Processing..." : EXTRACT_LABEL}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleLayer()}
          title="Decompose into RGBA layers via Replicate Qwen Image Layered"
          aria-label={LAYER_LABEL}
          style={{
            flex: 1,
            padding: "5px 6px",
            background: "#fff",
            color: "#a21caf",
            border: "1px solid rgba(192, 38, 211, 0.35)",
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
          <IconLayers size={11} color="currentColor" />
          <span>{busy ? "Processing..." : LAYER_LABEL}</span>
        </button>
      </div>

      <div style={{ display: controlledToolMode ? "none" : "flex", gap: 4, marginTop: 4 }}>
        <button
          type="button"
          disabled={busy}
          aria-pressed={backend === "vtracer-wasm" && vectorizeOpen}
          aria-label="Vectorize"
          onClick={() => toggleVectorizeSettings("vtracer-wasm")}
          title="Open Vectorize settings · VTracer WASM"
          data-vectorizer="vectorize2"
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
          <IconPenTool size={11} color="currentColor" />
          <span>Vectorize</span>
        </button>
      </div>
      <div style={{ display: controlledToolMode ? "none" : "flex", gap: 4, marginTop: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleRecraftVectorize()}
          aria-label="Vectorize(Cloud)"
          data-vectorizer="vectorize3"
          title="Run Vectorize(Cloud) · Recraft Vectorize through your Replicate account"
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
          <span>
            <IconCloud size={12} color="#0f766e" />
          </span>
          <span>Vectorize(Cloud)</span>
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
      <div
        style={{
          display: controlledToolMode ? "none" : "block",
          marginTop: 3,
          color: "#64748b",
          fontSize: 8,
        }}
      >
        Cloud vectorizer · sends the image to Replicate · requires your Replicate Key
      </div>

      {controlledToolMode && activeTool === "vectorize3" && (
        <div
          data-testid="image-tool-settings"
          data-tool="vectorize3"
          style={{
            marginTop: 6,
            padding: 8,
            background: "#fff",
            border: "1px solid #99f6e4",
            borderRadius: 6,
          }}
        >
          <strong style={{ display: "block", color: "#134e4a", fontSize: 10 }}>
            Vectorize(Cloud) Settings
          </strong>
          <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
            Recraft Vectorize · Cloud opt-in · Replicate account required
          </span>
          <button
            type="button"
            disabled={busy}
            aria-label="Run Vectorize(Cloud)"
            onClick={() => void handleRecraftVectorize()}
            style={{
              width: "100%",
              marginTop: 7,
              padding: "6px 8px",
              border: "none",
              borderRadius: 5,
              background: "#0f766e",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Processing..." : "Run Vectorize(Cloud)"}
          </button>
        </div>
      )}

      {controlledToolMode && activeTool === "upscale" && (
        <div
          data-testid="image-tool-settings"
          data-tool="upscale"
          style={{
            marginTop: 6,
            padding: 8,
            background: "#fff",
            border: "1px solid #c7d2fe",
            borderRadius: 6,
          }}
        >
          <strong style={{ display: "block", color: "#3730a3", fontSize: 10 }}>
            P-Image-Upscale Settings
          </strong>
          <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
            Pruna AI · Cloud opt-in · output target in megapixels
          </span>
          <label
            htmlFor="upscale-resolution-select"
            style={{
              display: "block",
              marginTop: 8,
              color: "#334155",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            Output resolution
          </label>
          <select
            id="upscale-resolution-select"
            aria-label="Output resolution"
            value={upscaleResolution}
            onChange={(event) =>
              setUpscaleResolution(event.target.value as UpscaleResolutionPreset)
            }
            style={{
              width: "100%",
              marginTop: 4,
              padding: "6px 7px",
              border: "1px solid #cbd5e1",
              borderRadius: 5,
              background: "#fff",
              color: "#0f172a",
              fontSize: 10,
            }}
          >
            {UPSCALE_RESOLUTION_PRESETS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.rangeLabel})
              </option>
            ))}
          </select>
          <span
            aria-live="polite"
            style={{ display: "block", marginTop: 4, color: "#64748b", fontSize: 8.5 }}
          >
            Target output: {selectedUpscaleResolution.targetMegapixels} MP
          </span>
          <button
            type="button"
            disabled={busy}
            aria-label="Run Upscale"
            onClick={() => void handleUpscale()}
            style={{
              width: "100%",
              marginTop: 7,
              padding: "6px 8px",
              border: "none",
              borderRadius: 5,
              background: "#4f46e5",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Processing..." : "Run Upscale"}
          </button>
        </div>
      )}

      {/* Ultra-High-Fidelity Vectorizer Options Panel */}
      {vectorizeOpen && (
        <div
          data-testid={
            !controlledToolMode || activeTool === "vectorize2" ? "image-tool-settings" : undefined
          }
          data-tool={
            !controlledToolMode || activeTool === "vectorize2"
              ? (activeTool ?? "vectorize2")
              : undefined
          }
          style={{
            display: controlledToolMode && activeTool !== "vectorize2" ? "none" : undefined,
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
              VTracer WASM Settings
            </strong>
            <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 8.5 }}>
              Local Rust/WASM trace with independent native controls
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconSparkles size={11} color="#f59e0b" />
                <span>High-Fidelity (24c)</span>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconCamera size={11} color="#0284c7" />
                <span>Photo Ultra (36c)</span>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconPalette size={11} color="#ea580c" />
                <span>Illustration (12c)</span>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconPolaroid size={11} color="#10b981" />
                <span>Clipart (8c)</span>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconPenTool size={11} color="#6366f1" />
                <span>Line Art (Ink)</span>
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
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <IconContrast size={11} color="#1e293b" />
                <span>Silhouette (B&W)</span>
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
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  transform: showAdvanced ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.15s ease",
                }}
              >
                <IconChevronDown size={10} />
              </span>
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
              <IconZap size={12} color="#ffffff" fill="#ffffff" />
              <span>{busy ? "Tracing Vector..." : "Generate VTracer Paths"}</span>
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
