export const IMAGE_TOOL_LABELS = {
  "remove-bg": "RemoveBG",
  vectorize1: "Vectorize1",
  vectorize2: "Vectorize2",
  vectorize3: "Vectorize3",
} as const;

export const VECTORIZE_GROUP_LABEL = "Vectorize" as const;

export type ImageToolId = keyof typeof IMAGE_TOOL_LABELS;
export type VectorizeToolId = Exclude<ImageToolId, "remove-bg">;

export const VECTORIZE_TOOL_IDS: readonly VectorizeToolId[] = [
  "vectorize1",
  "vectorize2",
  "vectorize3",
];

export function isVectorizeTool(tool: ImageToolId | null | undefined): tool is VectorizeToolId {
  return tool === "vectorize1" || tool === "vectorize2" || tool === "vectorize3";
}
