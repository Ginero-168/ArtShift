import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import {
  buildAllSlideImageRefs,
  buildComposerImageSelectionFromIds,
  type ComposerImageRef,
} from "@/lib/ai/orchestration/imageReferences";
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

  const [attachedImageIds, setAttachedImageIds] = useState<string[]>([]);
  const prevSelectedIdsRef = useRef<ReadonlySet<string>>(new Set());
  const prevSlideIdRef = useRef(currentSlideId);
  const editorRef = useRef<InlineTagEditorHandle | null>(null);

  // Track element IDs that the user explicitly deleted from composer input,
  // so the selection bridge does not re-insert them while the element remains selected on canvas.
  const dismissedObjectIdsRef = useRef<Set<string>>(new Set());

  // Clear composer tags and dismissed IDs when switching slides
  useEffect(() => {
    if (prevSlideIdRef.current !== currentSlideId) {
      prevSlideIdRef.current = currentSlideId;
      setAttachedImageIds([]);
      prevSelectedIdsRef.current = new Set();
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
    prevSelectedIdsRef.current = current;

    if (!slide) return;

    // Reset dismissed state for elements that have been deselected on canvas
    for (const id of prev) {
      if (!current.has(id)) {
        dismissedObjectIdsRef.current.delete(id);
      }
    }

    const newlySelectedIds: string[] = [];
    for (const id of current) {
      if (!prev.has(id) && !dismissedObjectIdsRef.current.has(id)) {
        const el = slide.elements.find(
          (item: any) =>
            !item.isDeleted &&
            item.id === id &&
            (item.type === "image" ||
              item.type === "bookMockup" ||
              (item.type === "frame" && Boolean(item.imageFileId))),
        );
        if (el) {
          const fid = (el as any).fileId || (el as any).imageFileId;
          if (!fid || !dismissedObjectIdsRef.current.has(fid)) {
            newlySelectedIds.push(id);
          }
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
  }, [selectedIds, slide, allSlideImageRefs]);

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
          ((item.type === "image" || item.type === "bookMockup") && item.fileId === fileId ||
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
        const match =
          allSlideImageRefs.find((r: any) => r.objectId === el.id) || {
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

  const handleRemoveAttachedImage = useCallback(
    (fileId: string) => {
      setAttachedImageIds((prev) => {
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
          return prev.filter((id) => id !== el.id && id !== fileId);
        }
        dismissedObjectIdsRef.current.add(fileId);
        return prev.filter((id) => id !== fileId);
      });
    },
    [],
  );

  const clearAttachedImages = useCallback(() => {
    setAttachedImageIds([]);
    editorRef.current?.clear();
    try {
      useEngine.getState().clearSelection();
    } catch {}
  }, []);

  const handleInlineTagsChange = useCallback(
    (inlineIds: string[]) => {
      // Any ID that was previously attached but is missing from inlineIds was deleted by the user
      setAttachedImageIds((prev) => {
        const currentSlide = useEngine.getState().currentSlide();
        for (const id of prev) {
          if (!inlineIds.includes(id)) {
            dismissedObjectIdsRef.current.add(id);
            const el = currentSlide?.elements.find(
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
              try {
                const engine = useEngine.getState();
                if (engine.selectedIds.has(el.id)) {
                  engine.selectOnly([...engine.selectedIds].filter((sid) => sid !== el.id));
                }
              } catch {}
            }
          }
        }
        return inlineIds;
      });
    },
    [],
  );

  const removeLastAttachedImage = useCallback(() => {
    setAttachedImageIds((prev) => {
      if (prev.length > 0) {
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
      }
      return prev.slice(0, -1);
    });
  }, []);

  const insertTagForRef = useCallback((ref: ComposerImageRef) => {
    dismissedObjectIdsRef.current.delete(ref.objectId);
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
