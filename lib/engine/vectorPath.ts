import type { EngineElement, VectorPathElement, VectorPathNode } from "./types";

/**
 * Finds all critical t values in (0, 1) where a cubic Bezier curve reaches an extremum.
 */
function cubicBezierExtremaT(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = 3 * (-p0 + 3 * p1 - 3 * p2 + p3);
  const b = 6 * (p0 - 2 * p1 + p2);
  const c = 3 * (p1 - p0);

  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return [];
    const t = -c / b;
    return t > 0 && t < 1 ? [t] : [];
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];

  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b + sqrtDisc) / (2 * a);
  const t2 = (-b - sqrtDisc) / (2 * a);

  const roots: number[] = [];
  if (t1 > 0 && t1 < 1) roots.push(t1);
  if (t2 > 0 && t2 < 1) roots.push(t2);
  return roots;
}

function evalCubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/**
 * Recomputes the element bounding box (x, y, width, height) to tightly enclose
 * ONLY the actual rendered shape curve body (and curve extrema), EXCLUDING the handle arms.
 * Re-normalizes node coordinates to the new bounding box.
 */
export function recomputeVectorPathBounds(
  element: VectorPathElement,
  extraPadding = 0,
): VectorPathElement {
  if (element.nodes.length < 2) return element;

  const w = Math.max(1, element.width);
  const h = Math.max(1, element.height);
  const pts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < element.nodes.length; i++) {
    const curr = element.nodes[i];
    const next = element.nodes[(i + 1) % element.nodes.length];
    const p0 = { x: element.x + curr.x * w, y: element.y + curr.y * h };
    pts.push(p0);

    if (!element.closed && i === element.nodes.length - 1) {
      break;
    }

    const p3 = { x: element.x + next.x * w, y: element.y + next.y * h };
    pts.push(p3);

    if (curr.out || next.in) {
      const out = curr.out ?? [0, 0];
      const incoming = next.in ?? [0, 0];
      const p1 = { x: p0.x + out[0] * w, y: p0.y + out[1] * h };
      const p2 = { x: p3.x + incoming[0] * w, y: p3.y + incoming[1] * h };

      // Find extrema on X
      const rootsX = cubicBezierExtremaT(p0.x, p1.x, p2.x, p3.x);
      for (const t of rootsX) {
        pts.push({
          x: evalCubicBezier(p0.x, p1.x, p2.x, p3.x, t),
          y: evalCubicBezier(p0.y, p1.y, p2.y, p3.y, t),
        });
      }

      // Find extrema on Y
      const rootsY = cubicBezierExtremaT(p0.y, p1.y, p2.y, p3.y);
      for (const t of rootsY) {
        pts.push({
          x: evalCubicBezier(p0.x, p1.x, p2.x, p3.x, t),
          y: evalCubicBezier(p0.y, p1.y, p2.y, p3.y, t),
        });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const strokePad = extraPadding;
  const padMinX = minX - strokePad;
  const padMinY = minY - strokePad;
  const padMaxX = maxX + strokePad;
  const padMaxY = maxY + strokePad;
  const newWidth = Math.max(1, padMaxX - padMinX);
  const newHeight = Math.max(1, padMaxY - padMinY);

  const newNodes: VectorPathNode[] = element.nodes.map((node) => {
    const worldX = element.x + node.x * w;
    const worldY = element.y + node.y * h;
    return {
      x: (worldX - padMinX) / newWidth,
      y: (worldY - padMinY) / newHeight,
      in: node.in ? [(node.in[0] * w) / newWidth, (node.in[1] * h) / newHeight] : undefined,
      out: node.out ? [(node.out[0] * w) / newWidth, (node.out[1] * h) / newHeight] : undefined,
    };
  });

  return {
    ...element,
    x: padMinX,
    y: padMinY,
    width: newWidth,
    height: newHeight,
    nodes: newNodes,
  };
}

/**
 * Smooths all nodes in a vector path using Catmull-Rom style tangent heuristics.
 */
export function smoothVectorPathNodes(
  nodes: VectorPathNode[],
  amount: number,
  closed: boolean,
): VectorPathNode[] {
  const strength = Math.max(0, Math.min(1, amount)) / 6;
  if (nodes.length < 3 || strength === 0) {
    return nodes.map(({ in: _in, out: _out, ...node }) => node);
  }
  return nodes.map((node, index) => {
    const previous = nodes[index - 1] ?? (closed ? nodes.at(-1)! : node);
    const next = nodes[index + 1] ?? (closed ? nodes[0] : node);
    const handle: [number, number] = [
      (next.x - previous.x) * strength,
      (next.y - previous.y) * strength,
    ];
    return {
      ...node,
      in: !closed && index === 0 ? undefined : [-handle[0], -handle[1]],
      out: !closed && index === nodes.length - 1 ? undefined : handle,
    };
  });
}

/**
 * Moves an individual anchor node in normalized space (0..1).
 */
export function moveVectorPathNode(
  nodes: VectorPathNode[],
  index: number,
  point: { x: number; y: number },
): VectorPathNode[] {
  return nodes.map((node, nodeIndex) =>
    nodeIndex === index
      ? {
          ...node,
          x: point.x,
          y: point.y,
        }
      : node,
  );
}

/**
 * Inserts a new node at a specific index.
 */
export function insertNodeAt(
  nodes: VectorPathNode[],
  index: number,
  point: { x: number; y: number },
): VectorPathNode[] {
  const newNode: VectorPathNode = { x: point.x, y: point.y };
  const next = [...nodes];
  next.splice(index, 0, newNode);
  return next;
}

/**
 * Removes a node by index. Keeps at least 2 nodes.
 */
export function removeNodeAt(nodes: VectorPathNode[], index: number): VectorPathNode[] {
  if (nodes.length <= 2) return nodes;
  return nodes.filter((_, idx) => idx !== index);
}

/**
 * Sets node type: "smooth" (creates tangent handles) or "corner" (sharp vertex).
 */
export function setNodeType(
  nodes: VectorPathNode[],
  index: number,
  type: "smooth" | "corner",
): VectorPathNode[] {
  return nodes.map((node, idx) => {
    if (idx !== index) return node;
    if (type === "corner") {
      const { in: _in, out: _out, ...rest } = node;
      return rest;
    }
    const prev = nodes[idx - 1] ?? nodes[nodes.length - 1] ?? node;
    const next = nodes[idx + 1] ?? nodes[0] ?? node;
    const strength = 0.15;
    const hx = (next.x - prev.x) * strength;
    const hy = (next.y - prev.y) * strength;
    return {
      ...node,
      in: [-hx, -hy],
      out: [hx, hy],
    };
  });
}

/**
 * Toggles a node between sharp corner and smooth curve.
 */
export function toggleNodeSmoothness(nodes: VectorPathNode[], index: number): VectorPathNode[] {
  const target = nodes[index];
  if (!target) return nodes;
  const isSmooth = Boolean(target.in || target.out);
  return setNodeType(nodes, index, isSmooth ? "corner" : "smooth");
}

/**
 * Sets the tangent handle of a node.
 * If symmetric is true, updates the opposite handle symmetrically (standard Illustrator default).
 * If symmetric is false (Alt/Option held), only modifies the active handle (broken corner handle).
 */
export function setNodeHandle(
  nodes: VectorPathNode[],
  index: number,
  handleType: "in" | "out",
  delta: [number, number],
  symmetric = true,
): VectorPathNode[] {
  return nodes.map((node, idx) => {
    if (idx !== index) return node;

    if (handleType === "in") {
      return {
        ...node,
        in: delta,
        out: symmetric ? [-delta[0], -delta[1]] : node.out,
      };
    }
    return {
      ...node,
      out: delta,
      in: symmetric ? [-delta[0], -delta[1]] : node.in,
    };
  });
}

/**
 * Converts any standard shape or line element into an editable VectorPathElement with precise nodes.
 */
export function convertElementToVectorPath(element: EngineElement): VectorPathElement | null {
  if (element.type === "path") return element;

  let nodes: VectorPathNode[] = [];
  let closed = true;

  switch (element.type) {
    case "rect": {
      nodes = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      closed = true;
      break;
    }
    case "ellipse": {
      // Cubic bezier constant for circle: 4/3 * (sqrt(2) - 1) = 0.55228475 * 0.5 = ~0.27614
      const k = 0.27614237;
      nodes = [
        { x: 0.5, y: 0, in: [-k, 0], out: [k, 0] },
        { x: 1, y: 0.5, in: [0, -k], out: [0, k] },
        { x: 0.5, y: 1, in: [k, 0], out: [-k, 0] },
        { x: 0, y: 0.5, in: [0, k], out: [0, -k] },
      ];
      closed = true;
      break;
    }
    case "diamond": {
      nodes = [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ];
      closed = true;
      break;
    }
    case "triangle": {
      nodes = [
        { x: 0.5, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      closed = true;
      break;
    }
    case "star": {
      const numPoints = element.numPoints ?? 5;
      const totalSteps = numPoints * 2;
      const outerR = 0.5;
      const innerR = 0.22;
      for (let i = 0; i < totalSteps; i++) {
        const angle = (i * Math.PI * 2) / totalSteps - Math.PI / 2;
        const r = i % 2 === 0 ? outerR : innerR;
        nodes.push({
          x: Math.max(0, Math.min(1, 0.5 + Math.cos(angle) * r)),
          y: Math.max(0, Math.min(1, 0.5 + Math.sin(angle) * r)),
        });
      }
      closed = true;
      break;
    }
    case "hexagon": {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2;
        nodes.push({
          x: Math.max(0, Math.min(1, 0.5 + Math.cos(angle) * 0.5)),
          y: Math.max(0, Math.min(1, 0.5 + Math.sin(angle) * 0.5)),
        });
      }
      closed = true;
      break;
    }
    case "heart": {
      nodes = [
        { x: 0.5, y: 0.28, in: [-0.15, -0.22], out: [0.15, -0.22] },
        { x: 0.95, y: 0.35, in: [0, -0.15], out: [0, 0.2] },
        { x: 0.5, y: 0.96 },
        { x: 0.05, y: 0.35, in: [0, 0.2], out: [0, -0.15] },
      ];
      closed = true;
      break;
    }
    case "plus": {
      const t = (element.crossThickness ?? 0.3) / 2;
      const a = 0.5 - t;
      const b = 0.5 + t;
      nodes = [
        { x: a, y: 0 },
        { x: b, y: 0 },
        { x: b, y: a },
        { x: 1, y: a },
        { x: 1, y: b },
        { x: b, y: b },
        { x: b, y: 1 },
        { x: a, y: 1 },
        { x: a, y: b },
        { x: 0, y: b },
        { x: 0, y: a },
        { x: a, y: a },
      ];
      closed = true;
      break;
    }
    case "line":
    case "arrow": {
      const w = Math.max(1, element.width);
      const h = Math.max(1, element.height);
      nodes = element.points.map(([px, py]) => ({
        x: Math.max(0, Math.min(1, px / w)),
        y: Math.max(0, Math.min(1, py / h)),
      }));
      closed = false;
      break;
    }
    case "freedraw": {
      const w = Math.max(1, element.width);
      const h = Math.max(1, element.height);
      const raw = element.points;
      const step = Math.max(1, Math.floor(raw.length / 24));
      const sampled = raw.filter((_, i) => i % step === 0 || i === raw.length - 1);
      nodes = sampled.map(([px, py]) => ({
        x: Math.max(0, Math.min(1, (px - element.x) / w)),
        y: Math.max(0, Math.min(1, (py - element.y) / h)),
      }));
      closed = false;
      break;
    }
    default:
      return null;
  }

  const pathEl: VectorPathElement = {
    id: element.id,
    type: "path",
    name: `${element.name ?? element.type} Path`,
    x: element.x,
    y: element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
    angle: element.angle ?? 0,
    opacity: element.opacity ?? 1,
    strokeColor: element.strokeColor ?? "#1e293b",
    strokeWidth: element.strokeWidth ?? 2,
    strokeStyle: element.strokeStyle ?? "solid",
    backgroundColor: element.backgroundColor ?? "transparent",
    fillStyle: element.fillStyle ?? "solid",
    roughness: element.roughness ?? 0,
    seed: element.seed ?? 1,
    groupIds: element.groupIds ?? [],
    locked: element.locked ?? false,
    visible: element.visible ?? true,
    z: element.z ?? 0,
    version: (element.version ?? 0) + 1,
    isDeleted: false,
    nodes,
    closed,
    fillRule: "nonzero",
    builderKind: element.builderKind,
    layoutMode: element.layoutMode,
  };

  return recomputeVectorPathBounds(pathEl);
}
