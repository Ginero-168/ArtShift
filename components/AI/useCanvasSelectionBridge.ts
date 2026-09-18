import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import {
  buildAllSlideImageRefs,
  buildComposerImageSelectionFromIds,
  type ComposerImageRef,
} from "@/lib/ai/orchestration/imageReferences";
import { elementWorldBBox } from "@/lib/engine/bounds";
import { fitWorldRectToViewport } from "@/lib/engine/canvasViewport";
import { useEngine } from "@/lib/engine/store";

export interface CanvasSelectionBridge {
  attachedImageIds: string[];
  setAttachedImageIds: React.Dispatch<React.SetStateAction<string[]>>;
  allSlideImageRefs: ComposerImageRef[];
  composerImageRefs: ComposerImageRef[];
  editorRef: React.MutableRefObject<InlineTagEditorHandle | null>;
  setEditorRef: (handle: InlineTagEditorHandle | null) => void;
  handleSelectCanvasImage: (fileId?: string) => void;
  handleRemoveAttachedImage: (fileId: string) => void;
  clearAttachedImages: () => void;
  handleInlineTagsChange: (inlineIds: string[]) => void;
  removeLastAttachedImage: () => void;
  insertTagForRef: (ref: ComposerImageRef) => void;
}

/**
 * Single Source of Truth bridge between Canvas element selections and
 * Chat Composer image tags. Prevents race conditions, tag dropping, and duplicate tags.
 */
