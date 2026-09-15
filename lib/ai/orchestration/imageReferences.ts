import type { BookMockupElement, EngineElement, FrameElement, ImageElement } from "@/lib/engine/types";

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
    if (element.isDeleted || !selectedIds.has(element.id)) {
      return [];
    }
    const fileId =
      element.type === "image" || element.type === "bookMockup"
        ? element.fileId
        : element.type === "frame"
          ? element.imageFileId
          : undefined;
    if (!fileId) return [];

    const sourceName = element.type === "image" ? element.sourceName : undefined;
    const naturalWidth = (element as any).naturalWidth || element.width;
    const naturalHeight = (element as any).naturalHeight || element.height;
    return [
      {
        objectId: element.id,
        elementVersion: element.version,
        fileId,
        displayName: element.name || sourceName || `Image ${index + 1}`,
        sourceWidth: naturalWidth,
        sourceHeight: naturalHeight,
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
  type SupportedImageElement = ImageElement | BookMockupElement | FrameElement;
  const elementMap = new Map<string, { element: SupportedImageElement; originalIndex: number }>();
  const nameMap = new Map<string, { element: SupportedImageElement; originalIndex: number }>();

  let imageIndex = 0;
  elements.forEach((element, index) => {
    if (
      !element.isDeleted &&
      (element.type === "image" ||
        element.type === "bookMockup" ||
        (element.type === "frame" && Boolean(element.imageFileId)))
    ) {
      const entry = { element: element as SupportedImageElement, originalIndex: index };
      elementMap.set(element.id, entry);

      imageIndex++;
      const name = element.name?.trim().toLowerCase();
      if (name) nameMap.set(name, entry);

      const sourceName = (element as any).sourceName?.trim().toLowerCase();
      if (sourceName) nameMap.set(sourceName, entry);

      nameMap.set(`image ${imageIndex}`, entry);
      nameMap.set(`image ${index + 1}`, entry);
      nameMap.set(`รูปที่ ${imageIndex}`, entry);
      nameMap.set(`รูปที่ ${index + 1}`, entry);
      nameMap.set(`ภาพที่ ${imageIndex}`, entry);
      nameMap.set(`ภาพที่ ${index + 1}`, entry);
    }
  });

  const allRefs: ComposerImageRef[] = [];
  const seenIds = new Set<string>();

  for (const rawId of attachedIds) {
    if (!rawId) continue;
    const cleanId = rawId.replace(/^@\[?/, "").replace(/\]$/, "").trim();
    if (!cleanId) continue;

    let targetId = cleanId;
    let fallbackName = cleanId;
    const colonIndex = cleanId.lastIndexOf(":");
    if (colonIndex > 0) {
      fallbackName = cleanId.slice(0, colonIndex).trim();
      targetId = cleanId.slice(colonIndex + 1).trim() || fallbackName;
    }

    const entry =
      elementMap.get(targetId) ||
      elementMap.get(cleanId) ||
      nameMap.get(targetId.toLowerCase()) ||
      nameMap.get(fallbackName.toLowerCase()) ||
      nameMap.get(cleanId.toLowerCase());

    if (!entry) continue;
    if (seenIds.has(entry.element.id)) continue;
    seenIds.add(entry.element.id);

    const { element, originalIndex } = entry;
    const fileId =
      element.type === "image" || element.type === "bookMockup"
        ? element.fileId
        : element.type === "frame"
          ? element.imageFileId
          : undefined;
    if (!fileId) continue;

    const sourceName = element.type === "image" ? element.sourceName : undefined;
    const naturalWidth = (element as any).naturalWidth || element.width;
    const naturalHeight = (element as any).naturalHeight || element.height;
    const tagDisplayName = colonIndex > 0 ? fallbackName : "";
    allRefs.push({
      objectId: element.id,
      elementVersion: element.version,
      fileId,
      // Prefer Name Tag label from @[Name:id], then canvas object name, then filename.
      displayName:
        (tagDisplayName && tagDisplayName !== targetId ? tagDisplayName : "") ||
        element.name ||
        sourceName ||
        `Image ${originalIndex + 1}`,
      sourceWidth: naturalWidth,
      sourceHeight: naturalHeight,
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
    (element) =>
      !element.isDeleted &&
      (element.type === "image" ||
        element.type === "bookMockup" ||
        (element.type === "frame" && Boolean(element.imageFileId))),
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
