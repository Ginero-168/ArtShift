/**
 * Image-space math for the Affinity-style Studio navigator thumbnail.
 * The viewport rect is the pasteboard window mapped onto the bitmap.
 */

export const NAVIGATOR_MAX_WIDTH = 168;
export const NAVIGATOR_MAX_HEIGHT = 120;

export type StudioPan = { x: number; y: number };

export type ImageSpaceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function navigatorThumbSize(
  imageWidth: number,
  imageHeight: number,
): { width: number; height: number } {
  const width = Math.max(1, imageWidth);
  const height = Math.max(1, imageHeight);
  const aspect = width / height;
  let thumbW = NAVIGATOR_MAX_WIDTH;
  let thumbH = thumbW / aspect;
  if (thumbH > NAVIGATOR_MAX_HEIGHT) {
    thumbH = NAVIGATOR_MAX_HEIGHT;
    thumbW = thumbH * aspect;
  }
  return {
    width: Math.max(48, Math.round(thumbW)),
    height: Math.max(36, Math.round(thumbH)),
  };
}

/** Pasteboard window in image pixels (may extend outside the bitmap). */
export function imageSpaceViewRect(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
  pan: StudioPan,
): ImageSpaceRect {
  const z = Math.max(0.0001, zoom);
  const imageLeft = stageWidth / 2 + pan.x - (imageWidth * z) / 2;
  const imageTop = stageHeight / 2 + pan.y - (imageHeight * z) / 2;
  return {
    x: -imageLeft / z,
    y: -imageTop / z,
    width: stageWidth / z,
    height: stageHeight / z,
  };
}

/** Pan so an image-space point sits at the pasteboard center. */
export function panToCenterImagePoint(
  imageX: number,
  imageY: number,
  imageWidth: number,
  imageHeight: number,
  zoom: number,
): StudioPan {
  return {
    x: (imageWidth / 2 - imageX) * zoom,
    y: (imageHeight / 2 - imageY) * zoom,
  };
}

/** Dragging the navigator rect: positive image delta looks further right/down. */
export function panByImageDelta(
  pan: StudioPan,
  imageDx: number,
  imageDy: number,
  zoom: number,
): StudioPan {
  return {
    x: pan.x - imageDx * zoom,
    y: pan.y - imageDy * zoom,
  };
}

export function thumbToImagePoint(
  thumbX: number,
  thumbY: number,
  thumbWidth: number,
  thumbHeight: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  return {
    x: (thumbX / Math.max(1, thumbWidth)) * imageWidth,
    y: (thumbY / Math.max(1, thumbHeight)) * imageHeight,
  };
}
