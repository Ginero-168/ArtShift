import { appendRasterMaskStroke } from "../raster/mask";
import type { RasterSelection, RasterSelectionOperation } from "../raster/selection";
import type { RasterMaskStroke, RasterRetouchEdit } from "../raster/types";
import { applySelection } from "./selection";
import type { Tool } from "./store";
import type { EngineSlide, ImageElement } from "./types";

export type EditorControllerActions = {
  currentSlide: () => EngineSlide | undefined;
  updateElements: (
    patches: Array<{ id: string; patch: Record<string, unknown> }>,
    label?: string,
  ) => void;
  applyRasterSelection: (
    imageId: string,
    operation: RasterSelectionOperation,
    width: number,
    height: number,
  ) => void;
  currentTool?: () => Tool;
  currentSelection?: () => ReadonlySet<string>;
  setFrameImage?: (frameId: string, imageFileId: string | undefined) => void;
  deleteElements?: (ids: string[]) => void;
  selectOnly?: (ids: string[]) => void;
  commitBlockLayout?: (id: string) => void;
};

export type EditorController = {
  currentSlide(): EngineSlide | undefined;
  /** Resolve click modifiers without exposing Zustand selection state to a gesture. */
  resolveSelection(
    current: ReadonlySet<string>,
    ids: readonly string[],
    additive: boolean,
  ): string[];
  /** Append one non-destructive Raster stroke as one document mutation. */
  commitRasterStroke(imageId: string, stroke: RasterMaskStroke, label?: string): boolean;
  /** Append one bounded derived Healing/Clone patch as one document mutation. */
  commitRasterRetouch(imageId: string, edit: RasterRetouchEdit, label?: string): boolean;
  /** Commit a Selection operation using dimensions owned by the image model. */
  commitRasterSelection(imageId: string, operation: RasterSelectionOperation): boolean;
  /** Commit one validated element conversion/update through the editor seam. */
  commitElementPatch(id: string, patch: Record<string, unknown>, label?: string): boolean;
  /** Keep asynchronous tool jobs from committing after the user changed tools. */
  isToolActive(tool: Tool): boolean;
  /** Read current selection/tool state without importing the Zustand store into Canvas code. */
  currentSelection(): ReadonlySet<string>;
  /** Place one image into one frame as one editor operation. */
  commitFrameDrop(frameId: string, imageId: string, fileId: string): boolean;
  commitBlockLayout(id: string): void;
  /** Return the active Selection only when it belongs to the requested image. */
  selectionForImage(
    active: { imageId: string; selection: RasterSelection } | null,
    imageId: string,
  ): RasterSelection | undefined;
};

/**
 * Deep editor seam for mutations that span pointer gestures and the document
 * model. Canvas code supplies actions; this module owns selection and raster
 * transaction rules so a future non-Zustand editor surface can reuse them.
 */
export function createEditorController(actions: EditorControllerActions): EditorController {
  const imageFor = (imageId: string): ImageElement | undefined => {
    const element = actions
      .currentSlide()
      ?.elements.find(
        (candidate): candidate is ImageElement =>
          candidate.id === imageId && candidate.type === "image",
      );
    return element;
  };

  const elementExists = (id: string): boolean =>
    Boolean(actions.currentSlide()?.elements.some((candidate) => candidate.id === id));

  return {
    resolveSelection(current, ids, additive) {
      return Array.from(applySelection(current, ids, additive));
    },

    currentSlide() {
      return actions.currentSlide();
    },

    commitRasterStroke(imageId, stroke, label = "edit image pixels") {
      const image = imageFor(imageId);
      if (!image) return false;
      actions.updateElements(
        [
          {
            id: image.id,
            patch: { rasterMask: appendRasterMaskStroke(image.rasterMask, stroke) },
          },
        ],
        label,
      );
      return true;
    },

    commitRasterSelection(imageId, operation) {
      const image = imageFor(imageId);
      if (!image) return false;
      actions.applyRasterSelection(image.id, operation, image.width, image.height);
      return true;
    },

    commitElementPatch(id, patch, label = "update element") {
      if (!elementExists(id)) return false;
      actions.updateElements([{ id, patch }], label);
      return true;
    },

    commitRasterRetouch(imageId, edit, label = `${edit.mode} image pixels`) {
      const image = imageFor(imageId);
      if (!image) return false;
      actions.updateElements(
        [{ id: image.id, patch: { rasterEdits: [...(image.rasterEdits ?? []), edit] } }],
        label,
      );
      return true;
    },

    isToolActive(tool) {
      return actions.currentTool?.() === tool;
    },

    currentSelection() {
      return actions.currentSelection?.() ?? new Set<string>();
    },

    commitFrameDrop(frameId, imageId, fileId) {
      const slide = actions.currentSlide();
      const frame = slide?.elements.find(
        (candidate) => candidate.id === frameId && candidate.type === "frame",
      );
      const image = imageFor(imageId);
      if (
        !frame ||
        !image ||
        image.id === frame.id ||
        !image.fileId ||
        image.fileId !== fileId ||
        !actions.setFrameImage ||
        !actions.deleteElements ||
        !actions.selectOnly
      ) {
        return false;
      }
      actions.setFrameImage(frame.id, fileId);
      actions.deleteElements([image.id]);
      actions.selectOnly([frame.id]);
      return true;
    },

    commitBlockLayout(id) {
      actions.commitBlockLayout?.(id);
    },

    selectionForImage(active, imageId) {
      return active?.imageId === imageId ? active.selection : undefined;
    },
  };
}
