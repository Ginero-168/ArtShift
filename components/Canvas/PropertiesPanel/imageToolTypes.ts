export const IMAGE_TOOL_LABELS = {
  "remove-bg": "RemoveBG",
  vectorize2: "Vectorize",
  vectorize3: "Vectorize(Cloud)",
} as const;

export const EXTRACT_LABEL = "Extract" as const;
export const VECTORIZE_GROUP_LABEL = "Vectorize" as const;

export type ImageToolId = keyof typeof IMAGE_TOOL_LABELS;
export type VectorizeToolId = Exclude<ImageToolId, "remove-bg">;
export type ImageActionId = ImageToolId | "extract";

export const IMAGE_ACTION_LABELS = {
  ...IMAGE_TOOL_LABELS,
  extract: EXTRACT_LABEL,
} as const;

export const VECTORIZE_TOOL_IDS: readonly VectorizeToolId[] = ["vectorize2", "vectorize3"];

export function isVectorizeTool(tool: ImageActionId | null | undefined): tool is VectorizeToolId {
  return tool === "vectorize2" || tool === "vectorize3";
}
