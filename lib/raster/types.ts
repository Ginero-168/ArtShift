/**
 * Non-destructive pixel edits for raster image elements.
 *
 * Coordinates are stored in the image element's local space so an edit stays
 * attached when the image is moved, rotated, cropped, or resized.
 */
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
  selectionMaskDataUrl?: string;
};
