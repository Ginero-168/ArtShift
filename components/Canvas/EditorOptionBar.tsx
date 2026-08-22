"use client";

import {
  IconBrush,
  IconCircle,
  IconCursor,
  IconDirectSelect,
  IconEraser,
  IconFreedraw,
  IconHand,
  IconHexagon,
  IconPen,
  IconPencil,
  IconSquare,
  IconText,
  IconWand,
} from "@/components/icons";
import { type EditorMode, type Tool, useEngine } from "@/lib/engine/store";
import RasterToolOptions from "./RasterToolOptions";

type ToolButton = {
  id: Tool;
  label: string;
  title: string;
  icon: (props: { size?: number }) => React.JSX.Element;
};

const RASTER_TOOLS: ToolButton[] = [
  { id: "rasterMove", label: "Move", title: "Select and move objects (V)", icon: IconHand },
  {
    id: "rasterBrush",
    label: "Brush",
    title: "Paint with a soft brush (B, [ / ])",
    icon: IconBrush,
  },
  {
    id: "rasterPencil",
    label: "Pencil",
    title: "Paint with a hard pencil (Shift+B, [ / ])",
    icon: IconPencil,
  },
  { id: "rasterMarquee", label: "Rect", title: "Rectangular Marquee (M)", icon: IconSquare },
  {
    id: "rasterEllipse",
    label: "Ellipse",
    title: "Elliptical Marquee (Shift+M)",
    icon: IconCircle,
  },
  { id: "rasterLasso", label: "Lasso", title: "Freehand Lasso (L)", icon: IconFreedraw },
  {
    id: "rasterPolygonLasso",
    label: "Poly",
    title: "Polygon Lasso (Shift+L)",
    icon: IconHexagon,
  },
  {
    id: "rasterMagicWand",
    label: "Magic Wand",
    title: "Select contiguous similar colors (W)",
    icon: IconWand,
  },
  {
    id: "rasterQuickSelection",
    label: "Quick Select",
    title: "Brush-select similar pixels ([ / ])",
    icon: IconBrush,
  },
  {
    id: "rasterEraser",
    label: "Eraser",
    title: "Raster Eraser (E, [ / ])",
    icon: IconEraser,
  },
];

const VECTOR_TOOLS: ToolButton[] = [
  { id: "select", label: "Select", title: "Select and move objects", icon: IconCursor },
  {
    id: "directSelect",
    label: "Direct",
    title: "Edit vector anchor points",
    icon: IconDirectSelect,
  },
  { id: "pen", label: "Pen", title: "Draw Bezier paths", icon: IconPen },
  { id: "freedraw", label: "Draw", title: "Draw a freehand vector path", icon: IconFreedraw },
  { id: "text", label: "Text", title: "Create text", icon: IconText },
];

const COMMON_TOOLS: ToolButton[] = [
  { id: "hand", label: "Pan", title: "Pan the canvas", icon: IconHand },
];

const MODE_OPTIONS: Array<{ id: EditorMode; label: string; title: string }> = [
  { id: "raster", label: "Raster", title: "Raster image editing tools" },
  { id: "vector", label: "Vector", title: "Vector object editing tools" },
];

const TOOLS_WITH_OPTIONS = new Set<Tool>([
  "rasterBrush",
  "rasterPencil",
  "rasterEraser",
  "rasterMagicWand",
  "rasterQuickSelection",
]);

const modeButtonStyle = (active: boolean, mode: EditorMode) => ({
  height: 28,
  padding: "0 8px",
  border: "none",
  borderRadius: 6,
  background: active
    ? mode === "raster"
      ? "rgba(22, 163, 74, 0.13)"
      : "rgba(79, 70, 229, 0.13)"
    : "transparent",
  color: active
    ? mode === "raster"
      ? "#15803d"
      : "var(--accent, #4f46e5)"
    : "var(--ink-muted, #6b7280)",
  fontSize: 11,
  fontWeight: active ? 700 : 600,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
});

const toolButtonStyle = (active: boolean) => ({
  height: 42,
  minWidth: 52,
  padding: "3px 4px 2px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column" as const,
  gap: 1,
  border: "none",
  borderRadius: 6,
  background: active ? "var(--accent, #6366f1)" : "transparent",
  color: active ? "#fff" : "var(--ink, #111827)",
  cursor: "pointer",
  fontSize: 8,
  lineHeight: "10px",
  fontWeight: active ? 700 : 600,
  whiteSpace: "nowrap" as const,
  textAlign: "center" as const,
});

export default function EditorOptionBar() {
  const editorMode = useEngine((state) => state.editorMode);
  const setEditorMode = useEngine((state) => state.setEditorMode);
  const tool = useEngine((state) => state.tool);
  const setTool = useEngine((state) => state.setTool);
  const tools = [...COMMON_TOOLS, ...(editorMode === "raster" ? RASTER_TOOLS : VECTOR_TOOLS)];

  return (
    <div
      className="editor-option-bar"
      role="toolbar"
      aria-label={`${editorMode} editing tools`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        minWidth: 0,
        maxWidth: "100%",
        padding: 3,
        border: "1px solid var(--stroke, #e5e7eb)",
        borderRadius: 8,
        background: "var(--surface-solid, #fff)",
        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.08)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      <div
        role="group"
        aria-label="Editing mode"
        style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
      >
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            title={option.title}
            aria-pressed={editorMode === option.id}
            onClick={() => setEditorMode(option.id)}
            style={modeButtonStyle(editorMode === option.id, option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <span
        aria-hidden="true"
        style={{ width: 1, height: 20, margin: "0 3px", background: "var(--stroke, #e5e7eb)" }}
      />

      <div
        role="group"
        aria-label={`${editorMode} tools`}
        style={{ display: "flex", alignItems: "center", gap: 1, flexShrink: 0 }}
      >
        {tools.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              type="button"
              title={option.title}
              aria-label={option.title}
              aria-pressed={tool === option.id}
              onClick={() => setTool(option.id)}
              style={toolButtonStyle(tool === option.id)}
            >
              <Icon size={15} />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      {editorMode === "raster" && TOOLS_WITH_OPTIONS.has(tool) ? (
        <>
          <span
            aria-hidden="true"
            style={{
              width: 1,
              height: 28,
              margin: "0 4px",
              background: "var(--stroke, #e5e7eb)",
            }}
          />
          <RasterToolOptions tool={tool} />
        </>
      ) : null}
    </div>
  );
}
