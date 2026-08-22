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
export type LayerId = string;

export type LayerMode = "block" | "free";
export type WorkspaceStrictness = number;

/**
 * Grid placement used by the visual builder. Geometry remains cached on the
 * element for the canvas renderer, while this normalized placement is the
 * source of truth when blocks reflow or the artwork is resized.
 */
export type BlockPlacement = {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  minColSpan?: number;
  minRowSpan?: number;
  /** Stable library key used to describe the block in the builder UI. */
  kind?: string;
};

/** @deprecated Legacy name retained only while schema-v1 documents migrate. */
export type BentoBlock = BlockPlacement;

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
  /** @deprecated Visibility is owned by EngineLayer in schema v2. */
  visible?: boolean;
  /** Stable builder identity, independent from Layer placement mode. */
  builderKind?: string;
  /** Fill type: solid (default), linear gradient, or radial gradient. */
  fillType?: "solid" | "linear" | "radial";
  /** Gradient colors array (2 or more colors). Only used when fillType is linear or radial. */
  gradientColors?: string[];
  /** Gradient direction angle in degrees (0-360). Default 90. */
  gradientAngle?: number;
  /** Gradient stop positions (0..1) matching gradientColors. Defaults to evenly spaced [0, ..., 1]. */
  gradientStops?: number[];
  /** Pattern fill: dots, stripes, or grid. Overrides solid/gradient when set. */
  fillPattern?: "dots" | "stripes" | "grid";
  /** Shadow effect. */
  shadow?: {
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
  };
  /** Outer glow effect. */
  glow?: {
    color: string;
    blur: number;
  };
  /** Non-destructive compositing mode used when drawing this Object. */
  blendMode?: "source-over" | "multiply" | "screen" | "overlay" | "darken" | "lighten";
  /** Layout mode for this individual object: "block" (Hex grid flow) or "free" (freeform floating). */
  layoutMode?: LayerMode;
  /** Human-readable label for this object layer. */
  name?: string;
  /** When true, this object is hidden from canvas rendering. */
  hidden?: boolean;
  /** Block placement when in "block" mode. */
  bento?: BentoBlock;
};

// ——— Concrete element variants ————————————————————————————————————

