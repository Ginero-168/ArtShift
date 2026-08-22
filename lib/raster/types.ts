/**
 * Non-destructive pixel edits for raster image elements.
 *
 * Coordinates are stored in the image element's local space so an edit stays
 * attached when the image is moved, rotated, cropped, or resized.
 */
export type RasterMaskStroke = {
  id: string;
  mode: "erase";
  points: Array<[number, number]>;
  size: number;
  opacity: number;
};
