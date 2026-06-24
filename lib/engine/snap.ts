/**
 * Smart snap helpers.
 *
 * For Tier 1 we snap a point or bbox to:
 *   - slide edges (0, SLIDE_W, SLIDE_H)
 *   - slide centerlines (SLIDE_W/2, SLIDE_H/2)
 *   - other selection-excluded element edges + centers
 *
 * Snap returns deltas (dx, dy) and active guide lines (for visual rendering).
 * The threshold is in screen px (not world px), so callers must divide by
 * the current view scale before calling.
 */

import { elementWorldBBox, type Rect } from "./bounds";
import { type EngineElement, SLIDE_H, SLIDE_W } from "./types";

export type Guide =
  | { axis: "x" | "y"; at: number; from: number; to: number }
  | { axis: "gap_x"; y: number; from: number; to: number }
  | { axis: "gap_y"; x: number; from: number; to: number };
export type SnapResult = { dx: number; dy: number; guides: Guide[] };

type Cand = {
  tgt: number;
  src?: number;
  rect?: Rect;
  sourceIndex?: number;
  isGap?: boolean;
  gapFrom?: number;
  gapTo?: number;
  gapPos?: number;
};

export function snapBBox(bbox: Rect, others: EngineElement[], thresholdWorld: number): SnapResult {
  // Build candidate target lines + (optional) source rect for guide bounds.
  const targetsX: Cand[] = [{ tgt: 0 }, { tgt: SLIDE_W / 2 }, { tgt: SLIDE_W }];
  const targetsY: Cand[] = [{ tgt: 0 }, { tgt: SLIDE_H / 2 }, { tgt: SLIDE_H }];

  const bboxes = others.filter((el) => !el.isDeleted).map(elementWorldBBox);

  for (const b of bboxes) {
    targetsX.push(
      { tgt: b.x, rect: b },
      { tgt: b.x + b.width / 2, rect: b },
      { tgt: b.x + b.width, rect: b },
    );
    targetsY.push(
      { tgt: b.y, rect: b },
      { tgt: b.y + b.height / 2, rect: b },
      { tgt: b.y + b.height, rect: b },
    );
  }

  // Equal spacing gaps
  for (let i = 0; i < bboxes.length; i++) {
    for (let j = i + 1; j < bboxes.length; j++) {
      const b1 = bboxes[i];
      const b2 = bboxes[j];

      // X-axis gaps (require Y overlap)
      const overlapY = Math.max(
        0,
        Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y),
      );
      if (overlapY > 0) {
        const leftBox = b1.x < b2.x ? b1 : b2;
        const rightBox = b1.x < b2.x ? b2 : b1;
        const gap = rightBox.x - (leftBox.x + leftBox.width);
        if (gap > 0 && gap < 800) {
          const cy = (Math.max(b1.y, b2.y) + Math.min(b1.y + b1.height, b2.y + b2.height)) / 2;
          // Target: place bbox to the right of rightBox
          targetsX.push({
            tgt: rightBox.x + rightBox.width + gap,
            sourceIndex: 0,
            isGap: true,
            gapPos: cy,
            gapFrom: rightBox.x + rightBox.width,
            gapTo: rightBox.x + rightBox.width + gap,
          });
          // Target: place bbox to the left of leftBox
          targetsX.push({
            tgt: leftBox.x - gap,
            sourceIndex: 2,
            isGap: true,
            gapPos: cy,
            gapFrom: leftBox.x - gap,
            gapTo: leftBox.x,
          });
        }
      }

      // Y-axis gaps (require X overlap)
      const overlapX = Math.max(
        0,
        Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x),
      );
      if (overlapX > 0) {
        const topBox = b1.y < b2.y ? b1 : b2;
        const bottomBox = b1.y < b2.y ? b2 : b1;
        const gap = bottomBox.y - (topBox.y + topBox.height);
        if (gap > 0 && gap < 800) {
          const cx = (Math.max(b1.x, b2.x) + Math.min(b1.x + b1.width, b2.x + b2.width)) / 2;
          targetsY.push({
            tgt: bottomBox.y + bottomBox.height + gap,
            sourceIndex: 0,
            isGap: true,
            gapPos: cx,
            gapFrom: bottomBox.y + bottomBox.height,
            gapTo: bottomBox.y + bottomBox.height + gap,
          });
          targetsY.push({
            tgt: topBox.y - gap,
            sourceIndex: 2,
            isGap: true,
            gapPos: cx,
            gapFrom: topBox.y - gap,
            gapTo: topBox.y,
          });
        }
      }
    }
  }
  const sourcesX = [bbox.x, bbox.x + bbox.width / 2, bbox.x + bbox.width];
  const sourcesY = [bbox.y, bbox.y + bbox.height / 2, bbox.y + bbox.height];

  let bestDX = 0;
  let bestErrX = thresholdWorld + 1;
  let bestX: Cand | null = null;
  for (let i = 0; i < sourcesX.length; i++) {
    const s = sourcesX[i];
    for (const t of targetsX) {
      if (t.sourceIndex !== undefined && t.sourceIndex !== i) continue;
      const err = Math.abs(s - t.tgt);
      if (err < bestErrX) {
        bestErrX = err;
        bestDX = t.tgt - s;
        bestX = t;
      }
    }
  }
  let bestDY = 0;
  let bestErrY = thresholdWorld + 1;
  let bestY: Cand | null = null;
  for (let i = 0; i < sourcesY.length; i++) {
    const s = sourcesY[i];
    for (const t of targetsY) {
      if (t.sourceIndex !== undefined && t.sourceIndex !== i) continue;
      const err = Math.abs(s - t.tgt);
      if (err < bestErrY) {
        bestErrY = err;
        bestDY = t.tgt - s;
        bestY = t;
      }
    }
  }

  const guides: Guide[] = [];
  if (bestX && bestErrX <= thresholdWorld) {
    if (bestX.isGap) {
      guides.push({ axis: "gap_x", y: bestX.gapPos!, from: bestX.gapFrom!, to: bestX.gapTo! });
    } else {
      const r = bestX.rect;
      if (r) {
        const top = Math.min(bbox.y, r.y);
        const bot = Math.max(bbox.y + bbox.height, r.y + r.height);
        guides.push({ axis: "x", at: bestX.tgt, from: top, to: bot });
      } else {
        guides.push({ axis: "x", at: bestX.tgt, from: 0, to: SLIDE_H });
      }
    }
  } else {
    bestDX = 0;
  }
  if (bestY && bestErrY <= thresholdWorld) {
    if (bestY.isGap) {
      guides.push({ axis: "gap_y", x: bestY.gapPos!, from: bestY.gapFrom!, to: bestY.gapTo! });
    } else {
      const r = bestY.rect;
      if (r) {
        const left = Math.min(bbox.x, r.x);
        const right = Math.max(bbox.x + bbox.width, r.x + r.width);
        guides.push({ axis: "y", at: bestY.tgt, from: left, to: right });
      } else {
        guides.push({ axis: "y", at: bestY.tgt, from: 0, to: SLIDE_W });
      }
    }
  } else {
    bestDY = 0;
  }
  return { dx: bestDX, dy: bestDY, guides };
}

