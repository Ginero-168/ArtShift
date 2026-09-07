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

export type ComposerImageSelection = {
  refs: ComposerImageRef[];
  omittedCount: number;
  totalCount: number;
};

export function buildComposerImageSelection(
  elements: readonly EngineElement[],
  selectedIds: ReadonlySet<string>,
): ComposerImageSelection {
  const allRefs = elements.flatMap((element, index) => {
    if (
      element.isDeleted ||
      !selectedIds.has(element.id) ||
      (element.type !== "image" && element.type !== "bookMockup")
    ) {
      return [];
    }
    const sourceName = element.type === "image" ? element.sourceName : undefined;
    return [
      {
        objectId: element.id,
        elementVersion: element.version,
        fileId: element.fileId,
        displayName: sourceName || element.name || `Image ${index + 1}`,
        sourceWidth: element.naturalWidth,
        sourceHeight: element.naturalHeight,
        width: element.width,
        height: element.height,
        angle: element.angle,
      },
    ];
  });
  const refs = allRefs.slice(0, 4);
  return { refs, omittedCount: allRefs.length - refs.length, totalCount: allRefs.length };
}

export function buildComposerImageRefs(
  elements: readonly EngineElement[],
  selectedIds: ReadonlySet<string>,
): ComposerImageRef[] {
  return buildComposerImageSelection(elements, selectedIds).refs;
}

export function snapshotComposerImageRefs(refs: readonly ComposerImageRef[]): ComposerImageRef[] {
  return refs.map((ref) => ({ ...ref }));
}
