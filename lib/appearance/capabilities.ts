import type { EngineElement, EngineElementType } from "@/lib/engine/types";

export type AppearanceCapability = {
  fills: boolean;
  strokes: boolean;
  /** Behind-text backdrop. Text only — not a shape fill. */
  background: boolean;
  shadow: boolean;
  glow: boolean;
  /** Text Arc is `pathCurvature` on TextElement — not a persisted Appearance item. */
  textArc: boolean;
  /** Image tone sliders write `adjustments` / `filterBlur` — not Appearance items. */
  imageAdjust: boolean;
  multipleFills: boolean;
  multipleStrokes: boolean;
  blendMode: boolean;
  rootOpacity: boolean;
  /** Optional static gaussian blur on the object (not animated). */
  staticBlur: boolean;
  /** Per-item mix-blend (offset duplicate layers). */
  itemBlend: boolean;
  /** Offset duplicate Fill/Stroke layers (anaglyph / glitch stills). */
  offsetLayers: boolean;
  /** Named 3D block / depth. Text first; path and shapes reuse the same compositor. */
  extrude: boolean;
  /** Named emboss / deboss / bevel. */
  emboss: boolean;
};

const SHAPE_LIKE = new Set<EngineElementType>([
  "rect",
  "ellipse",
  "diamond",
  "triangle",
  "star",
  "hexagon",
  "heart",
  "plus",
]);

const STACK_FX = {
  staticBlur: true,
  itemBlend: true,
  offsetLayers: true,
  extrude: true,
  emboss: true,
} as const;

export function appearanceCapabilities(element: EngineElement): AppearanceCapability {
  const type = element.type;
  if (type === "image" || type === "bookMockup") {
    return {
      fills: false,
      strokes: false,
      background: false,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: type === "image",
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
      staticBlur: true,
      itemBlend: false,
      offsetLayers: false,
      extrude: false,
      emboss: false,
    };
  }
  if (type === "text") {
    return {
      fills: true,
      strokes: true,
      background: true,
      shadow: true,
      glow: true,
      textArc: true,
      imageAdjust: false,
      multipleFills: true,
      multipleStrokes: true,
      blendMode: true,
      rootOpacity: true,
      ...STACK_FX,
    };
  }
  if (type === "frame") {
    return {
      fills: true,
      strokes: true,
      background: false,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
      staticBlur: true,
      itemBlend: false,
      offsetLayers: false,
      extrude: false,
      emboss: false,
    };
  }
  if (type === "path" || type === "freedraw" || type === "line" || type === "arrow") {
    const canFill = type === "path" || type === "freedraw";
    return {
      fills: canFill,
      strokes: true,
      background: false,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: canFill,
      multipleStrokes: true,
      blendMode: true,
      rootOpacity: true,
      ...STACK_FX,
    };
  }
  if (SHAPE_LIKE.has(type)) {
    return {
      fills: true,
      strokes: true,
      background: false,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: true,
      multipleStrokes: true,
      blendMode: true,
      rootOpacity: true,
      ...STACK_FX,
    };
  }
  return {
    fills: true,
    strokes: true,
    background: false,
    shadow: true,
    glow: true,
    textArc: false,
    imageAdjust: false,
    multipleFills: false,
    multipleStrokes: false,
    blendMode: true,
    rootOpacity: true,
    staticBlur: true,
    itemBlend: false,
    offsetLayers: false,
    extrude: false,
    emboss: false,
  };
}
