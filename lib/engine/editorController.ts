import { appendRasterMaskStroke } from "../raster/mask";
import type { RasterSelection, RasterSelectionOperation } from "../raster/selection";
import type { RasterMaskStroke } from "../raster/types";
import { applySelection } from "./selection";
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
};

export type EditorController = {
  /** Resolve click modifiers without exposing Zustand selection state to a gesture. */
  resolveSelection(
    current: ReadonlySet<string>,
    ids: readonly string[],
    additive: boolean,
  ): string[];
  /** Append one non-destructive Raster stroke as one document mutation. */
  commitRasterStroke(imageId: string, stroke: RasterMaskStroke, label?: string): boolean;
  /** Commit a Selection operation using dimensions owned by the image model. */
  commitRasterSelection(imageId: string, operation: RasterSelectionOperation): boolean;
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

  return {
    resolveSelection(current, ids, additive) {
      return Array.from(applySelection(current, ids, additive));
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

    selectionForImage(active, imageId) {
      return active?.imageId === imageId ? active.selection : undefined;
    },
  };
}
