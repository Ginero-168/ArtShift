/**
 * Non-destructive pixel edits for raster image elements.
 *
 * Coordinates are stored in the image element's local space so an edit stays
 * attached when the image is moved, rotated, cropped, or resized.
 */
import type { RasterSelection } from "./selection";

export type RasterMaskStroke = {
  id: string;
  mode: "erase" | "paint";
  points: Array<[number, number]>;
  /** Optional per-point pressure in the 0..1 range for stylus input. */
  pressures?: number[];
  size: number;
  opacity: number;
  color?: string;
  /** 1 is a hard Pencil edge; lower values create a softer Brush edge. */
  hardness?: number;
  /** Snapshot of the active pixel Selection. Empty pixels outside it are ignored. */
  selection?: RasterSelection;
  /** Legacy serialized mask. New strokes use `selection` to avoid a PNG per stroke. */
  selectionMaskDataUrl?: string;
};

/** A bounded derived patch for Healing/Clone Stamp. The source image remains untouched. */
export type RasterRetouchEdit = {
  id: string;
  mode: "heal" | "clone";
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  selection?: RasterSelection;
};
