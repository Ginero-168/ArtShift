import type { EngineElement, EngineElementType } from "@/lib/engine/types";

export type AppearanceCapability = {
  fills: boolean;
  strokes: boolean;
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

export function appearanceCapabilities(element: EngineElement): AppearanceCapability {
  const type = element.type;
  if (type === "image" || type === "bookMockup") {
    return {
      fills: false,
      strokes: false,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: type === "image",
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
    };
  }
  if (type === "text") {
    return {
      fills: true,
      strokes: true,
      shadow: true,
      glow: true,
      textArc: true,
      imageAdjust: false,
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
    };
  }
  if (type === "frame") {
    return {
      fills: true,
      strokes: true,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
    };
  }
  if (type === "path" || type === "freedraw" || type === "line" || type === "arrow") {
    return {
      fills: type === "path" || type === "freedraw",
      strokes: true,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: false,
      multipleStrokes: false,
      blendMode: true,
      rootOpacity: true,
    };
  }
  if (SHAPE_LIKE.has(type)) {
    return {
      fills: true,
      strokes: true,
      shadow: true,
      glow: true,
      textArc: false,
      imageAdjust: false,
      multipleFills: true,
      multipleStrokes: true,
      blendMode: true,
      rootOpacity: true,
    };
  }
  return {
    fills: true,
    strokes: true,
    shadow: true,
    glow: true,
    textArc: false,
    imageAdjust: false,
    multipleFills: false,
    multipleStrokes: false,
    blendMode: true,
    rootOpacity: true,
  };
}
