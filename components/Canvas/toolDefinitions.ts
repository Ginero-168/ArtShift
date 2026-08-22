"use client";

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

export type ToolDef = {
  id: Tool;
  icon: (p: { size?: number }) => React.JSX.Element;
  label: string;
  hotkey: string;
};

/** Shapes live in the Builder library; they are activated from the UI only. */
export const SHAPE_TOOLS: ToolDef[] = [
  { id: "rect", icon: IconSquare, label: "Rectangle", hotkey: "" },
  { id: "diamond", icon: IconDiamond, label: "Diamond", hotkey: "" },
  { id: "triangle", icon: IconTriangle, label: "Triangle", hotkey: "" },
  { id: "star", icon: IconStar, label: "Star", hotkey: "" },
  { id: "hexagon", icon: IconHexagon, label: "Hexagon", hotkey: "" },
  { id: "heart", icon: IconHeart, label: "Heart", hotkey: "" },
  { id: "plus", icon: IconPlus, label: "Plus", hotkey: "" },
  { id: "ellipse", icon: IconCircle, label: "Ellipse", hotkey: "" },
];

export const TOOLBAR_TOOLS: ToolDef[] = [
  { id: "hand", icon: IconHand, label: "Hand (pan)", hotkey: "" },
  { id: "select", icon: IconCursor, label: "Selection", hotkey: "" },
  { id: "rasterMove", icon: IconHand, label: "Raster Move", hotkey: "V" },
  {
    id: "directSelect",
    icon: IconDirectSelect,
    label: "Direct Selection (Anchor Points)",
    hotkey: "",
  },
  { id: "arrow", icon: IconArrow, label: "Arrow", hotkey: "" },
  { id: "line", icon: IconLine, label: "Line", hotkey: "" },
  { id: "freedraw", icon: IconFreedraw, label: "Draw", hotkey: "" },
  { id: "pen", icon: IconPen, label: "Pen · click/drag to draw Bezier", hotkey: "" },
  { id: "text", icon: IconText, label: "Text", hotkey: "" },
  { id: "image", icon: IconImage, label: "Image", hotkey: "" },
  { id: "eraser", icon: IconEraser, label: "Eraser", hotkey: "" },
  { id: "rasterEraser", icon: IconEraser, label: "Raster Eraser", hotkey: "E" },
  { id: "rasterBrush", icon: IconBrush, label: "Raster Brush", hotkey: "B" },
  { id: "rasterPencil", icon: IconPencil, label: "Raster Pencil", hotkey: "⇧B" },
  { id: "rasterMarquee", icon: IconSquare, label: "Raster Rectangular Marquee", hotkey: "M" },
  { id: "rasterEllipse", icon: IconCircle, label: "Raster Elliptical Marquee", hotkey: "⇧M" },
  { id: "rasterLasso", icon: IconFreedraw, label: "Raster Lasso", hotkey: "L" },
  {
    id: "rasterPolygonLasso",
    icon: IconHexagon,
    label: "Raster Polygon Lasso",
    hotkey: "⇧L",
  },
  { id: "rasterMagicWand", icon: IconWand, label: "Raster Magic Wand", hotkey: "W" },
  {
    id: "rasterQuickSelection",
    icon: IconBrush,
    label: "Raster Quick Selection",
    hotkey: "",
  },
];
