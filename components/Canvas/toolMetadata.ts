import type { Tool } from "@/lib/engine/store";

export type RasterToolHotkey = {
  id: Tool;
  key: string;
  shiftKey?: boolean;
};

/** Keyboard metadata is intentionally icon-free so shortcut tests stay cheap. */
export const RASTER_TOOL_HOTKEYS: RasterToolHotkey[] = [
  { id: "rasterMove", key: "v" },
  { id: "rasterBrush", key: "b" },
  { id: "rasterPencil", key: "b", shiftKey: true },
  { id: "rasterMarquee", key: "m" },
  { id: "rasterEllipse", key: "m", shiftKey: true },
  { id: "rasterLasso", key: "l" },
  { id: "rasterPolygonLasso", key: "l", shiftKey: true },
  { id: "rasterMagicWand", key: "w" },
  { id: "rasterEraser", key: "e" },
];
