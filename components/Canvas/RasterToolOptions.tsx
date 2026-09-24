"use client";

import { useState } from "react";
import { studioChrome } from "@/components/RasterStudio/studioChrome";
import { getImageCache } from "@/lib/engine/imageCache";
import type { Tool } from "@/lib/engine/store";
import { useEngine } from "@/lib/engine/store";
import {
  isRasterPaintTool,
  isRasterRetouchTool,
  isRasterSelectionTool,
} from "@/lib/engine/toolBehavior";
import { magicWandMaskToDataUrl } from "@/lib/raster/magicWand";
import { loadOpenCvJs } from "@/lib/raster/opencvJsAdapter";
import { createRasterSelectionSample } from "@/lib/raster/selectionInteraction";

type Props = {
  tool: Tool;
  /** Studio uses a calmer Affinity-like context bar on a dark chrome. */
  variant?: "default" | "studio";
};

const controlLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  flexShrink: 0,
  fontSize: 9,
  lineHeight: "12px",
  color: "var(--ink-muted, #78726a)",
} as const;

const rangeStyle = {
  width: 72,
  height: 14,
  accentColor: "var(--accent, #ca3701)",
} as const;

export default function RasterToolOptions({ tool, variant = "default" }: Props) {
  const studio = variant === "studio";
  const labels = studio ? studioLabelStyle : controlLabelStyle;
  const ranges = studio ? studioRangeStyle : rangeStyle;
  const buttons = studio ? studioAdvancedButtonStyle : advancedButtonStyle;
  const errors = studio ? studioErrorStyle : errorStyle;
  const row = studio ? studioOptionsStyle : optionsStyle;
  const [autoSubjectBusy, setAutoSubjectBusy] = useState(false);
  const [autoSubjectError, setAutoSubjectError] = useState<string | null>(null);
  const [featherPx, setFeatherPx] = useState(8);
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
  const magicWandContiguous = useEngine((state) => state.rasterMagicWandContiguous);
  const setMagicWandContiguous = useEngine((state) => state.setRasterMagicWandContiguous);
  const quickSelectionSize = useEngine((state) => state.rasterQuickSelectionSize);
  const setQuickSelectionSize = useEngine((state) => state.setRasterQuickSelectionSize);
  const selectedIds = useEngine((state) => state.selectedIds);
  const currentSlide = useEngine((state) => state.currentSlide());
  const setRasterSelection = useEngine((state) => state.setRasterSelection);
  const featherActiveRasterSelection = useEngine((state) => state.featherActiveRasterSelection);
  const hasActiveSelection = useEngine((state) => Boolean(state.activeRasterSelection));
  const selectionAntiAlias = useEngine((state) => state.rasterSelectionAntiAlias);
  const setSelectionAntiAlias = useEngine((state) => state.setRasterSelectionAntiAlias);

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
      <div role="group" aria-label="Magic Wand options" style={row}>
        <label title="Color similarity tolerance" style={labels}>
          <span>Tolerance</span>
          <input
            aria-label="Tolerance"
            type="range"
            min={0}
            max={255}
            step={1}
            value={magicWandTolerance}
            onChange={(event) => setMagicWandTolerance(Number(event.currentTarget.value))}
            style={ranges}
          />
          <output>{magicWandTolerance}</output>
        </label>
        <label title="Contiguous flood-fill vs all similar pixels" style={labels}>
          <input
            aria-label="Contiguous"
            type="checkbox"
            checked={magicWandContiguous}
            onChange={(event) => setMagicWandContiguous(event.currentTarget.checked)}
          />
          <span>Contiguous</span>
        </label>
        <button
          type="button"
          title="Detect the main subject with OpenCV.js"
          onClick={() => void runAutoSubject()}
          disabled={autoSubjectBusy}
          style={buttons}
        >
          {autoSubjectBusy ? "Detecting…" : "Auto Subject"}
        </button>
        {autoSubjectError ? <span style={errors}>{autoSubjectError}</span> : null}
      </div>
    );
  }

  if (tool === "rasterQuickSelection") {
    return (
      <div role="group" aria-label="Quick Selection options" style={row}>
        <label title="Quick Selection brush diameter" style={labels}>
          <span>Size</span>
          <input
            aria-label="Quick Selection size"
            type="range"
            min={1}
            max={512}
            step={1}
            value={quickSelectionSize}
            onChange={(event) => setQuickSelectionSize(Number(event.currentTarget.value))}
            style={ranges}
          />
          <output>{quickSelectionSize}</output>
        </label>
        <label title="Color similarity tolerance" style={labels}>
          <span>Tolerance</span>
          <input
            aria-label="Tolerance"
            type="range"
            min={0}
            max={255}
            step={1}
            value={magicWandTolerance}
            onChange={(event) => setMagicWandTolerance(Number(event.currentTarget.value))}
            style={ranges}
          />
          <output>{magicWandTolerance}</output>
        </label>
        <button
          type="button"
          title="Detect the main subject with OpenCV.js"
          onClick={() => void runAutoSubject()}
          disabled={autoSubjectBusy}
          style={buttons}
        >
          {autoSubjectBusy ? "Detecting…" : "Auto Subject"}
        </button>
        {autoSubjectError ? <span style={errors}>{autoSubjectError}</span> : null}
      </div>
    );
  }

  if (isRasterSelectionTool(tool)) {
    return (
      <div role="group" aria-label="Selection options" style={row}>
        <span style={labels}>New · Shift add · Alt subtract · Shift+Alt intersect</span>
        <label title="Soften the active selection edge" style={labels}>
          <span>Feather</span>
          <input
            aria-label="Feather radius"
            type="range"
            min={0}
            max={64}
            step={1}
            value={featherPx}
            onChange={(event) => setFeatherPx(Number(event.currentTarget.value))}
            style={ranges}
          />
          <output>{featherPx}px</output>
        </label>
        <button
          type="button"
          title="Apply feather to the active selection"
          disabled={!hasActiveSelection || featherPx <= 0}
          onClick={() => featherActiveRasterSelection(featherPx)}
          style={buttons}
        >
          Apply
        </button>
        <label title="Smooth vector selection edges when rasterizing" style={labels}>
          <input
            aria-label="Anti-alias"
            type="checkbox"
            checked={selectionAntiAlias}
            onChange={(event) => setSelectionAntiAlias(event.currentTarget.checked)}
          />
          <span>Anti-alias</span>
        </label>
      </div>
    );
  }

  if (!isRasterPaintTool(tool) && !isRasterRetouchTool(tool)) return null;

  return (
    <div role="group" aria-label="Raster brush options" style={row}>
      <label title="Brush size in image pixels" style={labels}>
        <span>Size</span>
        <input
          aria-label="Brush size"
          type="range"
          min={1}
          max={512}
          step={1}
          value={brushSize}
          onChange={(event) => setBrushSize(Number(event.currentTarget.value))}
          style={ranges}
        />
        <output>{brushSize}</output>
      </label>
      <label title="Stroke opacity" style={labels}>
        <span>Opacity</span>
        <input
          aria-label="Brush opacity"
          type="range"
          min={5}
          max={100}
          step={1}
          value={Math.round(brushOpacity * 100)}
          onChange={(event) => setBrushOpacity(Number(event.currentTarget.value) / 100)}
          style={ranges}
        />
        <output>{Math.round(brushOpacity * 100)}%</output>
      </label>
      <label title="Brush edge hardness" style={labels}>
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
          style={ranges}
        />
        <output>{tool === "rasterPencil" ? "100%" : `${Math.round(brushHardness * 100)}%`}</output>
      </label>
      <label title="Paint color" style={labels}>
        <span>Color</span>
        <input
          aria-label="Paint color"
          type="color"
          value={brushColor}
          disabled={tool === "rasterEraser" || isRasterRetouchTool(tool)}
          onChange={(event) => setBrushColor(event.currentTarget.value)}
          style={{
            width: 22,
            height: 22,
            padding: 1,
            border: studio
              ? `1px solid ${studioChrome.buttonBorder}`
              : "1px solid var(--stroke, #eae6e1)",
            borderRadius: 4,
            background: "transparent",
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
  border: "1px solid var(--stroke, #e4e1dc)",
  borderRadius: 5,
  background: "var(--surface-subtle, #fcf9f5)",
  color: "var(--ink, #443f39)",
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

const studioOptionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  width: "max-content",
  color: studioChrome.ink,
} as const;

const studioLabelStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  fontSize: 12,
  lineHeight: "16px",
  color: studioChrome.muted,
} as const;

const studioRangeStyle = {
  width: 96,
  height: 16,
  accentColor: studioChrome.selectedAccent,
} as const;

const studioAdvancedButtonStyle = {
  height: 26,
  padding: "0 10px",
  border: `1px solid ${studioChrome.buttonBorder}`,
  borderRadius: 4,
  background: studioChrome.chromeRaised,
  color: studioChrome.ink,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
  cursor: "pointer",
} as const;

const studioErrorStyle = {
  maxWidth: 220,
  color: "#f0b4b4",
  fontSize: 12,
  lineHeight: "16px",
} as const;
