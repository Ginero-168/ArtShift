"use client";

import { useState } from "react";
import { getImageCache } from "@/lib/engine/imageCache";
import type { Tool } from "@/lib/engine/store";
import { useEngine } from "@/lib/engine/store";
import { isRasterPaintTool, isRasterRetouchTool } from "@/lib/engine/toolBehavior";
import { magicWandMaskToDataUrl } from "@/lib/raster/magicWand";
import { loadOpenCvJs } from "@/lib/raster/opencvJsAdapter";
import { createRasterSelectionSample } from "@/lib/raster/selectionInteraction";

type Props = {
  tool: Tool;
};

const controlLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  fontSize: 9,
  lineHeight: "12px",
  color: "var(--ink-muted, #64748b)",
} as const;

const rangeStyle = {
  width: 72,
  height: 14,
  accentColor: "var(--accent, #2563eb)",
} as const;

export default function RasterToolOptions({ tool }: Props) {
  const [autoSubjectBusy, setAutoSubjectBusy] = useState(false);
  const [autoSubjectError, setAutoSubjectError] = useState<string | null>(null);
  const brushSize = useEngine((state) => state.rasterBrushSize);
  const setBrushSize = useEngine((state) => state.setRasterBrushSize);
  const brushOpacity = useEngine((state) => state.rasterBrushOpacity);
  const setBrushOpacity = useEngine((state) => state.setRasterBrushOpacity);
  const brushHardness = useEngine((state) => state.rasterBrushHardness);
  const setBrushHardness = useEngine((state) => state.setRasterBrushHardness);
  const brushColor = useEngine((state) => state.rasterBrushColor);
  const setBrushColor = useEngine((state) => state.setRasterBrushColor);
  const magicWandTolerance = useEngine((state) => state.rasterMagicWandTolerance);
  const setMagicWandTolerance = useEngine((state) => state.setRasterMagicWandTolerance);
  const quickSelectionSize = useEngine((state) => state.rasterQuickSelectionSize);
  const setQuickSelectionSize = useEngine((state) => state.setRasterQuickSelectionSize);
  const selectedIds = useEngine((state) => state.selectedIds);
  const currentSlide = useEngine((state) => state.currentSlide());
  const setRasterSelection = useEngine((state) => state.setRasterSelection);

  const runAutoSubject = async () => {
    const image = currentSlide?.elements.find(
      (element): element is import("@/lib/engine/types").ImageElement =>
        selectedIds.has(element.id) && element.type === "image",
    );
    if (!image) {
      setAutoSubjectError("Select one image first");
      return;
    }
    const pixels = createRasterSelectionSample(image, getImageCache());
    if (!pixels) {
      setAutoSubjectError("Image pixels are not readable");
      return;
    }
    setAutoSubjectBusy(true);
    setAutoSubjectError(null);
    try {
      const mask = await (await loadOpenCvJs()).autoSubject(pixels);
      setRasterSelection(image.id, {
        width: image.width,
        height: image.height,
        operations: [
          {
            id: crypto.randomUUID(),
            mode: "replace",
            shape: {
              kind: "bitmap",
              dataUrl: magicWandMaskToDataUrl(mask, pixels.width, pixels.height),
            },
          },
        ],
      });
    } catch {
      setAutoSubjectError("Auto Subject needs OpenCV.js and a readable image");
    } finally {
      setAutoSubjectBusy(false);
    }
  };

  if (tool === "rasterMagicWand") {
    return (
      <div role="group" aria-label="Magic Wand options" style={optionsStyle}>
        <label title="Color similarity tolerance" style={controlLabelStyle}>
          <span>Tolerance</span>
          <input
            aria-label="Tolerance"
            type="range"
            min={0}
            max={255}
            step={1}
            value={magicWandTolerance}
            onChange={(event) => setMagicWandTolerance(Number(event.currentTarget.value))}
            style={rangeStyle}
          />
          <output>{magicWandTolerance}</output>
        </label>
        <button
          type="button"
          title="Detect the main subject with OpenCV.js"
          onClick={() => void runAutoSubject()}
          disabled={autoSubjectBusy}
          style={advancedButtonStyle}
        >
          {autoSubjectBusy ? "Detecting…" : "Auto Subject"}
        </button>
        {autoSubjectError ? <span style={errorStyle}>{autoSubjectError}</span> : null}
      </div>
    );
  }

  if (tool === "rasterQuickSelection") {
    return (
      <div role="group" aria-label="Quick Selection options" style={optionsStyle}>
        <label title="Quick Selection brush diameter" style={controlLabelStyle}>
          <span>Size</span>
          <input
            aria-label="Quick Selection size"
            type="range"
            min={1}
            max={512}
            step={1}
            value={quickSelectionSize}
            onChange={(event) => setQuickSelectionSize(Number(event.currentTarget.value))}
            style={rangeStyle}
          />
          <output>{quickSelectionSize}</output>
        </label>
        <label title="Color similarity tolerance" style={controlLabelStyle}>
          <span>Tolerance</span>
          <input
            aria-label="Tolerance"
            type="range"
            min={0}
            max={255}
            step={1}
            value={magicWandTolerance}
            onChange={(event) => setMagicWandTolerance(Number(event.currentTarget.value))}
            style={rangeStyle}
          />
          <output>{magicWandTolerance}</output>
        </label>
        <button
          type="button"
          title="Detect the main subject with OpenCV.js"
          onClick={() => void runAutoSubject()}
          disabled={autoSubjectBusy}
          style={advancedButtonStyle}
        >
          {autoSubjectBusy ? "Detecting…" : "Auto Subject"}
        </button>
        {autoSubjectError ? <span style={errorStyle}>{autoSubjectError}</span> : null}
      </div>
    );
  }

  if (!isRasterPaintTool(tool) && !isRasterRetouchTool(tool)) return null;

  return (
    <div role="group" aria-label="Raster brush options" style={optionsStyle}>
      <label title="Brush size in image pixels" style={controlLabelStyle}>
        <span>Size</span>
        <input
          aria-label="Brush size"
          type="range"
          min={1}
          max={512}
          step={1}
          value={brushSize}
          onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
          style={rangeStyle}
        />
        <output>{brushSize}</output>
      </label>
      <label title="Stroke opacity" style={controlLabelStyle}>
        <span>Opacity</span>
        <input
          aria-label="Brush opacity"
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(brushOpacity * 100)}
          onChange={(event) => setBrushOpacity(Number(event.currentTarget.value) / 100)}
          style={rangeStyle}
        />
        <output>{Math.round(brushOpacity * 100)}%</output>
      </label>
      <label title="Brush edge hardness" style={controlLabelStyle}>
        <span>Hardness</span>
        <input
          aria-label="Brush hardness"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(brushHardness * 100)}
          disabled={tool === "rasterPencil"}
          onChange={(event) => setBrushHardness(Number(event.currentTarget.value) / 100)}
          style={rangeStyle}
        />
        <output>{tool === "rasterPencil" ? "100%" : `${Math.round(brushHardness * 100)}%`}</output>
      </label>
      <label title="Paint color" style={controlLabelStyle}>
        <span>Color</span>
        <input
          aria-label="Paint color"
          type="color"
          value={brushColor}
          disabled={tool === "rasterEraser" || isRasterRetouchTool(tool)}
          onChange={(event) => setBrushColor(event.currentTarget.value)}
          style={{
            width: 24,
            height: 22,
            padding: 1,
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 4,
            cursor:
              tool === "rasterEraser" || isRasterRetouchTool(tool) ? "not-allowed" : "pointer",
          }}
        />
      </label>
    </div>
  );
}

const optionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "max-content",
} as const;

const advancedButtonStyle = {
  height: 24,
  padding: "0 7px",
  border: "1px solid var(--stroke, #dbe2ea)",
  borderRadius: 5,
  background: "var(--surface-subtle, #f8fafc)",
  color: "var(--ink, #334155)",
  fontSize: 9,
  fontWeight: 700,
  whiteSpace: "nowrap" as const,
  cursor: "pointer",
} as const;

const errorStyle = {
  maxWidth: 170,
  color: "#b91c1c",
  fontSize: 9,
  lineHeight: "11px",
} as const;