export type RectElement = BaseElement & {
  type: "rect";
  /** 0 = sharp corners; >0 = rounded corners. */
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

export type VectorPathNode = {
  /** Normalized anchor coordinates inside the element bounds (0..1). */
  x: number;
  y: number;
  /** Optional normalized Bézier handle offsets from the anchor. */
  in?: [number, number];
  out?: [number, number];
};

export type VectorPathElement = BaseElement & {
  type: "path";
  nodes: VectorPathNode[];
  closed: boolean;
  fillRule: "nonzero" | "evenodd";
  startArrowhead?: ArrowHead;
  endArrowhead?: ArrowHead;
  arrowheadScale?: number;
};

export type TextElement = BaseElement & {
  type: "text";
  text: string;
  /** Optional semantic style chosen from the Builder's unified Text presets. */
  textPreset?:
    | "title"
    | "subtitle"
    | "body"
    | "quote"
    | "author"
    | "details"
    | "price"
    | "sale"
    | "index";
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
  /** Optional inset/background used by button, badge and card blocks. */
  padding?: number;
  cornerRadius?: number;
  /** Optional curvature for Text on Path / Curved Text (-100..100). */
  pathCurvature?: number;
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
  /** Color adjustments applied to this image. */
  adjustments?: Partial<import("../color/adjustments").ColorAdjustments>;
  /** Non-destructive shape mask applied after crop. */
  mask?: {
    shape: "rect" | "rounded" | "ellipse" | "hexagon";
    radius?: number;
  };
  /** Gaussian blur in element-local pixels. */
  filterBlur?: number;
  /** Non-destructive pixel eraser strokes in image-local pixels. */
  rasterMask?: import("../raster/types").RasterMaskStroke[];
  /** Optional focal point for aspect-ratio-safe auto-crop (0..1). Default is center { x: 0.5, y: 0.5 }. */
  focalPoint?: { x: number; y: number };
  /** Optional connection to a user-approved local source file. */
  linkedAssetId?: string;
  sourceName?: string;
  sourceLastModified?: number;
  sourceSize?: number;
};

/**
 * Non-destructive projected book model. Camera and material values are stored
 * independently from the element/artwork rectangle, so resizing never creates
 * a visually different mockup or replaces its cover identity.
 */
export type BookMockupElement = BaseElement & {
  type: "bookMockup";
  /** Stable id of the cover image in the image cache. */
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Horizontal viewing angle in degrees. */
  yaw: number;
  /** Vertical viewing angle in degrees. */
  pitch: number;
  /** Rotation around the camera axis in degrees. */
  roll?: number;
  /** Lens distance: low values exaggerate perspective, high values flatten it. */
  perspective?: number;
  /** Apparent spine thickness as a percentage of the mockup width. */
  depth: number;
  /** Construction/material parameters. Optional for backward-compatible documents. */
  binding?: "paperback" | "hardcover";
  coverThickness?: number;
  coverOverhang?: number;
  hingeDepth?: number;
  pageColor?: string;
  /** Light direction in degrees. */
  lightAngle: number;
  /** Light height above the book in degrees. */
  lightElevation?: number;
  /** Highlight/shade strength (0..1). */
  lightIntensity: number;
  /** Minimum illumination retained on surfaces facing away from the key light. */
  ambientLight?: number;
  /** Ground-shadow controls, expressed in element-local pixels. */
  showShadow?: boolean;
  shadowBlur: number;
  shadowOpacity: number;
  shadowOffset: number;
  /** Fallback tint for the visible spine and page block. */
  spineColor: string;
  linkedAssetId?: string;
  sourceName?: string;
  sourceLastModified?: number;
  sourceSize?: number;
};

export type FrameMaskShape =
  | "rect"
  | "circle"
  | "roundedRect"
  | "diamond"
  | "triangle"
  | "polaroid"
  | "arch"
  | "heart"
  | "star"
  | "hexagon"
  | "plus"
  | "blob"
  | "customPath";

export type FrameElement = BaseElement & {
  type: "frame";
  name: string;
  shape?: FrameMaskShape;
  cornerRadius?: number;
  customPathNodes?: VectorPathNode[];
  /** Children rendered clipped to frame bbox. */
  childIds: ElementId[];
  /** Optional direct image assigned inside the frame (Canva-style mask container). */
  imageFileId?: string;
  cropOffsetX?: number;
  cropOffsetY?: number;
  cropZoom?: number;
  cropRotation?: number;
  feather?: number;
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
  | VectorPathElement
  | TextElement
  | ImageElement
  | BookMockupElement
  | FrameElement;

export type EngineElementType = EngineElement["type"];

// ——— Document container ———————————————————————————————————————————

/**
 * A real layer container. Placement behavior, visibility, and locking belong
 * here so any number of objects can move between Block and Free together.
 */
export type EngineLayer = {
  id: LayerId;
  name: string;
  mode: LayerMode;
  objectIds: ElementId[];
  /** Block placements are keyed by object id; Free layers keep this empty. */
  placements: Record<ElementId, BlockPlacement>;
  visible: boolean;
  locked: boolean;
  /** Monotonic layer order; higher layers render above lower layers. */
  z: number;
};

export type EngineSlide = {
  id: string;
  name: string;
  /** Root Artwork id shared by resized variants. Missing means this is a master. */
  variantOf?: string;
  variantLabel?: string;
  background: string;
  elements: EngineElement[];
  layers: EngineLayer[];
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
  workspaceStrictness: WorkspaceStrictness;
  strictnessLevel?: 1 | 2 | 3;
  strictnessValues?: { 2: number; 3: number };
  updatedAt: number;
  schemaVersion: number;
};

export const ENGINE_SCHEMA_VERSION = 5;
