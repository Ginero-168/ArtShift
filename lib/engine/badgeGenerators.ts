/**
 * Parametric Advertising Badge & Ribbon Generators for Book Marketing.
 * Outputs pure VectorPathElement objects.
 */

import { createVectorPath } from "./factory";
import type { VectorPathElement, VectorPathNode } from "./types";

export type BadgeOptionDefaults = {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
};

/**
 * Creates a Starburst / Explosion Seal (e.g. 12, 16, or 24 points).
 * Used for "ลด 50%", "Flash Sale", "Best Offer" badges.
 */
export function createStarburstBadge(
  opts: BadgeOptionDefaults & { points?: number; innerRadiusRatio?: number },
): VectorPathElement {
  const {
    x,
    y,
    width,
    height,
    points = 16,
    innerRadiusRatio = 0.78,
    strokeColor = "#b91c1c",
    backgroundColor = "#ef4444",
  } = opts;

  const nodes: VectorPathNode[] = [];
  const cx = 0.5;
  const cy = 0.5;
  const outerRx = 0.5;
  const outerRy = 0.5;
  const innerRx = outerRx * innerRadiusRatio;
  const innerRy = outerRy * innerRadiusRatio;

  const totalSteps = points * 2;
  const angleStep = (Math.PI * 2) / totalSteps;

  for (let i = 0; i < totalSteps; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const isOuter = i % 2 === 0;
    const rx = isOuter ? outerRx : innerRx;
    const ry = isOuter ? outerRy : innerRy;

    const nx = cx + Math.cos(angle) * rx;
    const ny = cy + Math.sin(angle) * ry;

    nodes.push({
      x: Math.max(0, Math.min(1, nx)),
      y: Math.max(0, Math.min(1, ny)),
    });
  }

  const el = createVectorPath(
    nodes.map((n) => ({ x: n.x * width + x, y: n.y * height + y })),
    true,
  );

  return {
    ...el,
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    nodes,
    closed: true,
  };
}

/**
 * Creates a Folded Ribbon Banner with notched tails.
 * Used for "Bestseller", "ขายดีอันดับ 1", "Recommended".
 */
export function createRibbonBanner(
  opts: BadgeOptionDefaults & { notchRatio?: number },
): VectorPathElement {
  const {
    x,
    y,
    width,
    height,
    notchRatio = 0.15,
    strokeColor = "#b45309",
    backgroundColor = "#f59e0b",
  } = opts;

  // Normalized coords (0..1)
  const nr = notchRatio;
  const nodes: VectorPathNode[] = [
    { x: 0, y: 0 }, // Top-left
    { x: 1, y: 0 }, // Top-right
    { x: 1 - nr, y: 0.5 }, // Right notch center
    { x: 1, y: 1 }, // Bottom-right
    { x: 0, y: 1 }, // Bottom-left
    { x: nr, y: 0.5 }, // Left notch center
  ];

  const el = createVectorPath(
    nodes.map((n) => ({ x: n.x * width + x, y: n.y * height + y })),
    true,
  );

  return {
    ...el,
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    nodes,
    closed: true,
  };
}

/**
 * Creates a Price Tag Badge with chamfered top corner.
 */
export function createPriceTagBadge(
  opts: BadgeOptionDefaults & { chamferRatio?: number },
): VectorPathElement {
  const {
    x,
    y,
    width,
    height,
    chamferRatio = 0.25,
    strokeColor = "#1e293b",
    backgroundColor = "#3b82f6",
  } = opts;

  const c = chamferRatio;
  const nodes: VectorPathNode[] = [
    { x: c, y: 0 }, // Top-left chamfer
    { x: 1, y: 0 }, // Top-right
    { x: 1, y: 1 }, // Bottom-right
    { x: 0, y: 1 }, // Bottom-left
    { x: 0, y: c }, // Mid-left chamfer
  ];

  const el = createVectorPath(
    nodes.map((n) => ({ x: n.x * width + x, y: n.y * height + y })),
    true,
  );

  return {
    ...el,
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    nodes,
    closed: true,
  };
}

/**
 * Creates a Scalloped Award Seal with rounded lobes.
 * Used for "การันตีคุณภาพ", "Staff Pick", "Editor's Choice".
 */
export function createScallopedSeal(
  opts: BadgeOptionDefaults & { lobes?: number },
): VectorPathElement {
  const {
    x,
    y,
    width,
    height,
    lobes = 12,
    strokeColor = "#047857",
    backgroundColor = "#10b981",
  } = opts;

  const nodes: VectorPathNode[] = [];
  const cx = 0.5;
  const cy = 0.5;
  const r = 0.48;
  const totalSteps = lobes;
  const angleStep = (Math.PI * 2) / totalSteps;
  const handleStrength = 0.12;

  for (let i = 0; i < totalSteps; i++) {
    const angle = i * angleStep - Math.PI / 2;
    const nx = cx + Math.cos(angle) * r;
    const ny = cy + Math.sin(angle) * r;

    // Tangent perpendicular vector for smooth bezier curvature
    const tx = -Math.sin(angle) * handleStrength;
    const ty = Math.cos(angle) * handleStrength;

    nodes.push({
      x: Math.max(0, Math.min(1, nx)),
      y: Math.max(0, Math.min(1, ny)),
      in: [-tx, -ty],
      out: [tx, ty],
    });
  }

  const el = createVectorPath(
    nodes.map((n) => ({ x: n.x * width + x, y: n.y * height + y })),
    true,
  );

  return {
    ...el,
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    nodes,
    closed: true,
  };
}

/**
 * Creates a Bookmark Ribbon Hanging Tag.
 */
export function createBookmarkRibbon(
  opts: BadgeOptionDefaults & { vDepthRatio?: number },
): VectorPathElement {
  const {
    x,
    y,
    width,
    height,
    vDepthRatio = 0.25,
    strokeColor = "#4338ca",
    backgroundColor = "#6366f1",
  } = opts;

  const v = vDepthRatio;
  const nodes: VectorPathNode[] = [
    { x: 0, y: 0 }, // Top-left
    { x: 1, y: 0 }, // Top-right
    { x: 1, y: 1 }, // Bottom-right
    { x: 0.5, y: 1 - v }, // Bottom V-notch
    { x: 0, y: 1 }, // Bottom-left
  ];

  const el = createVectorPath(
    nodes.map((n) => ({ x: n.x * width + x, y: n.y * height + y })),
    true,
  );

  return {
    ...el,
    x,
    y,
    width,
    height,
    strokeColor,
    backgroundColor,
    fillStyle: "solid",
    nodes,
    closed: true,
  };
}