/**
 * Snap a resize: only the *moving* edges are candidate sources, so a non-moving
 * anchor edge stays put. Used by the transformer when scaling a multi-select
 * AABB. Returns deltas (dRight, dBottom) and guides; callers apply them to
 * width/height of the new bbox (and adjust x/y if the moving edge is left/top
 * by storing the delta with sign accordingly).
 */
export function snapResize(
  bbox: Rect,
  edges: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean },
  others: EngineElement[],
  thresholdWorld: number,
): SnapResult {
  const targetsX: Cand[] = [{ tgt: 0 }, { tgt: SLIDE_W / 2 }, { tgt: SLIDE_W }];
  const targetsY: Cand[] = [{ tgt: 0 }, { tgt: SLIDE_H / 2 }, { tgt: SLIDE_H }];
  for (const el of others) {
    if (el.isDeleted) continue;
    const b = elementWorldBBox(el);
    targetsX.push(
      { src: 0, tgt: b.x, rect: b },
      { src: 0, tgt: b.x + b.width / 2, rect: b },
      { src: 0, tgt: b.x + b.width, rect: b },
    );
    targetsY.push(
      { src: 0, tgt: b.y, rect: b },
      { src: 0, tgt: b.y + b.height / 2, rect: b },
      { src: 0, tgt: b.y + b.height, rect: b },
    );
  }
  const sourcesX: number[] = [];
  if (edges.left) sourcesX.push(bbox.x);
  if (edges.right) sourcesX.push(bbox.x + bbox.width);
  const sourcesY: number[] = [];
  if (edges.top) sourcesY.push(bbox.y);
  if (edges.bottom) sourcesY.push(bbox.y + bbox.height);

  let bestDX = 0;
  let bestErrX = thresholdWorld + 1;
  let bestX: Cand | null = null;
  for (const s of sourcesX) {
    for (const t of targetsX) {
      const err = Math.abs(s - t.tgt);
      if (err < bestErrX) {
        bestErrX = err;
        bestDX = t.tgt - s;
        bestX = { src: s, tgt: t.tgt, rect: t.rect };
      }
    }
  }
  let bestDY = 0;
  let bestErrY = thresholdWorld + 1;
  let bestY: Cand | null = null;
  for (const s of sourcesY) {
    for (const t of targetsY) {
      const err = Math.abs(s - t.tgt);
      if (err < bestErrY) {
        bestErrY = err;
        bestDY = t.tgt - s;
        bestY = { src: s, tgt: t.tgt, rect: t.rect };
      }
    }
  }

  const guides: Guide[] = [];
  if (bestX && bestErrX <= thresholdWorld) {
    const r = bestX.rect;
    if (r) {
      const top = Math.min(bbox.y, r.y);
      const bot = Math.max(bbox.y + bbox.height, r.y + r.height);
      guides.push({ axis: "x", at: bestX.tgt, from: top, to: bot });
    } else {
      guides.push({ axis: "x", at: bestX.tgt, from: 0, to: SLIDE_H });
    }
  } else {
    bestDX = 0;
  }
  if (bestY && bestErrY <= thresholdWorld) {
    const r = bestY.rect;
    if (r) {
      const left = Math.min(bbox.x, r.x);
      const right = Math.max(bbox.x + bbox.width, r.x + r.width);
      guides.push({ axis: "y", at: bestY.tgt, from: left, to: right });
    } else {
      guides.push({ axis: "y", at: bestY.tgt, from: 0, to: SLIDE_W });
    }
  } else {
    bestDY = 0;
  }
  return { dx: bestDX, dy: bestDY, guides };
}
