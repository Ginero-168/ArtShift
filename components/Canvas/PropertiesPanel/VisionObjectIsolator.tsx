"use client";

import { useCallback, useRef, useState } from "react";
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
import { resetAICache } from "@/lib/vision/resetCache";
import { cropImageRegion, visionDetect } from "@/lib/vision/visionEngine";

interface DetectedObject {
  label: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
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
        console.error(err);
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
      console.error("Remove BG failed:", err);
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
      console.error("Auto Select Subject failed:", err);
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

  const handleDetect = async () => {
    const url = await getImageDataUrl();
    if (!url) {
      setStatusMessage("Image data not found in cache");
      return;
    }

    setBusy(true);
    setProgress(10);
    setStatusMessage("Scanning image with Vision AI...");

    try {
      const res = await visionDetect(url, (p) => setProgress(Math.round(p * 100)));
      if (res.objects.length === 0) {
        setStatusMessage("No distinct objects detected");
        setDetectedObjects([]);
      } else {
        setDetectedObjects(res.objects);
        setStatusMessage(`Found ${res.objects.length} isolated objects`);
      }
    } catch (err) {
      console.error(err);
      setStatusMessage("Detection failed: " + (err as Error).message);
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
      const cropped = await cropImageRegion(url, obj);
      const newImg = createImage({
        x: element.x + 20,
        y: element.y + 20,
        width: Math.round(element.width * (obj.x_max - obj.x_min)),
        height: Math.round(element.height * (obj.y_max - obj.y_min)),
        fileId: cropped.dataUrl,
        naturalWidth: cropped.width,
        naturalHeight: cropped.height,
      });

      addElement(newImg, `isolate ${obj.label}`);
      selectOnly([newImg.id]);
      setStatusMessage(`Extracted ${obj.label} to canvas!`);
    } catch (err) {
      console.error(err);
      setStatusMessage("Extraction failed: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const isolateAllObjects = async () => {
    const url = await getImageDataUrl();
    if (!url || detectedObjects.length === 0) return;

    setBusy(true);
    setStatusMessage(`Extracting all ${detectedObjects.length} objects...`);

    try {
      const newElements = [];
      let offset = 20;

      for (const obj of detectedObjects) {
        const cropped = await cropImageRegion(url, obj);
        const newImg = createImage({
          x: element.x + offset,
          y: element.y + offset,
          width: Math.round(element.width * (obj.x_max - obj.x_min)),
          height: Math.round(element.height * (obj.y_max - obj.y_min)),
          fileId: cropped.dataUrl,
          naturalWidth: cropped.width,
          naturalHeight: cropped.height,
        });
        newElements.push(newImg);
        offset += 24;
      }

      addElements(newElements, "isolate all objects");
      selectOnly(newElements.map((el) => el.id));
      setStatusMessage(`Extracted ${newElements.length} objects!`);
    } catch (err) {
      console.error(err);
      setStatusMessage("Batch extraction failed: " + (err as Error).message);
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

      {/* Row 1: AI Tools (Remove BG & Auto-Detect) */}
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
          onClick={handleDetect}
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
          {busy ? "Scanning..." : "Auto-Detect"}
        </button>

        {detectedObjects.length > 1 && (
          <button
            type="button"
            disabled={busy}
            onClick={isolateAllObjects}
            style={{
              padding: "5px 8px",
              background: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              fontWeight: 600,
              fontSize: 10,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            Extract All
          </button>
        )}
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
