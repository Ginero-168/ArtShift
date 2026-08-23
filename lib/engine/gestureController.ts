import { unionBBox } from "./bounds";
import { getInteractiveElements } from "./layers";
import {
  applySelection,
  isSelectionModifierPressed,
  type SelectionModifierEvent,
  shouldPreserveMultiSelectionForDrag,
} from "./selection";
import type { Guide } from "./snap";
import { snapBBox } from "./snap";
import type { EngineElement, EngineSlide } from "./types";

export type GesturePoint = { x: number; y: number };

export type ObjectSelectionResolution = {
  ids: string[];
  /** The object group to reveal when a multi-selection receives a click-only drag. */
  clickSelection?: string[];
};

/**
 * Editor gesture seam for object selection. The canvas only supplies hit ids
 * and modifier state; this module owns Photoshop/Figma-style additive and
 * multi-selection preservation rules.
 */
export function resolveObjectPointerSelection(
  current: ReadonlySet<string>,
  hitId: string,
  groupIds: readonly string[],
  event: SelectionModifierEvent,
): ObjectSelectionResolution {
  const additive = isSelectionModifierPressed(event);
  const preserve = shouldPreserveMultiSelectionForDrag(current, hitId, additive);
  return {
    ids: Array.from(preserve ? current : applySelection(current, groupIds, additive)),
    clickSelection: preserve ? [...groupIds] : undefined,
  };
}

/** Resolve marquee completion without exposing the store's Set implementation to the canvas. */
export function resolveMarqueeSelection(
  current: ReadonlySet<string>,
  hitIds: readonly string[],
  additive: boolean,
): string[] {
  if (!additive) return [...hitIds];
  const next = new Set(current);
  for (const id of hitIds) next.add(id);
  return Array.from(next);
}

export function isMeaningfulMove(
  start: GesturePoint,
  current: GesturePoint,
  threshold: number,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export type MovePreview = {
  patches: Array<{ id: string; patch: { x: number; y: number } }>;
  guides: Guide[];
};

/** Calculate a multi-object move and its snap guides without touching React or Zustand. */
export function calculateMovePreview(input: {
  start: GesturePoint;
  current: GesturePoint;
  origins: ReadonlyMap<string, { x: number; y: number }>;
  slide: EngineSlide;
  snapGrid: number | null;
  snapThreshold: number;
}): MovePreview {
  let dx = input.current.x - input.start.x;
  let dy = input.current.y - input.start.y;
  const moving = input.slide.elements.filter((element) => input.origins.has(element.id));
  const others = getInteractiveElements(input.slide).filter(
    (element) => !input.origins.has(element.id),
  );
  const movedNow = moving.map((element) => {
    const origin = input.origins.get(element.id)!;
    return { ...element, x: origin.x + dx, y: origin.y + dy } as EngineElement;
  });
  const bbox = unionBBox(movedNow);
  if (bbox) {
    if (input.snapGrid) {
      const targetX = Math.round(bbox.x / input.snapGrid) * input.snapGrid;
      const targetY = Math.round(bbox.y / input.snapGrid) * input.snapGrid;
      dx += targetX - bbox.x;
      dy += targetY - bbox.y;
    } else {
      const snap = snapBBox(bbox, others, input.snapThreshold);
      dx += snap.dx;
      dy += snap.dy;
      return {
        guides: snap.guides,
        patches: Array.from(input.origins.entries()).map(([id, origin]) => ({
          id,
          patch: { x: origin.x + dx, y: origin.y + dy },
        })),
      };
    }
  }
  return {
    guides: [],
    patches: Array.from(input.origins.entries()).map(([id, origin]) => ({
      id,
      patch: { x: origin.x + dx, y: origin.y + dy },
    })),
  };
}
