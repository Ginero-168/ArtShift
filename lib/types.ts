export type ObjectId = string;
export type SlideId = string;

export type BaseObject = {
  id: ObjectId;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  name?: string;
};

export type TextObject = BaseObject & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: "normal" | "bold" | "italic" | "bold italic";
  align: "left" | "center" | "right";
  fill: string;
  lineHeight: number;
  // When true, the object's width/height auto-track the rendered text size
  // (created by a single click). When false / undefined, the text is a fixed
  // box that wraps its content (created by dragging a size on the canvas).
  autoFit?: boolean;
};

export type ImageObject = BaseObject & {
  type: "image";
  src: string;
  alt?: string;
};

export type ShapeKind = "rect" | "ellipse" | "line" | "arrow" | "triangle";

export type ShapeObject = BaseObject & {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
  // For `line` / `arrow` only: which diagonal the endpoints trace across the
  // axis-aligned bbox. Undefined = top-left → bottom-right (legacy default).
  // flipY = true means the line runs from bottom-left → top-right (or the
  // arrow points to the top-right corner).
  // flipX lets an arrow's head sit at the left edge instead of the right.
  flipX?: boolean;
  flipY?: boolean;
};

export type SlideObject = TextObject | ImageObject | ShapeObject;

export type Slide = {
  id: SlideId;
  name: string;
  background: string;
  objects: SlideObject[];
  notes?: string;
  excalidrawElements?: unknown[];
};

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type SlideDoc = {
  id: string;
  title: string;
  width: number;
  height: number;
  slides: Slide[];
  updatedAt: number;
  schemaVersion?: number;
};

export type Tool = "select" | "text" | "image" | "rect" | "ellipse" | "line" | "arrow" | "triangle";

export type AiToolName =
  | "add_text"
  | "add_shape"
  | "add_image"
  | "update_object"
  | "delete_object"
  | "set_background"
  | "add_slide";

export type Mutation = {
  tool: AiToolName | (string & {});
  input: Record<string, unknown>;
};
