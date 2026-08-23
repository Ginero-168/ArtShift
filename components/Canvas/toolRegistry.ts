import {
  IconArrow,
  IconBrush,
  IconCircle,
  IconCursor,
  IconDiamond,
  IconDirectSelect,
  IconEraser,
  IconFreedraw,
  IconHand,
  IconHeart,
  IconHexagon,
  IconImage,
  IconLine,
  IconPen,
  IconPencil,
  IconPlus,
  IconSquare,
  IconStar,
  IconText,
  IconTriangle,
  IconWand,
} from "@/components/icons";
import type { Tool } from "@/lib/engine/store";
import { RASTER_TOOL_HOTKEYS } from "./toolMetadata";

export type ToolIcon = (props: { size?: number }) => React.JSX.Element;

export type ToolDefinition = {
  id: Tool;
  icon: ToolIcon;
  label: string;
  title: string;
  hotkey?: string;
  shiftKey?: boolean;
};

function shortcutFor(id: Tool): Pick<ToolDefinition, "hotkey" | "shiftKey"> {
  const shortcut = RASTER_TOOL_HOTKEYS.find((entry) => entry.id === id);
  return shortcut ? { hotkey: shortcut.key, shiftKey: shortcut.shiftKey } : {};
}

export const COMMON_TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "hand", icon: IconHand, label: "Pan", title: "Pan the Artwork" },
];

export const VECTOR_TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "select", icon: IconCursor, label: "Select", title: "Select and move objects" },
  {
    id: "directSelect",
    icon: IconDirectSelect,
    label: "Direct",
    title: "Edit vector anchor points",
  },
  { id: "pen", icon: IconPen, label: "Pen", title: "Draw Bezier paths" },
  { id: "freedraw", icon: IconFreedraw, label: "Draw", title: "Draw a freehand vector path" },
  { id: "text", icon: IconText, label: "Text", title: "Create text" },
];

export const RASTER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    id: "rasterMove",
    icon: IconHand,
    label: "Move",
    title: "Select and move objects (V)",
    ...shortcutFor("rasterMove"),
  },
  {
    id: "rasterBrush",
    icon: IconBrush,
    label: "Brush",
    title: "Paint with a soft brush (B, [ / ])",
    ...shortcutFor("rasterBrush"),
  },
  {
    id: "rasterPencil",
    icon: IconPencil,
    label: "Pencil",
    title: "Paint with a hard pencil (Shift+B, [ / ])",
    ...shortcutFor("rasterPencil"),
  },
  {
    id: "rasterMarquee",
    icon: IconSquare,
    label: "Rect",
    title: "Rectangular Marquee (M)",
    ...shortcutFor("rasterMarquee"),
  },
  {
    id: "rasterEllipse",
    icon: IconCircle,
    label: "Ellipse",
    title: "Elliptical Marquee (Shift+M)",
    ...shortcutFor("rasterEllipse"),
  },
  {
    id: "rasterLasso",
    icon: IconFreedraw,
    label: "Lasso",
    title: "Freehand Lasso (L)",
    ...shortcutFor("rasterLasso"),
  },
  {
    id: "rasterPolygonLasso",
    icon: IconHexagon,
    label: "Poly",
    title: "Polygon Lasso (Shift+L)",
    ...shortcutFor("rasterPolygonLasso"),
  },
  {
    id: "rasterMagicWand",
    icon: IconWand,
    label: "Magic Wand",
    title: "Select contiguous similar colors (W)",
    ...shortcutFor("rasterMagicWand"),
  },
  {
    id: "rasterQuickSelection",
    icon: IconBrush,
    label: "Quick Select",
    title: "Brush-select similar pixels ([ / ])",
  },
  {
    id: "rasterEraser",
    icon: IconEraser,
    label: "Eraser",
    title: "Raster Eraser (E, [ / ])",
    ...shortcutFor("rasterEraser"),
  },
];

export const SHAPE_TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "rect", icon: IconSquare, label: "Rectangle", title: "Create a rectangle" },
  { id: "diamond", icon: IconDiamond, label: "Diamond", title: "Create a diamond" },
  { id: "triangle", icon: IconTriangle, label: "Triangle", title: "Create a triangle" },
  { id: "star", icon: IconStar, label: "Star", title: "Create a star" },
  { id: "hexagon", icon: IconHexagon, label: "Hexagon", title: "Create a hexagon" },
  { id: "heart", icon: IconHeart, label: "Heart", title: "Create a heart" },
  { id: "plus", icon: IconPlus, label: "Plus", title: "Create a plus shape" },
  { id: "ellipse", icon: IconCircle, label: "Ellipse", title: "Create an ellipse" },
];

export const TOOLBAR_TOOLS: ToolDefinition[] = [
  ...COMMON_TOOL_DEFINITIONS,
  ...VECTOR_TOOL_DEFINITIONS,
  { id: "arrow", icon: IconArrow, label: "Arrow", title: "Create an arrow" },
  { id: "line", icon: IconLine, label: "Line", title: "Create a line" },
  { id: "image", icon: IconImage, label: "Image", title: "Add an image" },
  { id: "eraser", icon: IconEraser, label: "Eraser", title: "Erase an object" },
  ...RASTER_TOOL_DEFINITIONS,
];

export const TOOLS_WITH_OPTIONS = new Set<Tool>([
  "rasterBrush",
  "rasterPencil",
  "rasterEraser",
  "rasterMagicWand",
  "rasterQuickSelection",
]);
