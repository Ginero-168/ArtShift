export const IMAGE_TOOL_LABELS = {
  upscale: "Upscale",
  "remove-bg": "RemoveBG",
  vectorize2: "Vectorize",
  vectorize3: "Vectorize(Cloud)",
} as const;

export const EXTRACT_LABEL = "Extract" as const;
export const LAYER_LABEL = "Layer" as const;
export const MULTI_ANGLE_LABEL = "Multi-Angle" as const;
export const SKELETON_LABEL = "Skeleton" as const;
export const VECTORIZE_GROUP_LABEL = "Vectorize" as const;

export type ImageToolId = keyof typeof IMAGE_TOOL_LABELS;
export type VectorizeToolId = Exclude<ImageToolId, "remove-bg" | "upscale">;
export type ImageActionId = ImageToolId | "extract" | "layer" | "multi-angle" | "skeleton";

export const IMAGE_ACTION_LABELS = {
  ...IMAGE_TOOL_LABELS,
  extract: EXTRACT_LABEL,
  layer: LAYER_LABEL,
  "multi-angle": MULTI_ANGLE_LABEL,
  skeleton: SKELETON_LABEL,
} as const;

export const VECTORIZE_TOOL_IDS: readonly VectorizeToolId[] = ["vectorize2", "vectorize3"];

export function isVectorizeTool(tool: ImageActionId | null | undefined): tool is VectorizeToolId {
  return tool === "vectorize2" || tool === "vectorize3";
}
