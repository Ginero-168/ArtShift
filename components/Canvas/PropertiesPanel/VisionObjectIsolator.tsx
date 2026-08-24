"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type AIProgressStatus, reportAIProgress, reportAIResult } from "@/lib/ai/progressReporter";
import { removeBackground } from "@/lib/ai/removeBg";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  VECTORIZE_PRESET_CONFIGS,
  VectorizeCancelledError,
  type VectorizeOptions,
  type VectorizePreset,
  type VectorizeProgress,
  vectorizeImage,
} from "@/lib/vectorize/vectorizer";
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

export function VisionObjectIsolator({ element }: { element: ImageElement }) {
  const addElement = useEngine((s) => s.addElement);
  const addElements = useEngine((s) => s.addElements);
  const selectOnly = useEngine((s) => s.selectOnly);
  const updateElements = useEngine((s) => s.updateElements);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [detectedForegroundUrl, setDetectedForegroundUrl] = useState<string | null>(null);
  const [detectedForegroundFileId, setDetectedForegroundFileId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [vectorizeOpen, setVectorizeOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Vectorizer State
  const [preset, setPreset] = useState<VectorizePreset>("highFidelity");
  const [colors, setColors] = useState(24);
  const [detailLevel, setDetailLevel] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [smoothing, setSmoothing] = useState(0.25);
  const [cornerSharpness, setCornerSharpness] = useState(0.65);
  const [minArea, setMinArea] = useState(4);
  const vectorizeAbortRef = useRef<AbortController | null>(null);
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
    if (p !== "custom") {
      const cfg = VECTORIZE_PRESET_CONFIGS[p];
      setColors(cfg.colors);
      setDetailLevel(cfg.detailLevel);
      setSmoothing(cfg.smoothing);
      setCornerSharpness(cfg.cornerSharpness);
      setMinArea(cfg.minArea);
    }
  };

  const getImageDataUrl = useCallback(async (): Promise<string | null> => {
    const cached = getCached(element.fileId);
    return cached?.dataURL ?? null;
  }, [element.fileId]);

  const handleVectorize = async (customOpts?: Partial<VectorizeOptions>) => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    const controller = new AbortController();
    vectorizeAbortRef.current = controller;
    setBusy(true);
    setProgress(0);
    setStatusMessage("Running high-precision Vector Trace...");
    const report = createProgressReporter("Vectorize");
    report("start", "เริ่มแปลงภาพเป็น Vector", "started", 0);

    try {
      const isMonochrome = preset === "silhouette" || preset === "lineArt";
      const res = await vectorizeImage(
        url,
        {
          x: element.x + 24,
          y: element.y + 24,
          width: element.width,
          height: element.height,
        },
        {
          preset,
          mode: isMonochrome ? "monochrome" : "color",
          colors: isMonochrome ? 2 : colors,
          detailLevel,
          smoothing,
          cornerSharpness,
          minArea,
          ...customOpts,
        },
        {
          signal: controller.signal,
          onProgress: ({ progress, stage }: VectorizeProgress) => {
            setProgress(Math.round(progress * 100));
            setStatusMessage(
              stage === "loading"
                ? "Loading image for vectorization..."
                : stage === "quantizing"
                  ? "Quantizing image colors..."
                  : stage === "tracing"
                    ? "Tracing contours in background..."
                    : "Building editable vector paths...",
            );
          },
        },
      );

      if (res.elements.length === 0) {
        setStatusMessage("No distinct vector paths detected");
        report("complete", "ไม่พบเส้น Vector ที่แยกได้", "fallback", 100);
      } else {
        addElements(res.elements, "vectorize image to paths");
        selectOnly(res.elements.map((el) => el.id));
        setStatusMessage(
          `Traced ${res.elements.length} vector layers (${res.totalNodes} anchor nodes, ${res.palette.length} colors)!`,
        );
        report("complete", `สร้าง Vector สำเร็จ ${res.elements.length} Layers`, "success", 100);
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
      if (vectorizeAbortRef.current === controller) vectorizeAbortRef.current = null;
      setBusy(false);
      setProgress(null);
    }
  };

  const cancelVectorize = () => {
    vectorizeAbortRef.current?.abort();
  };

  const handleRemoveBg = async () => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    setBusy(true);
    setProgress(0);
    const report = createProgressReporter("Remove BG");
    report("start", "เริ่มลบพื้นหลังแบบ Local", "started", 0);
    setStatusMessage("Preparing local background removal...");

    try {
      const resultUrl = await removeBackground(cached.dataURL, {
        onProgress: (value) => {
          setProgress(Math.round(value * 100));
          setStatusMessage(
            value < 0.1
              ? "Preparing image..."
              : value < 0.75
                ? "Running locally in the background..."
                : "Refining foreground edges...",
          );
        },
      });
      const newCached = await loadDataURL(resultUrl);
      updateElements(
        [
          {
            id: element.id,
            patch: {
              fileId: newCached.fileId,
              naturalWidth: newCached.width,
              naturalHeight: newCached.height,
              crop: null,
              status: "loaded" as const,
              linkedAssetId: undefined,
              sourceName: undefined,
              sourceLastModified: undefined,
              sourceSize: undefined,
            },
          },
        ],
        "remove background",
      );
      setDetectedForegroundUrl(resultUrl);
      setDetectedForegroundFileId(newCached.fileId);
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
      onMaskProgress?: (objectIndex: number, progress: number) => void;
    } = {},
  ) => {
    const newElements = [];
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
        x: Math.round(element.x + element.width * x),
        y: Math.round(element.y + element.height * y),
        width: Math.max(
          20,
          Math.round(element.width * objectWidth * (trimmed.width / Math.max(1, cropped.width))),
        ),
        height: Math.max(
          20,
          Math.round(
            element.height * objectHeight * (trimmed.height / Math.max(1, cropped.height)),
          ),
        ),
        ...asset,
      });
      newElements.push(newImg);
      onProgress?.((index + 1) / objects.length);
    }

    return newElements;
  };

  const handleExtractAll = async () => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    setBusy(true);
    setProgress(0);
    const report = createProgressReporter("Extract All");
    report("start", "เริ่มแยก Object ทั้งหมด", "started", 0);
    setStatusMessage("Preparing fast foreground extraction...");

    try {
      const reusableForeground = isForegroundForSource(
        element.fileId,
        detectedForegroundFileId,
        detectedForegroundUrl,
      )
        ? detectedForegroundUrl
        : null;
      let foregroundUrl: string;
      if (reusableForeground) {
        foregroundUrl = reusableForeground;
        setProgress(70);
        setStatusMessage("Using the existing background-removed foreground...");
        report("foreground", "ใช้ผลลัพธ์ Remove BG ที่มีอยู่แล้ว", "success", 70);
      } else {
        setStatusMessage("Separating foreground pixels...");
        report("foreground", "กำลังลบพื้นหลังเพื่อเตรียม Alpha", "step", 5);
        foregroundUrl = await removeBackground(url, {
          onProgress: (value) => setProgress(value * 70),
        });
        report("foreground", "สร้าง Foreground Alpha สำเร็จ", "success", 70);
      }
      setDetectedForegroundUrl(foregroundUrl);
      setDetectedForegroundFileId(element.fileId);

      // Fast extraction is the canonical geometry path. Florence-2 is optional
      // metadata here: its coarse boxes can label components, but must not
      // replace them or cause nearby objects to be merged again.
      setProgress(74);
      setStatusMessage("Finding high-resolution foreground components...");
      report("components", "กำลังค้นหา Components ความละเอียดสูง", "step", 74);
      const alphaObjects = await detectAlphaObjectBoxes(foregroundUrl, 1536);
      let objects = alphaObjects;
      report("components", `พบ Components เบื้องต้น ${alphaObjects.length} ชิ้น`, "success", 78);

      let visionObjects: DetectedObject[] = [];
      try {
        setStatusMessage("Detecting object instances with Florence-2...");
        report("florence", "กำลังใช้ Florence-2 หา Object และชื่อ", "step", 79);
        const res = await visionDetect(url, (value) => setProgress(78 + value * 5));
        visionObjects = res.objects;
        report("florence", `Florence-2 พบ ${visionObjects.length} Proposal`, "success", 83);
      } catch (error) {
        console.warn("Florence-2 labels unavailable; keeping local Fast geometry.", error);
        report("florence", "Florence-2 ใช้งานไม่ได้ จึงใช้ Geometry เดิมต่อ", "fallback", 83);
      }

      if (shouldRunVisionRecall(visionObjects, alphaObjects)) {
        try {
          setStatusMessage("Running a dense recall pass for missed objects...");
          report("florence-recall", "กำลังค้นหา Object ที่ Florence-2 รอบแรกตกหล่น", "step", 84);
          const recall = await visionDenseDetect(url, (value) => setProgress(83 + value * 3));
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
            setProgress(86 + value * 3),
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
        sam2Session = await createSam2Session(url, (value) => setProgress(90 + value * 3));
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
      setProgress(92);
      const newElements = await extractObjectBatch(
        foregroundUrl,
        objects,
        (value) => setProgress(92 + value * 7),
        {
          sam2Session,
          maskSourceUrl: url,
          alphaComponents: alphaObjects,
          trimTransparent: true,
          onMaskProgress: (objectIndex, value) => {
            if (sam2Session) {
              setProgress(92 + ((objectIndex + value) / Math.max(1, objects.length)) * 7);
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

  const handleExtractFast = async () => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    setBusy(true);
    setProgress(0);
    const report = createProgressReporter("Extract Fast");
    report("start", "เริ่มแยก Object แบบ Fast", "started", 0);
    setStatusMessage("Removing background for fast extraction...");

    try {
      const reusableForeground = isForegroundForSource(
        element.fileId,
        detectedForegroundFileId,
        detectedForegroundUrl,
      )
        ? detectedForegroundUrl
        : null;
      report(
        "foreground",
        reusableForeground ? "กำลังใช้ Foreground ที่มีอยู่แล้ว" : "กำลังลบพื้นหลังสำหรับโหมด Fast",
        "step",
        5,
      );
      const foregroundUrl =
        reusableForeground ??
        (await removeBackground(url, {
          onProgress: (value) => setProgress(Math.round(value * 70)),
        }));
      report("foreground", "เตรียม Foreground Alpha สำเร็จ", "success", 70);
      setDetectedForegroundUrl(foregroundUrl);
      setDetectedForegroundFileId(element.fileId);
      setProgress(74);
      const objects = await detectAlphaObjectBoxes(foregroundUrl);
      setDetectedObjects(objects);
      report("components", `พบ Components จำนวน ${objects.length} ชิ้น`, "success", 74);
      if (objects.length === 0) {
        setStatusMessage("No separate foreground objects found");
        report("complete", "ไม่พบ Object ที่แยกได้", "fallback", 100);
        return;
      }

      setStatusMessage(`Extracting ${objects.length} objects without Vision AI...`);
      const newElements = await extractObjectBatch(foregroundUrl, objects, (value) =>
        setProgress(74 + value * 25),
      );
      if (newElements.length === 0) {
        setStatusMessage("No visible foreground objects were found");
        return;
      }
      addElements(newElements, "fast extract foreground objects");
      selectOnly(newElements.map((el) => el.id));
      setStatusMessage(`Fast-extracted ${newElements.length} transparent objects!`);
      report("complete", `แยกแบบ Fast สำเร็จ ${newElements.length} ชิ้น`, "success", 100);
    } catch (err) {
      console.warn("Fast extraction failed:", err);
      setStatusMessage("Fast extraction failed: " + (err as Error).message);
      report("error", `Extract Fast ไม่สำเร็จ: ${(err as Error).message}`, "error");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const isolateSingleObject = async (obj: DetectedObject) => {
    const url = await getImageDataUrl();
    if (!url) return;

    setBusy(true);
    setStatusMessage(`Extracting ${obj.label}...`);

    try {
      const foregroundUrl = detectedForegroundUrl ?? (await removeBackground(url));
      const cropped = await cropImageRegion(foregroundUrl, obj);
      const cached = await loadDataURL(cropped.dataUrl);
      const asset = createCachedImageAsset(cached);
      const newImg = createImage({
        x: Math.round(element.x + element.width * obj.x_min),
        y: Math.round(element.y + element.height * obj.y_min),
        width: Math.max(20, Math.round(element.width * (obj.x_max - obj.x_min))),
        height: Math.max(20, Math.round(element.height * (obj.y_max - obj.y_min))),
        ...asset,
      });

      addElement(newImg, `isolate ${obj.label}`);
      selectOnly([newImg.id]);
      setStatusMessage(`Extracted ${obj.label} to canvas!`);
    } catch (err) {
      console.warn("Object extraction failed:", err);
      setStatusMessage("Extraction failed: " + (err as Error).message);
    } finally {
      setBusy(false);
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

      {/* Row 1: AI Tools (Fast geometry is the recommended extraction path) */}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={handleRemoveBg}
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
          onClick={handleExtractAll}
          title="Extract using Fast alpha geometry and optionally add Florence-2 labels"
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
          onClick={handleExtractFast}
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
          {busy ? "Processing..." : "Extract Fast"}
        </button>
      </div>

      {/* Row 2: Vectorize action */}
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => setVectorizeOpen(!vectorizeOpen)}
          title="Auto-Trace & Convert this image into editable Vector Paths"
          style={{
            flex: 1,
            padding: "6px 8px",
            background: vectorizeOpen ? "#0f172a" : "#fff",
            color: vectorizeOpen ? "#fff" : "var(--accent, #6366f1)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: 5,
            fontWeight: 600,
            fontSize: 10,
            cursor: busy ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <span>⚡</span>
          <span>Vectorize (Auto-Trace)</span>
        </button>
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
              Select Trace Quality / Style:
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>
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
          </div>

          {/* Quick Color Count Bar */}
          {preset !== "silhouette" && preset !== "lineArt" && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: "#475569" }}>Colors:</span>
              <div style={{ display: "flex", gap: 2 }}>
                {[4, 8, 16, 24, 32, 48].map((num) => (
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
                ))}
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

                {/* Min Area (Noise Filter) */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8.5 }}>
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
              <span>{busy ? "Tracing Vector..." : "Generate Vector Paths"}</span>
            </button>
            {vectorizeAbortRef.current && (
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
