/**
 * Element factory helpers — create well-formed EngineElement instances with
 * sensible defaults. Centralized so tools, AI runners, and serializer all
 * agree on the shape of a "new" element.
 */

import type {
  ArrowElement,
  DiamondElement,
  EllipseElement,
  EngineElement,
  FrameElement,
  FreedrawElement,
  HeartElement,
  HexagonElement,
  ImageElement,
  LineElement,
  PlusElement,
  RectElement,
  StarElement,
  TextElement,
  TriangleElement,
} from "./types";

let _seedCounter = 1;
function nextSeed(): number {
  // roughjs accepts any positive int.
  return Math.floor(Math.random() * 2 ** 31) + (_seedCounter++ & 0xffff);
}

function baseDefaults(): Omit<RectElement, "type" | "cornerRadius"> {
  return {
    id: crypto.randomUUID(),
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    angle: 0,
    opacity: 1,
    strokeColor: "#1b1b1f",
    backgroundColor: "transparent",
    strokeWidth: 2,
    strokeStyle: "solid",
    fillStyle: "hachure",
    roughness: 1,
    seed: nextSeed(),
    groupIds: [],
    locked: false,
    z: 0,
    version: 1,
    isDeleted: false,
  };
}

export function createRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): RectElement {
  return { ...baseDefaults(), ...rect, type: "rect", cornerRadius: 0 };
}

export function createEllipse(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): EllipseElement {
  return { ...baseDefaults(), ...rect, type: "ellipse" };
}

export function createDiamond(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): DiamondElement {
  return { ...baseDefaults(), ...rect, type: "diamond" };
}

export function createTriangle(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): TriangleElement {
  return { ...baseDefaults(), ...rect, type: "triangle" };
}

export function createStar(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
  numPoints?: number;
}): StarElement {
  return { ...baseDefaults(), ...rect, type: "star", numPoints: rect.numPoints ?? 5 };
}

export function createHexagon(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): HexagonElement {
  return { ...baseDefaults(), ...rect, type: "hexagon" };
}

export function createHeart(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): HeartElement {
  return { ...baseDefaults(), ...rect, type: "heart" };
}

export function createPlus(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
  crossThickness?: number;
}): PlusElement {
  return { ...baseDefaults(), ...rect, type: "plus", crossThickness: rect.crossThickness ?? 0.3 };
}

export function createLine(a: [number, number], b: [number, number]): LineElement {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return {
    ...baseDefaults(),
    type: "line",
    x,
    y,
    width: Math.abs(b[0] - a[0]),
    height: Math.abs(b[1] - a[1]),
    points: [
      [a[0] - x, a[1] - y],
      [b[0] - x, b[1] - y],
    ],
  };
}

export function createArrow(a: [number, number], b: [number, number]): ArrowElement {
  const line = createLine(a, b);
  return {
    ...line,
    type: "arrow",
    points: line.points,
    startArrowhead: "none",
    endArrowhead: "arrow",
    arrowheadScale: 1,
    startBinding: null,
    endBinding: null,
  };
}

export function createFreedraw(points: Array<[number, number, number]>): FreedrawElement {
  if (!points.length) {
    return {
      ...baseDefaults(),
      type: "freedraw",
      points: [[0, 0, 0.5]],
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  return {
    ...baseDefaults(),
    type: "freedraw",
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    points: points.map(([px, py, pr]) => [px - minX, py - minY, pr]),
  };
}

export function createText(opts: {
  x: number;
  y: number;
  text: string;
  fontSize?: number;
  fontFamily?: string;
  width?: number;
  height?: number;
}): TextElement {
  const fontSize = opts.fontSize ?? 24;
  const lines = opts.text.split("\n");
  return {
    ...baseDefaults(),
    type: "text",
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 200,
    height: opts.height ?? Math.max(fontSize * 1.4, lines.length * fontSize * 1.4),
    strokeColor: "#1b1b1f",
    backgroundColor: "transparent",
    text: opts.text,
    fontSize,
    fontFamily: opts.fontFamily ?? "'Excalifont', 'Mali', cursive",
    fontStyle: "normal",
    textAlign: "left",
    verticalAlign: "top",
    lineHeight: 1.4,
    containerId: null,
  };
}

export function createImage(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
}): ImageElement {
  return {
    ...baseDefaults(),
    type: "image",
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    fileId: opts.fileId,
    crop: null,
    naturalWidth: opts.naturalWidth,
    naturalHeight: opts.naturalHeight,
    status: "loaded",
  };
}

export function createFrame(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
}): FrameElement {
  return {
    ...baseDefaults(),
    type: "frame",
    x: opts.x,
    y: opts.y,
    width: Math.max(opts.width, 100),
    height: Math.max(opts.height, 100),
    name: opts.name ?? "Frame",
    childIds: [],
    strokeStyle: "solid",
    strokeWidth: 2,
    strokeColor: "#94a3b8",
  };
}

/** Lightweight element-type guard for callers. */
export function isOfType<T extends EngineElement["type"]>(
  el: EngineElement,
  t: T,
): el is Extract<EngineElement, { type: T }> {
  return el.type === t;
}
