export type ShapeDragPoint = { x: number; y: number };

const SQUARE_SHAPE_TOOLS = new Set([
  "rect",
  "ellipse",
  "diamond",
  "triangle",
  "star",
  "hexagon",
  "heart",
  "plus",
  "frame",
]);

/** Constrain shape drag geometry to a 1:1 square while Shift is held. */
export function constrainShapeDrag(
  tool: string,
  start: ShapeDragPoint,
  current: ShapeDragPoint,
  lockAspect: boolean,
): { start: ShapeDragPoint; current: ShapeDragPoint } {
  if (!lockAspect || !SQUARE_SHAPE_TOOLS.has(tool)) return { start, current };

  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const signedX = dx < 0 ? -size : size;
  const signedY = dy < 0 ? -size : size;

  return {
    start,
    current: { x: start.x + signedX, y: start.y + signedY },
  };
}
