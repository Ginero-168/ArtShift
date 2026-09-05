export type ObjectContextIconName =
  | "flip-horizontal"
  | "flip-vertical"
  | "rotate"
  | "crop"
  | "intelligence"
  | "remove-bg"
  | "vectorize1"
  | "vectorize2"
  | "vectorize3"
  | "download"
  | "image"
  | "vector"
  | "vectorize"
  | "book"
  | "frame"
  | "text"
  | "shape"
  | "multiple"
  | "align"
  | "distribute"
  | "group"
  | "color"
  | "fill"
  | "stroke"
  | "fit-canvas"
  | "corner-radius"
  | "edit-nodes"
  | "edit"
  | "detach"
  | "font"
  | "size"
  | "weight"
  | "paragraph"
  | "spacing"
  | "unite"
  | "minus-front"
  | "intersect"
  | "exclude"
  | "minus-back"
  | "divide"
  | "object";

const ICON_NAME_BY_LABEL: Readonly<Record<string, ObjectContextIconName>> = Object.freeze({
  "Flip Horizontal": "flip-horizontal",
  "Flip Vertical": "flip-vertical",
  "Rotate 90°": "rotate",
  Crop: "crop",
  "Image Intelligence": "intelligence",
  RemoveBG: "remove-bg",
  Vectorize1: "vectorize1",
  Vectorize2: "vectorize2",
  Vectorize3: "vectorize3",
  Download: "download",
  Image: "image",
  Vector: "vector",
  Vectorize: "vectorize",
  "3D Book": "book",
  Frame: "frame",
  Text: "text",
  Shape: "shape",
  Multiple: "multiple",
  Align: "align",
  Distribute: "distribute",
  Group: "group",
  Color: "color",
  Fill: "fill",
  Stroke: "stroke",
  "Fit canvas": "fit-canvas",
  "Corner radius": "corner-radius",
  "Edit nodes": "edit-nodes",
  Edit: "edit",
  Detach: "detach",
  Font: "font",
  Size: "size",
  Weight: "weight",
  Paragraph: "paragraph",
  Spacing: "spacing",
  Unite: "unite",
  "Minus Front": "minus-front",
  Intersect: "intersect",
  Exclude: "exclude",
  "Minus Back": "minus-back",
  Divide: "divide",
  "Convert to frame": "frame",
  Object: "object",
});

export const OBJECT_CONTEXT_ICON_KEYS = Object.freeze(Object.keys(ICON_NAME_BY_LABEL));

export function getObjectContextIconName(label: string): ObjectContextIconName {
  return ICON_NAME_BY_LABEL[label] ?? "object";
}
