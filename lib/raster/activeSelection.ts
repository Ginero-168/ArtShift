import {
  appendRasterSelection,
  type RasterSelection,
  type RasterSelectionOperation,
} from "./selection";

/**
 * The Photoshop-style pixel Selection belongs to one active image at a time.
 * Keeping the image identity beside the mask prevents an old Selection from
 * silently affecting a different image after the user changes Objects.
 */
export type ActiveRasterSelection = {
  imageId: string;
  selection: RasterSelection;
} | null;

export function appendActiveRasterSelection(
  current: ActiveRasterSelection,
  imageId: string,
  operation: RasterSelectionOperation,
  width: number,
  height: number,
): ActiveRasterSelection {
  if (operation.mode !== "replace" && current?.imageId !== imageId) return current;

  return {
    imageId,
    selection: appendRasterSelection(
      current?.imageId === imageId ? current.selection : undefined,
      operation,
      width,
      height,
    ),
  };
}

export function selectionForImage(
  active: ActiveRasterSelection,
  imageId: string,
): RasterSelection | undefined {
  return active?.imageId === imageId ? active.selection : undefined;
}

export function setActiveRasterSelection(
  imageId: string,
  selection: RasterSelection | null,
): ActiveRasterSelection {
  return selection ? { imageId, selection } : null;
}

export function clearActiveRasterSelection(
  active: ActiveRasterSelection,
  imageId?: string,
): ActiveRasterSelection {
  if (imageId && active?.imageId !== imageId) return active;
  return null;
}