export function useCanvasSelectionBridge(): CanvasSelectionBridge {
  const currentSlideId = useEngine((s: any) => s.currentSlideId);
  const slide = useEngine((s: any) =>
    s.doc.slides.find((candidate: any) => candidate.id === s.currentSlideId),
  );
  const selectedIds = useEngine((s: any) => s.selectedIds);
  const selectionVersion = useEngine((s: any) => s.selectionVersion ?? 0);

  const [attachedImageIds, setAttachedImageIds] = useState<string[]>([]);
  const prevSelectedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const prevSelectionVersionRef = useRef<number>(selectionVersion);
  const prevSlideIdRef = useRef(currentSlideId);
  const editorRef = useRef<InlineTagEditorHandle | null>(null);

  // Track element IDs that the user explicitly deleted from composer input,
  // so the selection bridge does not re-insert them while the element remains selected on canvas.
  const dismissedObjectIdsRef = useRef<Set<string>>(new Set());

  const clearDismissalForId = useCallback((id: string, elements?: any[]) => {
    dismissedObjectIdsRef.current.delete(id);
    const el = elements?.find(
      (item: any) =>
        item.id === id ||
        item.fileId === id ||
        item.imageFileId === id ||
        ((item.type === "image" || item.type === "bookMockup") && item.fileId === id) ||
        (item.type === "frame" && item.imageFileId === id),
    );
    if (el) {
      dismissedObjectIdsRef.current.delete(el.id);
      if (el.fileId) dismissedObjectIdsRef.current.delete(el.fileId);
      if (el.imageFileId) dismissedObjectIdsRef.current.delete(el.imageFileId);
    }
  }, []);

  // Clear composer tags and dismissed IDs when switching slides
  useEffect(() => {
    if (prevSlideIdRef.current !== currentSlideId) {
      prevSlideIdRef.current = currentSlideId;
      setAttachedImageIds([]);
      prevSelectedIdsRef.current = new Set();
      prevSelectionVersionRef.current = 0;
      dismissedObjectIdsRef.current.clear();
    }
  }, [currentSlideId]);

  // All image refs available on the current slide (unlimited quota)
  const allSlideImageRefs = useMemo(() => {
    if (!slide) return [];
    return buildAllSlideImageRefs(slide.elements);
  }, [slide]);

  // Stable ref callback: strictly attaches the handle without re-inserting tags on every render
  const setEditorRef = useCallback((handle: InlineTagEditorHandle | null) => {
    editorRef.current = handle;
  }, []);

  // Synchronize canvas element selection into attached tags
  useEffect(() => {
    const prev = prevSelectedIdsRef.current;
    const current = selectedIds;
    const prevVersion = prevSelectionVersionRef.current;
    const isExplicitSelectionAction = selectionVersion !== prevVersion;
    prevSelectedIdsRef.current = current;
    prevSelectionVersionRef.current = selectionVersion;

    if (!slide) return;

    // Reset dismissed state for elements that have been deselected on canvas
    for (const id of prev) {
      if (!current.has(id)) {
        clearDismissalForId(id, slide.elements);
      }
    }

    const newlySelectedIds: string[] = [];
    for (const id of current) {
      const el = slide.elements.find(
        (item: any) =>
          !item.isDeleted &&
          item.id === id &&
          (item.type === "image" ||
            item.type === "bookMockup" ||
            (item.type === "frame" && Boolean(item.imageFileId))),
      );
      if (!el) continue;

      const fid = (el as any).fileId || (el as any).imageFileId;

      if (isExplicitSelectionAction) {
        // User explicitly clicked or selected on canvas: clear past dismissal and re-arm selection!
        clearDismissalForId(id, slide.elements);
        newlySelectedIds.push(id);
      } else if (!prev.has(id)) {
        if (
          !dismissedObjectIdsRef.current.has(id) &&
          (!fid || !dismissedObjectIdsRef.current.has(fid))
        ) {
          newlySelectedIds.push(id);
        }
      }
    }

    if (newlySelectedIds.length > 0) {
      setAttachedImageIds((existing) => {
        const set = new Set(existing);
        const toAdd = newlySelectedIds.filter((id) => !set.has(id));
        return toAdd.length > 0 ? [...existing, ...toAdd] : existing;
      });

      for (const id of newlySelectedIds) {
        const el = slide.elements.find((item: any) => item.id === id);
        const match =
          allSlideImageRefs.find((r: any) => r.objectId === id) ||
          (el
            ? {
                objectId: el.id,
                elementVersion: el.version,
                fileId: (el as any).fileId || (el as any).imageFileId,
                displayName: (el as any).sourceName || el.name || "Image",
                sourceWidth: (el as any).naturalWidth || el.width,
                sourceHeight: (el as any).naturalHeight || el.height,
                width: el.width,
                height: el.height,
                angle: el.angle,
              }
            : null);
        if (match) {
          editorRef.current?.insertTag(match);
        }
      }
    }
  }, [selectedIds, selectionVersion, slide, allSlideImageRefs, clearDismissalForId]);

  const composerImageSelection = useMemo(() => {
    return buildComposerImageSelectionFromIds(slide?.elements ?? [], attachedImageIds);
  }, [slide?.elements, attachedImageIds]);
  const composerImageRefs = composerImageSelection.refs;

  const handleSelectCanvasImage = useCallback(
    (fileId?: string) => {
      if (!fileId) return;
      const currentSlide = useEngine.getState().currentSlide();
      if (!currentSlide) return;
      const el = currentSlide.elements.find(
        (item: any) =>
          !item.isDeleted &&
          (((item.type === "image" || item.type === "bookMockup") && item.fileId === fileId) ||
            (item.type === "frame" && item.imageFileId === fileId)),
      );
      if (el) {
        // User explicitly re-selected this image: un-dismiss it
        dismissedObjectIdsRef.current.delete(el.id);
        if ((el as any).fileId) dismissedObjectIdsRef.current.delete((el as any).fileId);
        if ((el as any).imageFileId) dismissedObjectIdsRef.current.delete((el as any).imageFileId);
        useEngine.getState().selectOnly([el.id]);
        setAttachedImageIds((existing) =>
          existing.includes(el.id) ? existing : [...existing, el.id],
        );
        // Zoom viewport so the image fills the canvas view.
        try {
          fitWorldRectToViewport(elementWorldBBox(el), 64);
        } catch {
          // ignore viewport zoom failures
        }
        const match = allSlideImageRefs.find((r: any) => r.objectId === el.id) || {
          objectId: el.id,
          elementVersion: el.version,
          fileId: (el as any).fileId || (el as any).imageFileId,
          displayName: (el as any).sourceName || el.name || "Image",
          sourceWidth: (el as any).naturalWidth || el.width,
          sourceHeight: (el as any).naturalHeight || el.height,
          width: el.width,
          height: el.height,
          angle: el.angle,
        };
        editorRef.current?.insertTag(match);
      }
    },
    [allSlideImageRefs],
  );

  const handleRemoveAttachedImage = useCallback((fileId: string) => {
    const currentSlide = useEngine.getState().currentSlide();
    const el = currentSlide?.elements.find(
      (item: any) =>
        !item.isDeleted &&
        (item.id === fileId ||
          ((item.type === "image" || item.type === "bookMockup") && item.fileId === fileId) ||
          (item.type === "frame" && item.imageFileId === fileId)),
    );
    if (el) {
      dismissedObjectIdsRef.current.add(el.id);
      if ((el as any).fileId) dismissedObjectIdsRef.current.add((el as any).fileId);
      if ((el as any).imageFileId) dismissedObjectIdsRef.current.add((el as any).imageFileId);
      try {
        const engine = useEngine.getState();
        if (engine.selectedIds.has(el.id)) {
          engine.selectOnly([...engine.selectedIds].filter((id) => id !== el.id));
        }
      } catch {}
      setAttachedImageIds((prev) => prev.filter((id) => id !== el.id && id !== fileId));
    } else {
      dismissedObjectIdsRef.current.add(fileId);
      setAttachedImageIds((prev) => prev.filter((id) => id !== fileId));
    }
  }, []);

  const clearAttachedImages = useCallback(() => {
    setAttachedImageIds([]);
    dismissedObjectIdsRef.current.clear();
    editorRef.current?.clear();
    try {
      useEngine.getState().clearSelection();
    } catch {}
  }, []);

  const handleInlineTagsChange = useCallback((inlineIds: string[]) => {
    setAttachedImageIds((prev) => {
      const currentSlide = useEngine.getState().currentSlide();
      const removedIds = prev.filter((id) => !inlineIds.includes(id));
      if (removedIds.length > 0 && currentSlide) {
        const engine = useEngine.getState();
        const idsToDeselect: string[] = [];
        for (const id of removedIds) {
          dismissedObjectIdsRef.current.add(id);
          const el = currentSlide.elements.find(
            (item: any) =>
              !item.isDeleted &&
              (item.id === id ||
                ((item.type === "image" || item.type === "bookMockup") && item.fileId === id) ||
                (item.type === "frame" && item.imageFileId === id)),
          );
          if (el) {
            dismissedObjectIdsRef.current.add(el.id);
            if ((el as any).fileId) dismissedObjectIdsRef.current.add((el as any).fileId);
            if ((el as any).imageFileId) dismissedObjectIdsRef.current.add((el as any).imageFileId);
            if (engine.selectedIds.has(el.id)) {
              idsToDeselect.push(el.id);
            }
          }
        }
        if (idsToDeselect.length > 0) {
          const deselectSet = new Set(idsToDeselect);
          engine.selectOnly([...engine.selectedIds].filter((sid) => !deselectSet.has(sid)));
        }
      }
      return inlineIds;
    });
  }, []);

  const removeLastAttachedImage = useCallback(() => {
    setAttachedImageIds((prev) => {
      if (prev.length === 0) return prev;
      const lastId = prev[prev.length - 1];
      dismissedObjectIdsRef.current.add(lastId);
      const currentSlide = useEngine.getState().currentSlide();
      const el = currentSlide?.elements.find(
        (item: any) =>
          !item.isDeleted &&
          (item.id === lastId ||
            ((item.type === "image" || item.type === "bookMockup") && item.fileId === lastId) ||
            (item.type === "frame" && item.imageFileId === lastId)),
      );
      if (el) {
        dismissedObjectIdsRef.current.add(el.id);
        if ((el as any).fileId) dismissedObjectIdsRef.current.add((el as any).fileId);
        if ((el as any).imageFileId) dismissedObjectIdsRef.current.add((el as any).imageFileId);
        try {
          const engine = useEngine.getState();
          if (engine.selectedIds.has(el.id)) {
            engine.selectOnly([...engine.selectedIds].filter((sid) => sid !== el.id));
          }
        } catch {}
      }
      return prev.slice(0, -1);
    });
  }, []);

  const insertTagForRef = useCallback((ref: ComposerImageRef) => {
    dismissedObjectIdsRef.current.delete(ref.objectId);
    if (ref.fileId) dismissedObjectIdsRef.current.delete(ref.fileId);
    editorRef.current?.insertTag(ref);
  }, []);

  return {
    attachedImageIds,
    setAttachedImageIds,
    allSlideImageRefs,
    composerImageRefs,
    editorRef,
    setEditorRef,
    handleSelectCanvasImage,
    handleRemoveAttachedImage,
    clearAttachedImages,
    handleInlineTagsChange,
    removeLastAttachedImage,
    insertTagForRef,
  };
}
