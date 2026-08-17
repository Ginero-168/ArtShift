/**
 * Element factory helpers — create well-formed EngineElement instances with
 * sensible defaults. Centralized so tools, AI runners, and serializer all
 * agree on the shape of a "new" element.
 */

import { getTextMinimumHeight, getTextSafePadding } from "./textLayout";
import type {
  ArrowElement,
  BookMockupElement,
  DiamondElement,
  EllipseElement,
  EngineElement,
  FrameElement,
  FrameMaskShape,
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
  VectorPathElement,
} from "./types";
import { recomputeVectorPathBounds } from "./vectorPath";

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
    visible: true,
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

export function createVectorPath(
  points: Array<{ x: number; y: number }>,
  closed = false,
): VectorPathElement {
  const safePoints = points.length
    ? points
    : [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
  const minX = Math.min(...safePoints.map((point) => point.x));
  const minY = Math.min(...safePoints.map((point) => point.y));
  const maxX = Math.max(...safePoints.map((point) => point.x));
  const maxY = Math.max(...safePoints.map((point) => point.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    ...baseDefaults(),
    type: "path",
    x: minX,
    y: minY,
    width,
    height,
    nodes: safePoints.map((point) => ({
      x: (point.x - minX) / width,
      y: (point.y - minY) / height,
    })),
    closed,
    fillRule: "nonzero",
    backgroundColor: closed ? "#dbeafe" : "transparent",
    fillStyle: "solid",
    roughness: 0,
  };
}

export function createVectorPathFromWorldNodes(
  worldNodes: Array<{ x: number; y: number; in?: [number, number]; out?: [number, number] }>,
  closed = false,
): VectorPathElement {
  const safeNodes = worldNodes.length
    ? worldNodes
    : [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
  const minX = Math.min(...safeNodes.map((n) => n.x));
  const minY = Math.min(...safeNodes.map((n) => n.y));
  const maxX = Math.max(...safeNodes.map((n) => n.x));
  const maxY = Math.max(...safeNodes.map((n) => n.y));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const pathEl: VectorPathElement = {
    ...baseDefaults(),
    type: "path",
    x: minX,
    y: minY,
    width,
    height,
    nodes: safeNodes.map((node) => ({
      x: (node.x - minX) / width,
      y: (node.y - minY) / height,
      in: node.in ? [node.in[0] / width, node.in[1] / height] : undefined,
      out: node.out ? [node.out[0] / width, node.out[1] / height] : undefined,
    })),
    closed,
    fillRule: "nonzero",
    backgroundColor: closed ? "#dbeafe" : "transparent",
    fillStyle: "solid",
    roughness: 0,
  };
  return recomputeVectorPathBounds(pathEl, 16);
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
  const lineHeight = 1.4;
  const padding = getTextSafePadding(fontSize);
  return {
    ...baseDefaults(),
    type: "text",
    x: opts.x,
    y: opts.y,
    width: opts.width ?? 200,
    height:
      opts.height ??
      Math.max(
        fontSize * lineHeight + padding * 2,
        getTextMinimumHeight({ fontSize, lineHeight, padding }, lines.length),
      ),
    strokeColor: "#1b1b1f",
    backgroundColor: "transparent",
    text: opts.text,
    fontSize,
    fontFamily: opts.fontFamily ?? "'Excalifont', 'Mali', cursive",
    fontStyle: "normal",
    textAlign: "left",
    verticalAlign: "top",
    lineHeight,
    containerId: null,
    padding,
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

export function createBookMockup(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  perspective?: number;
  depth?: number;
  binding?: "paperback" | "hardcover";
  coverThickness?: number;
  coverOverhang?: number;
  hingeDepth?: number;
  pageColor?: string;
  lightAngle?: number;
  lightElevation?: number;
  lightIntensity?: number;
  ambientLight?: number;
  showShadow?: boolean;
  shadowBlur?: number;
  shadowOpacity?: number;
  shadowOffset?: number;
  spineColor?: string;
}): BookMockupElement {
  return {
    ...baseDefaults(),
    type: "bookMockup",
    x: opts.x,
    y: opts.y,
    width: opts.width,
    height: opts.height,
    fileId: opts.fileId,
    naturalWidth: opts.naturalWidth,
    naturalHeight: opts.naturalHeight,
    yaw: opts.yaw ?? 18,
    pitch: opts.pitch ?? -4,
    roll: opts.roll ?? 0,
    perspective: opts.perspective ?? 58,
    depth: opts.depth ?? 12,
    binding: opts.binding ?? "paperback",
    coverThickness: opts.coverThickness ?? 1.2,
    coverOverhang: opts.coverOverhang ?? 1.8,
    hingeDepth: opts.hingeDepth ?? 3.5,
    pageColor: opts.pageColor ?? "#f3eee2",
    lightAngle: opts.lightAngle ?? -38,
    lightElevation: opts.lightElevation ?? 48,
    lightIntensity: opts.lightIntensity ?? 0.28,
    ambientLight: opts.ambientLight ?? 0.34,
    showShadow: opts.showShadow ?? true,
    shadowBlur: opts.shadowBlur ?? 24,
    shadowOpacity: opts.shadowOpacity ?? 0.28,
    shadowOffset: opts.shadowOffset ?? 22,
    spineColor: opts.spineColor ?? "#2f3137",
    strokeColor: "transparent",
    strokeWidth: 0,
    fillStyle: "solid",
    roughness: 0,
  };
}

export function createFrame(opts: {
  x: number;
  y: number;
  width: number;
  height: number;
  name?: string;
  shape?: FrameMaskShape;
  cornerRadius?: number;
  imageFileId?: string;
  cropRotation?: number;
  feather?: number;
}): FrameElement {
  const shape = opts.shape ?? "rect";
  return {
    ...baseDefaults(),
    type: "frame",
    x: opts.x,
    y: opts.y,
    width: Math.max(opts.width, 100),
    height: Math.max(opts.height, 100),
    name: opts.name ?? "Frame",
    shape,
    cornerRadius: opts.cornerRadius ?? (shape === "roundedRect" ? 24 : 0),
    childIds: [],
    imageFileId: opts.imageFileId,
    cropOffsetX: 0,
    cropOffsetY: 0,
    cropZoom: 1,
    cropRotation: opts.cropRotation ?? 0,
    feather: opts.feather ?? 0,
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
