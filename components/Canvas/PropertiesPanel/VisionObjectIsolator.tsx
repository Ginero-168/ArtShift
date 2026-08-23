"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { removeBackground } from "@/lib/ai/removeBg";
import { createImage } from "@/lib/engine/factory";
import { getCached, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import { createAlphaMaskDataUrl, createRasterSelectionOperation } from "@/lib/raster/selection";
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
} from "@/lib/vision/advancedVision";
import {
  createAlphaTiles,
  findAlphaComponents,
  mapAlphaComponentToImage,
  mergeAlphaComponents,
} from "@/lib/vision/alphaComponents";
import { createCachedImageAsset } from "@/lib/vision/extractedImageAsset";
import { alphaCoverageFromRgba, hasUsableForeground } from "@/lib/vision/foreground";
import { mergeVisionWithAlphaComponents } from "@/lib/vision/objectBoxes";
import { resetAICache } from "@/lib/vision/resetCache";
import {
  cropImageRegion,
  cropImageRegionWithMask,
  trimTransparentRegion,
  visionDetect,
} from "@/lib/vision/visionEngine";

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
  options: { quality?: "fast" | "accurate" } = {},
): Promise<DetectedObject[]> {
  const image = new Image();
  image.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not inspect the transparent foreground."));
  });

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  const quality = options.quality ?? "fast";
  const maxDimension = quality === "accurate" ? 1024 : 512;
  const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const fullCanvas = document.createElement("canvas");
  fullCanvas.width = width;
  fullCanvas.height = height;
  const fullContext = fullCanvas.getContext("2d");
  if (!fullContext) throw new Error("Could not create the foreground analysis canvas.");
  fullContext.drawImage(image, 0, 0, width, height);

  const tileSize = quality === "accurate" ? 768 : 512;
  const overlap = quality === "accurate" ? 96 : 0;
  const tiles = createAlphaTiles(width, height, tileSize, overlap);
  const components = tiles.flatMap((tile) => {
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tile.width;
    tileCanvas.height = tile.height;
    const tileContext = tileCanvas.getContext("2d");
    if (!tileContext) return [];
    tileContext.drawImage(
      fullCanvas,
      tile.x,
      tile.y,
      tile.width,
      tile.height,
      0,
      0,
      tile.width,
      tile.height,
    );
    const rgba = tileContext.getImageData(0, 0, tile.width, tile.height).data;
    return findAlphaComponents(rgba, tile.width, tile.height, {
      alphaThreshold: 24,
      minAreaRatio: quality === "accurate" ? 0.00025 : 0.0005,
      maxComponents: 64,
      padding: quality === "accurate" ? 3 : 2,
      thinComponentMinArea: quality === "accurate" ? 12 : 8,
      thinComponentMaxThickness: 8,
      thinComponentMinLength: 12,
    }).map((component) => mapAlphaComponentToImage(component, tile, width, height));
  });

  return mergeAlphaComponents(components)
    .sort((first, second) => second.area - first.area)
    .slice(0, quality === "accurate" ? 128 : 64)
    .sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min)
    .map(({ area: _area, ...box }) => ({ label: "object", ...box }));
}

