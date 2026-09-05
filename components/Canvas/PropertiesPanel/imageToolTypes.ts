export const IMAGE_TOOL_LABELS = {
  "remove-bg": "RemoveBG",
  vectorize1: "Vectorize1",
  vectorize2: "Vectorize2",
  vectorize3: "Vectorize3",
} as const;

export type ImageToolId = keyof typeof IMAGE_TOOL_LABELS;
