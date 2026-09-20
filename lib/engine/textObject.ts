/**
 * Illustrator-style text objects for the design canvas.
 *
 * Point text (click): the bounding box hugs glyphs and grows/shrinks as the
 * user types. Area text / Text Frame (drag): copy wraps inside a fixed frame.
 * Selection-tool resize scales glyphs with the box, like transforming an image.
 */

import { createRect, createText } from "./factory";
import { isMeaningfulMove } from "./gestureController";
import { constrainShapeDrag } from "./shapeDrag";
import { autosizePointText, getTextSafePadding, isPointText, resolveTextMode } from "./textLayout";
import type { RectElement, TextElement, TextMode } from "./types";

/** Screen-pixel drag distance that separates a click (point) from a frame. */
export const TEXT_CREATE_DRAG_THRESHOLD_PX = 8;

export type TextGesturePoint = { x: number; y: number };

export function classifyTextCreateGesture(
  start: TextGesturePoint,
  current: TextGesturePoint,
  threshold: number = TEXT_CREATE_DRAG_THRESHOLD_PX,
): TextMode {
  return isMeaningfulMove(start, current, threshold) ? "area" : "point";
}

export function createTextFrameDraft(
  start: TextGesturePoint,
  current: TextGesturePoint,
  lockAspect = false,
): RectElement {
  const box = textFrameBox(start, current, lockAspect);
  const draft = createRect(box);
  draft.backgroundColor = "transparent";
  draft.fillStyle = "solid";
  draft.strokeColor = "#6366f1";
  draft.strokeWidth = 1;
  draft.roughness = 0;
  draft.name = "Text Frame";
  return draft;
}

export function createTextFromGesture(
  start: TextGesturePoint,
  current: TextGesturePoint,
  threshold: number = TEXT_CREATE_DRAG_THRESHOLD_PX,
  lockAspect = false,
): TextElement {
  if (classifyTextCreateGesture(start, current, threshold) === "point") {
    return createText({
      x: start.x,
      y: start.y,
      text: "",
      textMode: "point",
    });
  }
  const box = textFrameBox(start, current, lockAspect);
  return createText({
    ...box,
    text: "",
    textMode: "area",
  });
}

/**
 * Scale typography with the selection box so glyphs fill the new frame
 * (Illustrator Selection tool / image-like transform).
 */
export function scaleTextWithBox(
  element: TextElement,
  box: { x: number; y: number; width: number; height: number },
): Partial<TextElement> {
  const sx = box.width / Math.max(1, element.width);
  const sy = box.height / Math.max(1, element.height);
  const scale = Math.max(0.01, Math.sqrt(Math.max(1e-6, Math.abs(sx * sy))));
  const fontSize = Math.max(1, element.fontSize * scale);
  const requestedPadding = (element.padding ?? 0) * scale;
  return {
    x: box.x,
    y: box.y,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
    fontSize,
    padding: getTextSafePadding(fontSize, requestedPadding),
  };
}

/**
 * Apply typing / style patches. Point text hugs content unless the patch is an
 * explicit geometry transform (width + height together, as sent by the transformer).
 * Area text keeps its frame and wraps inside it.
 */
export function normalizeTextPatch(
  element: TextElement,
  patch: Partial<TextElement>,
): Partial<TextElement> {
  const next = { ...element, ...patch } as TextElement;
  const explicitBox = patch.width !== undefined && patch.height !== undefined;
  if (isPointText(next) && !explicitBox) {
    const sized = autosizePointText(next);
    return {
      ...patch,
      width: sized.width,
      height: sized.height,
      padding: sized.padding,
    };
  }
  if (patch.fontSize !== undefined && patch.padding === undefined) {
    return {
      ...patch,
      padding: getTextSafePadding(patch.fontSize, next.padding ?? 0),
    };
  }
  return patch;
}

export { isPointText, resolveTextMode };

function textFrameBox(
  start: TextGesturePoint,
  current: TextGesturePoint,
  lockAspect: boolean,
): { x: number; y: number; width: number; height: number } {
  const constrained = constrainShapeDrag("text", start, current, lockAspect);
  const x = Math.min(constrained.start.x, constrained.current.x);
  const y = Math.min(constrained.start.y, constrained.current.y);
  return {
    x,
    y,
    width: Math.max(4, Math.abs(constrained.current.x - constrained.start.x)),
    height: Math.max(4, Math.abs(constrained.current.y - constrained.start.y)),
  };
}
