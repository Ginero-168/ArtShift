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
  IconHexagon,
  IconPencil,
  IconSilhouette,
  IconSquare,
  IconWand,
} from "@/components/icons";
import type { StudioRasterTool } from "@/lib/raster/studio/sessionStore";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { studioChrome } from "./studioChrome";

type ToolIcon = (props: { size?: number }) => ReturnType<typeof IconBrush>;

const TOOL_GROUPS: Array<
  Array<{
    id: StudioRasterTool;
    title: string;
    icon: ToolIcon;
  }>
> = [
  [{ id: "hand", title: "View tool — pan (H) · hold Space", icon: IconHand }],
  [
    { id: "rasterBrush", title: "Paint brush (B)", icon: IconBrush },
    { id: "rasterPencil", title: "Pixel pencil (Shift+B)", icon: IconPencil },
    { id: "rasterEraser", title: "Erase pixels (E)", icon: IconEraser },
  ],
  [
    { id: "rasterMarquee", title: "Rectangular marquee (M)", icon: IconSquare },
    { id: "rasterEllipse", title: "Elliptical marquee (Shift+M)", icon: IconCircle },
    { id: "rasterLasso", title: "Freehand lasso (L)", icon: IconFreedraw },
    {
      id: "rasterPolygonLasso",
      title: "Polygonal lasso — click points, Enter to close (Shift+L)",
      icon: IconHexagon,
    },
  ],
  [
    { id: "rasterMagicWand", title: "Flood select similar colors (W)", icon: IconWand },
    { id: "rasterQuickSelection", title: "Quick Select brush (Q)", icon: IconSilhouette },
  ],
  [
    { id: "rasterHealing", title: "Inpainting brush (J)", icon: IconHealing },
    { id: "rasterClone", title: "Clone stamp — Alt-click source (S)", icon: IconClone },
  ],
];

export default function RasterStudioToolbar() {
  const studioTool = useRasterStudioSession((s) => s.studioTool);
  const setStudioTool = useRasterStudioSession((s) => s.setStudioTool);

  return (
    <div
      role="toolbar"
      aria-label="Raster Studio tools"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        width: 44,
        padding: "8px 4px",
        flexShrink: 0,
        overflowY: "auto",
        scrollbarWidth: "thin",
      }}
    >
      {TOOL_GROUPS.map((group, groupIndex) => (
        <div
          key={group.map((tool) => tool.id).join("-")}
          role="group"
          aria-label={groupAriaLabel(groupIndex)}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 1,
            width: "100%",
            paddingBottom: groupIndex < TOOL_GROUPS.length - 1 ? 6 : 0,
            borderBottom:
              groupIndex < TOOL_GROUPS.length - 1 ? `1px solid ${studioChrome.hairline}` : "none",
          }}
        >
          {group.map((tool) => {
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
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function groupAriaLabel(index: number): string {
  switch (index) {
    case 0:
      return "View tools";
    case 1:
      return "Paint tools";
    case 2:
      return "Selection tools";
    case 3:
      return "Sample selection tools";
    default:
      return "Retouch tools";
  }
}

const toolButtonStyle = (active: boolean): CSSProperties => ({
  width: 34,
  height: 34,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 4,
  background: active ? studioChrome.selected : "transparent",
  boxShadow: active ? `inset 2px 0 0 ${studioChrome.selectedAccent}` : "none",
  color: active ? studioChrome.ink : studioChrome.muted,
  cursor: "pointer",
  flexShrink: 0,
});
