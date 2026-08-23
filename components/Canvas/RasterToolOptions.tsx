"use client";

import type { Tool } from "@/lib/engine/store";
import { useEngine } from "@/lib/engine/store";
import { isRasterPaintTool } from "@/lib/engine/toolBehavior";

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
      </div>
    );
  }

  if (!isRasterPaintTool(tool)) return null;

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
          disabled={tool === "rasterEraser"}
          onChange={(event) => setBrushColor(event.currentTarget.value)}
          style={{
            width: 24,
            height: 22,
            padding: 1,
            border: "1px solid var(--stroke, #e5e7eb)",
            borderRadius: 4,
            cursor: tool === "rasterEraser" ? "not-allowed" : "pointer",
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
