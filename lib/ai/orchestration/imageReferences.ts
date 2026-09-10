import type { BookMockupElement, EngineElement, ImageElement } from "@/lib/engine/types";

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

export function buildComposerImageSelectionFromIds(
  elements: readonly EngineElement[],
  attachedIds: readonly string[],
  options?: { limit?: number },
): ComposerImageSelection {
  type SupportedImageElement = ImageElement | BookMockupElement;
  const elementMap = new Map<string, { element: SupportedImageElement; originalIndex: number }>();
  elements.forEach((element, index) => {
    if (!element.isDeleted && (element.type === "image" || element.type === "bookMockup")) {
      elementMap.set(element.id, { element, originalIndex: index });
    }
  });

  const allRefs: ComposerImageRef[] = [];
  const seenIds = new Set<string>();

  for (const id of attachedIds) {
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const entry = elementMap.get(id);
    if (!entry) continue;
    const { element, originalIndex } = entry;
    const sourceName = element.type === "image" ? element.sourceName : undefined;
    allRefs.push({
      objectId: element.id,
      elementVersion: element.version,
      fileId: element.fileId,
      displayName: sourceName || element.name || `Image ${originalIndex + 1}`,
      sourceWidth: element.naturalWidth,
      sourceHeight: element.naturalHeight,
      width: element.width,
      height: element.height,
      angle: element.angle,
    });
  }

  const limit = options?.limit ?? 4;
  const refs = Number.isFinite(limit) ? allRefs.slice(0, limit) : allRefs;
  return {
    refs,
    omittedCount: Math.max(0, allRefs.length - refs.length),
    totalCount: allRefs.length,
  };
}

export function buildAllSlideImageRefs(
  elements: readonly EngineElement[],
): ComposerImageRef[] {
  const imageElements = elements.filter(
    (element) => !element.isDeleted && (element.type === "image" || element.type === "bookMockup"),
  );
  return buildComposerImageSelectionFromIds(
    elements,
    imageElements.map((el) => el.id),
    { limit: Infinity },
  ).refs;
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
