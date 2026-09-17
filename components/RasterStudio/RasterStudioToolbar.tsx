"use client";

import type { CSSProperties } from "react";
import {
  IconBrush,
  IconCircle,
  IconClone,
  IconEraser,
  IconFreedraw,
  IconHand,
  IconHealing,
  IconPencil,
  IconSquare,
  IconWand,
} from "@/components/icons";
import type { StudioRasterTool } from "@/lib/raster/studio/sessionStore";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";

const TOOLS: Array<{
  id: StudioRasterTool;
  label: string;
  title: string;
  icon: (props: { size?: number }) => React.JSX.Element;
}> = [
  { id: "hand", label: "Pan", title: "Pan the canvas", icon: IconHand },
  { id: "rasterBrush", label: "Brush", title: "Soft brush (B)", icon: IconBrush },
  { id: "rasterPencil", label: "Pencil", title: "Hard pencil (Shift+B)", icon: IconPencil },
  { id: "rasterEraser", label: "Eraser", title: "Erase pixels (E)", icon: IconEraser },
  { id: "rasterMarquee", label: "Rect", title: "Rectangular selection (M)", icon: IconSquare },
  { id: "rasterEllipse", label: "Ellipse", title: "Elliptical selection", icon: IconCircle },
  { id: "rasterLasso", label: "Lasso", title: "Freehand lasso (L)", icon: IconFreedraw },
  { id: "rasterMagicWand", label: "Wand", title: "Magic Wand (W)", icon: IconWand },
  { id: "rasterHealing", label: "Heal", title: "Healing brush (J)", icon: IconHealing },
  { id: "rasterClone", label: "Clone", title: "Clone stamp · Alt-click source (S)", icon: IconClone },
];

export default function RasterStudioToolbar() {
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const setStudioTool = useRasterStudioSession((s) => s.setStudioTool);

  return (
    <div
      role="toolbar"
      aria-label="Raster Studio tools"
      style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const active = studioTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            aria-pressed={active}
            onClick={() => setStudioTool(tool.id)}
            style={toolButtonStyle(active)}
          >
            <Icon size={14} />
            <span>{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const toolButtonStyle = (active: boolean): CSSProperties => ({
  height: 40,
  minWidth: 48,
  padding: "2px 4px",
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 1,
  border: "none",
  borderRadius: 6,
  background: active ? "#38bdf8" : "transparent",
  color: active ? "#0f172a" : "inherit",
  cursor: "pointer",
  fontSize: 9,
  fontWeight: active ? 700 : 600,
  opacity: active ? 1 : 0.85,
});
