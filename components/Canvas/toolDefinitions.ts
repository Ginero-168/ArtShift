"use client";

import {
  IconArrow,
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
  IconPlus,
  IconSquare,
  IconStar,
  IconText,
  IconTriangle,
} from "@/components/icons";
import type { Tool } from "@/lib/engine/store";

export type ToolDef = {
  id: Tool;
  icon: (p: { size?: number }) => React.JSX.Element;
  label: string;
  hotkey: string;
};

/** Shapes live in the Builder library; hotkeys still activate draw mode. */
export const SHAPE_TOOLS: ToolDef[] = [
  { id: "rect", icon: IconSquare, label: "Rectangle", hotkey: "R" },
  { id: "diamond", icon: IconDiamond, label: "Diamond", hotkey: "D" },
  { id: "triangle", icon: IconTriangle, label: "Triangle", hotkey: "G" },
  { id: "star", icon: IconStar, label: "Star", hotkey: "S" },
  { id: "hexagon", icon: IconHexagon, label: "Hexagon", hotkey: "X" },
  { id: "heart", icon: IconHeart, label: "Heart", hotkey: "Y" },
  { id: "plus", icon: IconPlus, label: "Plus", hotkey: "⇧P" },
  { id: "ellipse", icon: IconCircle, label: "Ellipse", hotkey: "O" },
];

export const TOOLBAR_TOOLS: ToolDef[] = [
  { id: "hand", icon: IconHand, label: "Hand (pan)", hotkey: "H" },
  { id: "select", icon: IconCursor, label: "Selection", hotkey: "V" },
  {
    id: "directSelect",
    icon: IconDirectSelect,
    label: "Direct Selection (Anchor Points)",
    hotkey: "A",
  },
  { id: "arrow", icon: IconArrow, label: "Arrow", hotkey: "⇧A" },
  { id: "line", icon: IconLine, label: "Line", hotkey: "L" },
  { id: "freedraw", icon: IconFreedraw, label: "Draw", hotkey: "N" },
  { id: "pen", icon: IconPen, label: "Pen (P) · click/drag to draw Bezier", hotkey: "P" },
  { id: "text", icon: IconText, label: "Text", hotkey: "T" },
  { id: "image", icon: IconImage, label: "Image", hotkey: "I" },
  { id: "eraser", icon: IconEraser, label: "Eraser", hotkey: "E" },
];

export const ALL_TOOLS: { id: Tool; hotkey: string }[] = [
  ...TOOLBAR_TOOLS.map((t) => ({ id: t.id, hotkey: t.hotkey })),
  ...SHAPE_TOOLS.map((t) => ({ id: t.id, hotkey: t.hotkey })),
  { id: "frame", hotkey: "F" },
];
