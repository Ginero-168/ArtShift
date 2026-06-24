/**
 * Engine element types for the Excalidraw-style canvas rewrite.
 *
 * Naming intentionally tracks Excalidraw's data model so the developer mental
 * model maps 1:1 (rect = "rectangle", diamond, ellipse, line, arrow,
 * freedraw, text, image). The rest of the app continues to call them
 * "objects" externally; this file is the canonical engine vocabulary.
 *
 * Coordinates are pixels in slide-local space (0..SLIDE_W × 0..SLIDE_H).
 * Slide size is fixed at 1920×1080 — see `SLIDE_W` / `SLIDE_H`.
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

// ——— Common shape attributes ———————————————————————————————————————

export type StrokeStyle = "solid" | "dashed" | "dotted";
export type FillStyle = "hachure" | "cross-hatch" | "solid" | "zigzag" | "none";
export type EdgeStyle = "sharp" | "round";
export type Roughness = 0 | 1 | 2; // 0 = architect, 1 = artist, 2 = cartoonist
export type ArrowHead =
  | "none"
  | "arrow"
  | "triangle"
  | "triangle_outline"
  | "dot"
  | "bar"
  | "diamond"
  | "circle";

export type ElementId = string;
export type GroupId = string;

// Every element shares this geometry+style envelope.
export type BaseElement = {
  id: ElementId;
  /** Top-left of axis-aligned bbox in slide-local px. */
  x: number;
  y: number;
  /** Axis-aligned bbox dimensions before rotation. */
  width: number;
  height: number;
  /** Rotation in radians around bbox center. */
  angle: number;
  /** 0..1 */
  opacity: number;
  /** CSS color or "transparent". */
  strokeColor: string;
  /** CSS color or "transparent". */
  backgroundColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  fillStyle: FillStyle;
  edgeStyle: EdgeStyle;
  roughness: Roughness;
  /** Stable seed so re-renders produce the same rough strokes. */
  seed: number;
  /** Group memberships (innermost first). */
  groupIds: GroupId[];
  /** Locked elements ignore selection/transform. */
  locked: boolean;
  /** Monotonic counter; higher renders on top. */
  z: number;
  /** Schema-version bump-friendly. */
  version: number;
  /** Soft-deleted; reaped on save. */
  isDeleted: boolean;
  /** Fill type: solid (default), linear gradient, or radial gradient. */
  fillType?: "solid" | "linear" | "radial";
  /** Gradient colors (start / end). Only used when fillType is linear or radial. */
  gradientColors?: [string, string];
  /** Pattern fill: dots, stripes, or grid. Overrides solid/gradient when set. */
  fillPattern?: "dots" | "stripes" | "grid";
  /** Shadow effect. */
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
};

// ——— Concrete element variants ————————————————————————————————————

export type RectElement = BaseElement & {
  type: "rect";
  /** 0 when edgeStyle="sharp"; >0 when "round". */
  cornerRadius: number;
};

export type DiamondElement = BaseElement & {
  type: "diamond";
};

export type TriangleElement = BaseElement & {
  type: "triangle";
};

export type StarElement = BaseElement & {
  type: "star";
  /** Number of points on the star (default 5). */
  numPoints: number;
};

export type HexagonElement = BaseElement & {
  type: "hexagon";
};

export type HeartElement = BaseElement & {
  type: "heart";
};

export type PlusElement = BaseElement & {
  type: "plus";
  /** Thickness of the cross arms as fraction of min(width,height). Default 0.3. */
  crossThickness: number;
};

export type EllipseElement = BaseElement & {
  type: "ellipse";
};

export type LineElement = BaseElement & {
  type: "line";
  /** Polyline points in element-local coords (origin = element x,y). */
  points: Array<[number, number]>;
};

export type ArrowElement = BaseElement & {
  type: "arrow";
  points: Array<[number, number]>;
  startArrowhead: ArrowHead;
  endArrowhead: ArrowHead;
  /** Multiplier for arrowhead size (default 1). */
  arrowheadScale: number;
  /** Optional binding: arrow endpoint follows shape on move. */
  startBinding: { elementId: ElementId; gap: number; focus: number } | null;
  endBinding: { elementId: ElementId; gap: number; focus: number } | null;
};

export type FreedrawElement = BaseElement & {
  type: "freedraw";
  /** Sampled stylus/mouse points with pressure (0..1). */
  points: Array<[number, number, number]>;
  /** Cached simplified stroke outline polygon for hit-test + render. */
  pressures?: number[];
};

export type TextElement = BaseElement & {
  type: "text";
  text: string;
  fontSize: number;
  /** CSS font-family value. */
  fontFamily: string;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  textAlign: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  lineHeight: number;
  /** When non-null this text is rendered inside the bound container. */
  containerId: ElementId | null;
  /** Cached for measurement; never trust on save. */
  baseline?: number;
};

export type ImageElement = BaseElement & {
  type: "image";
  /** Stable id of the binary in the image cache (data URL or remote). */
  fileId: string;
  /** Cropping in element-local px (0..width, 0..height). null = full image. */
  crop: { x: number; y: number; width: number; height: number } | null;
  /** Original natural size; used for crop math. */
  naturalWidth: number;
  naturalHeight: number;
  status: "pending" | "loaded" | "error";
  /** Color adjustments applied to this image (Lumen feature). */
  adjustments?: Partial<import("../color/adjustments").ColorAdjustments>;
};

export type FrameElement = BaseElement & {
  type: "frame";
  name: string;
  /** Children rendered clipped to frame bbox. */
  childIds: ElementId[];
};

export type EngineElement =
  | RectElement
  | DiamondElement
  | TriangleElement
  | StarElement
  | HexagonElement
  | HeartElement
  | PlusElement
  | EllipseElement
  | LineElement
  | ArrowElement
  | FreedrawElement
  | TextElement
  | ImageElement
  | FrameElement;

export type EngineElementType = EngineElement["type"];

// ——— Document container ———————————————————————————————————————————

export type EngineSlide = {
  id: string;
  name: string;
  background: string;
  elements: EngineElement[];
  /** Per-slide dimensions (default = SLIDE_W × SLIDE_H). */
  width: number;
  height: number;
};

export type EngineDoc = {
  id: string;
  title: string;
  width: number; // = SLIDE_W
  height: number; // = SLIDE_H
  slides: EngineSlide[];
  snapGrid: number | null;
  updatedAt: number;
  schemaVersion: number;
};

export const ENGINE_SCHEMA_VERSION = 1;
