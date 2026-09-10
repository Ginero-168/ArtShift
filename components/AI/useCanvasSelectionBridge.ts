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

  // Clear composer tags when switching slides
  useEffect(() => {
    if (prevSlideIdRef.current !== currentSlideId) {
      prevSlideIdRef.current = currentSlideId;
      setAttachedImageIds([]);
      prevSelectedIdsRef.current = new Set();
    }
  }, [currentSlideId]);

  // All image refs available on the current slide (unlimited quota)
  const allSlideImageRefs = useMemo(() => {
    if (!slide) return [];
    return buildAllSlideImageRefs(slide.elements);
  }, [slide]);

  const setEditorRef = useCallback(
    (handle: InlineTagEditorHandle | null) => {
      editorRef.current = handle;
      if (!handle || !slide) return;
      if (selectedIds && selectedIds.size > 0) {
        for (const id of selectedIds) {
          const match = allSlideImageRefs.find((r: any) => r.objectId === id);
          if (match) {
            handle.insertTag(match);
          }
        }
      }
    },
    [slide, selectedIds, allSlideImageRefs],
  );

  // Synchronize canvas element selection into attached tags
  useEffect(() => {
    const prev = prevSelectedIdsRef.current;
    const current = selectedIds;
    prevSelectedIdsRef.current = current;

    if (!slide) return;
    const newlySelectedIds: string[] = [];
    for (const id of current) {
      if (!prev.has(id)) {
        const el = slide.elements.find(
          (item: any) =>
            !item.isDeleted &&
            item.id === id &&
            (item.type === "image" || item.type === "bookMockup"),
        );
        if (el) {
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
                fileId: (el as any).fileId,
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
          (item.type === "image" || item.type === "bookMockup") &&
          "fileId" in item &&
          item.fileId === fileId,
      );
      if (el) {
        useEngine.getState().selectOnly([el.id]);
        setAttachedImageIds((existing) =>
          existing.includes(el.id) ? existing : [...existing, el.id],
        );
        const match =
          allSlideImageRefs.find((r: any) => r.objectId === el.id) || {
            objectId: el.id,
            elementVersion: el.version,
            fileId: (el as any).fileId,
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
        if (!currentSlide) return prev;
        const el = currentSlide.elements.find(
          (item: any) =>
            !item.isDeleted &&
            (item.type === "image" || item.type === "bookMockup") &&
            "fileId" in item &&
            item.fileId === fileId,
        );
        if (!el) return prev;
        return prev.filter((id) => id !== el.id);
      });
    },
    [],
  );

  const clearAttachedImages = useCallback(() => {
    setAttachedImageIds([]);
    editorRef.current?.clear();
  }, []);

  const handleInlineTagsChange = useCallback((inlineIds: string[]) => {
    setAttachedImageIds(inlineIds);
  }, []);

  const removeLastAttachedImage = useCallback(() => {
    setAttachedImageIds((prev) => prev.slice(0, -1));
  }, []);

  const insertTagForRef = useCallback((ref: ComposerImageRef) => {
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
