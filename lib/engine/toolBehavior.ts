import type { Tool } from "./store";

/** Cursor and gesture classification shared by the canvas and tool chrome. */
export function toolToCursor(tool: Tool): string {
  switch (tool) {
    case "hand":
    case "rasterMove":
      return "grab";
    case "text":
      return "text";
    case "eraser":
      return "cell";
    case "rasterEraser":
    case "rasterPencil":
    case "rasterBrush":
      return "none";
    case "rasterMarquee":
    case "rasterEllipse":
    case "rasterLasso":
    case "rasterPolygonLasso":
      return "cell";
    case "rasterMagicWand":
    case "rasterQuickSelection":
      return "none";
    case "rect":
    case "ellipse":
    case "diamond":
    case "triangle":
    case "star":
    case "hexagon":
    case "heart":
    case "plus":
    case "line":
    case "arrow":
    case "freedraw":
    case "pen":
    case "frame":
      return "crosshair";
    case "directSelect":
      return "default";
    default:
      return "default";
  }
}

export function isRasterSelectionTool(tool: Tool): boolean {
  return (
    tool === "rasterMarquee" ||
    tool === "rasterEllipse" ||
    tool === "rasterLasso" ||
    tool === "rasterPolygonLasso"
  );
}

export function isRasterPaintTool(tool: Tool): boolean {
  return tool === "rasterEraser" || tool === "rasterPencil" || tool === "rasterBrush";
}

export function isRasterBrushCursorTool(tool: Tool): boolean {
  return isRasterPaintTool(tool) || tool === "rasterQuickSelection";
}

export function pointerPressure(sample: { pointerType: string; pressure: number }): number {
  if (sample.pointerType === "mouse" || sample.pressure <= 0) return 1;
  return Math.max(0.05, Math.min(1, sample.pressure));
}
