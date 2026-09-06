import type { EngineElement } from "@/lib/engine/types";

export type ComposerImageRef = {
  objectId: string;
  elementVersion: number;
  fileId: string;
  displayName: string;
  sourceWidth: number;
  sourceHeight: number;
  width: number;
  height: number;
  angle: number;
};

export function buildComposerImageRefs(
  elements: readonly EngineElement[],
  selectedIds: ReadonlySet<string>,
): ComposerImageRef[] {
  return elements.flatMap((element, index) => {
    if (element.isDeleted || !selectedIds.has(element.id) || element.type !== "image") return [];
    return [
      {
        objectId: element.id,
        elementVersion: element.version,
        fileId: element.fileId,
        displayName: element.sourceName || element.name || `Image ${index + 1}`,
        sourceWidth: element.naturalWidth,
        sourceHeight: element.naturalHeight,
        width: element.width,
        height: element.height,
        angle: element.angle,
      },
    ];
  });
}

export function snapshotComposerImageRefs(refs: readonly ComposerImageRef[]): ComposerImageRef[] {
  return refs.map((ref) => ({ ...ref }));
}