export function VisionObjectIsolator({ element }: { element: ImageElement }) {
  const addElement = useEngine((s) => s.addElement);
  const addElements = useEngine((s) => s.addElements);
  const selectOnly = useEngine((s) => s.selectOnly);
  const setTool = useEngine((s) => s.setTool);
  const setRasterSelection = useEngine((s) => s.setRasterSelection);
  const updateElements = useEngine((s) => s.updateElements);
  const rasterExecutionMode = useEngine((s) => s.rasterExecutionMode);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [detectedForegroundUrl, setDetectedForegroundUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [extractionQuality, setExtractionQuality] = useState<"balanced" | "precision">("balanced");
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

  useEffect(() => {
    if (!currentFileId) return;
    setDetectedObjects([]);
    setDetectedForegroundUrl(null);
  }, [currentFileId]);

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
      } else {
        addElements(res.elements, "vectorize image to paths");
        selectOnly(res.elements.map((el) => el.id));
        setStatusMessage(
          `Traced ${res.elements.length} vector layers (${res.totalNodes} anchor nodes, ${res.palette.length} colors)!`,
        );
      }
    } catch (err) {
      if (err instanceof VectorizeCancelledError || (err as Error).name === "AbortError") {
        setStatusMessage("Vectorization cancelled.");
      } else {
        console.warn("Vectorize failed:", err);
        setStatusMessage("Vectorize error: " + (err as Error).message);
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
    setStatusMessage(
      rasterExecutionMode === "eco"
        ? "Preparing local background removal..."
        : "Sending background removal to Fast API...",
    );

    try {
      const resultUrl = await removeBackground(cached.dataURL, {
        mode: rasterExecutionMode,
        onProgress: (value) => {
          setProgress(Math.round(value * 100));
          setStatusMessage(
            value < 0.1
              ? "Preparing image..."
              : value < 0.75
                ? rasterExecutionMode === "eco"
                  ? "Running locally in the background..."
                  : "Waiting for Fast API..."
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
      setStatusMessage("Background removed successfully!");
    } catch (err) {
      console.warn("Remove BG failed:", err);
      setStatusMessage("Failed to remove background: " + (err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleAutoSelectSubject = async () => {
    const cached = getCached(element.fileId);
    if (!cached?.dataURL) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    setBusy(true);
    setProgress(0);
    setStatusMessage("Selecting subject locally...");

    try {
      const resultUrl = await removeBackground(cached.dataURL, {
        mode: rasterExecutionMode,
        allowRemoteFallback: false,
        onProgress: (value) => setProgress(Math.round(value * 100)),
      });
      const maskDataUrl = await createAlphaMaskDataUrl(resultUrl);
      setRasterSelection(element.id, {
        width: element.width,
        height: element.height,
        operations: [
          createRasterSelectionOperation("replace", {
            kind: "bitmap",
            dataUrl: maskDataUrl,
          }),
        ],
      });
      selectOnly([element.id]);
      setTool("rasterMarquee");
      setStatusMessage("Subject selected locally. You can refine or add to the selection.");
    } catch (err) {
      console.warn("Auto Select Subject failed:", err);
      setStatusMessage("Auto Select Subject failed: " + (err as Error).message);
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
    options: { maskSession?: Sam2Session; trimTransparent?: boolean } = {},
  ) => {
    const newElements = [];

    for (const [index, obj] of objects.entries()) {
      let cropped: Awaited<ReturnType<typeof cropImageRegion>>;
      if (options.maskSession) {
        try {
          const mask = await options.maskSession.segment(obj, (progress) =>
            onProgress?.((index + progress) / Math.max(1, objects.length)),
          );
          cropped = await cropImageRegionWithMask(foregroundUrl, obj, mask);
        } catch (error) {
          console.warn("SAM 2 mask failed for one object; using the hybrid crop.", error);
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
      const width = Math.max(
        20,
        Math.round(element.width * objectWidth * (trimmed.width / Math.max(1, cropped.width))),
      );
      const height = Math.max(
        20,
        Math.round(element.height * objectHeight * (trimmed.height / Math.max(1, cropped.height))),
      );
      const newImg = createImage({
        x: Math.round(element.x + element.width * x),
        y: Math.round(element.y + element.height * y),
        width,
        height,
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
    setProgress(10);
    setStatusMessage("Detecting objects, then extracting all...");

    try {
      let visionObjects: DetectedObject[] = [];
      try {
        const res = await visionDetect(url, (p) => setProgress(Math.round(p * 25)));
        visionObjects = res.objects;
      } catch (error) {
        console.warn("Florence-2 detection failed; continuing with foreground geometry.", error);
        setStatusMessage("Florence-2 missed or could not detect objects; completing locally...");
      }

      setDetectedObjects(visionObjects);
      setProgress(30);
      setStatusMessage("Separating foreground pixels...");
      const foregroundUrl = await removeBackground(url, {
        mode: rasterExecutionMode,
        onProgress: (value) => setProgress(30 + value * 35),
      });
      setDetectedForegroundUrl(foregroundUrl);

      setProgress(67);
      setStatusMessage("Recovering objects missed by Florence-2...");
      const alphaObjects = await detectAlphaObjectBoxes(foregroundUrl, {
        quality: extractionQuality === "precision" ? "accurate" : "fast",
      });
      let semanticObjects = visionObjects;
      if (extractionQuality === "precision") {
        setStatusMessage("Expanding object proposals with Grounding DINO...");
        try {
          const labels = [
            ...new Set([
              ...visionObjects.map((object) => object.label),
              "object",
              "product",
              "bag",
              "shirt",
              "bottle",
              "cup",
              "cap",
              "tree",
              "keychain",
              "box",
              "book",
              "container",
              "package",
              "clothing",
              "sign",
            ]),
          ];
          const groundingObjects = await groundingDinoDetect(url, labels, (value) =>
            setProgress(67 + value * 2),
          );
          semanticObjects = [
            ...semanticObjects,
            ...groundingObjects.map(({ score: _score, ...object }) => object),
          ];
        } catch (error) {
          console.warn("Grounding DINO unavailable; continuing with Florence proposals.", error);
          setStatusMessage("Grounding DINO unavailable; continuing with hybrid extraction...");
        }
      }
      const objects = mergeVisionWithAlphaComponents(semanticObjects, alphaObjects);
      setDetectedObjects(objects);
      if (objects.length === 0) {
        setStatusMessage("No visible foreground objects were found");
        return;
      }

      setStatusMessage(`Extracting all ${objects.length} transparent objects...`);
      let maskSession: Sam2Session | undefined;
      if (extractionQuality === "precision") {
        setProgress(69);
        setStatusMessage("Loading SAM 2 precision masks locally...");
        try {
          maskSession = await createSam2Session(url, (value) => setProgress(67 + value * 3));
        } catch (error) {
          console.warn("SAM 2 precision masks unavailable; using hybrid extraction.", error);
          setStatusMessage("SAM 2 unavailable; continuing with hybrid extraction...");
        }
      }
      const newElements = await extractObjectBatch(
        foregroundUrl,
        objects,
        (value) => setProgress(70 + value * 28),
        { maskSession, trimTransparent: extractionQuality === "precision" },
      );
      if (newElements.length === 0) {
        setStatusMessage("No visible foreground objects were found");
      } else {
        addElements(newElements, "extract all detected objects");
        selectOnly(newElements.map((el) => el.id));
        setStatusMessage(
          newElements.length === objects.length
            ? `Extracted ${newElements.length} transparent objects!`
            : `Extracted ${newElements.length} objects; skipped empty detections.`,
        );
      }
    } catch (err) {
      console.warn("Extract All failed:", err);
      setStatusMessage("Detection failed: " + (err as Error).message);
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
    setStatusMessage("Removing background for fast extraction...");

    try {
      const foregroundUrl = await removeBackground(url, {
        mode: rasterExecutionMode,
        onProgress: (value) => setProgress(Math.round(value * 70)),
      });
      setDetectedForegroundUrl(foregroundUrl);
      setProgress(74);
      const objects = await detectAlphaObjectBoxes(foregroundUrl, { quality: "fast" });
      setDetectedObjects(objects);
      if (objects.length === 0) {
        setStatusMessage("No separate foreground objects found");
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
    } catch (err) {
      console.warn("Fast extraction failed:", err);
      setStatusMessage("Fast extraction failed: " + (err as Error).message);
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
      const foregroundUrl =
        detectedForegroundUrl ??
        (await removeBackground(url, {
          mode: rasterExecutionMode,
        }));
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

      {/* Row 1: AI Tools (Remove BG & Extract All) */}
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
          title="Detect and extract every detected object immediately"
          style={{
            flex: 1,
            padding: "5px 8px",
            background: "var(--accent, #6366f1)",
            color: "#fff",
            border: "none",
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
          title="Remove the background and split visible regions without Florence-2"
          style={{
            flex: 1,
            padding: "5px 6px",
            background: "#0f172a",
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

      <button
        type="button"
        disabled={busy}
        onClick={handleAutoSelectSubject}
        title={
          rasterExecutionMode === "eco"
            ? "Select the main subject locally without uploading the image"
            : "Select the main subject with the Fast API"
        }
        style={{
          width: "100%",
          marginTop: 4,
          padding: "5px 8px",
          background: "rgba(16, 185, 129, 0.1)",
          color: "#047857",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          borderRadius: 5,
          fontWeight: 700,
          fontSize: 10,
          cursor: busy ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
        }}
      >
        <span>✦</span>
        <span>
          {busy
            ? "Selecting..."
            : `Auto Select Subject · ${rasterExecutionMode === "eco" ? "Local" : "Fast"}`}
        </span>
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 6,
          marginTop: 4,
          padding: "3px 5px",
          borderRadius: 4,
          background: "rgba(99, 102, 241, 0.05)",
        }}
      >
        <span style={{ fontSize: 9, color: "#475569" }}>Extraction quality</span>
        <select
          value={extractionQuality}
          disabled={busy}
          onChange={(event) => setExtractionQuality(event.target.value as "balanced" | "precision")}
          title="Precision uses a locally cached SAM 2 mask for each extracted object"
          style={{
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: 4,
            background: "#fff",
            color: "#1e1b4b",
            fontSize: 9,
            padding: "2px 4px",
          }}
        >
          <option value="balanced">Balanced · Stable Hybrid</option>
          <option value="precision">Precision · SAM 2</option>
        </select>
      </div>

      {/* Row 2: Vectorize Action Button */}
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
