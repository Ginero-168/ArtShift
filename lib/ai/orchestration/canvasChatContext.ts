export type ChatCanvasElement = {
  isDeleted?: boolean;
  type: string;
  text?: string;
};

export type ChatCanvasSummary = {
  objectCount: number;
  selectedCount: number;
  width: number;
  height: number;
  visibleText?: string;
};

/**
 * Facts the thinker may treat as already settled.
 * ArtShift has no Brand Kit, so a preset publisher name is never a subject.
 */
export function canvasSummaryForChat(input: {
  elements: readonly ChatCanvasElement[];
  selectedCount: number;
  width: number;
  height: number;
}): ChatCanvasSummary {
  const live = input.elements.filter((element) => !element.isDeleted);
  const visibleText = live
    .filter((element) => element.type === "text" && element.text?.trim())
    .map((element) => element.text!.trim())
    .slice(0, 12)
    .join("\n")
    .slice(0, 800);
  return {
    objectCount: live.length,
    selectedCount: input.selectedCount,
    width: input.width,
    height: input.height,
    ...(visibleText ? { visibleText } : {}),
  };
}
