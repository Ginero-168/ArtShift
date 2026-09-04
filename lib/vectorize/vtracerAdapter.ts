import type { VectorPathElement, VectorPathNode } from "@/lib/engine/types";
import { recomputeVectorPathBounds } from "@/lib/engine/vectorPath";
import type { VectorizeResult } from "./vectorizer-core";

export type VTracerAdapterBounds = {
  targetBounds: { x: number; y: number; width: number; height: number };
  sourceWidth: number;
  sourceHeight: number;
  maxElements?: number;
  maxTotalNodes?: number;
  maxSvgChars?: number;
  maxPathDataChars?: number;
  maxPathTokens?: number;
};

type Point = { x: number; y: number };
type RawNode = Point & { in?: Point; out?: Point };
type ParsedSubpath = { nodes: RawNode[]; closed: boolean };
type PaintedPath = {
  d: string;
  fill: string;
  fillRule: "nonzero" | "evenodd";
  opacity: number;
};

const DEFAULT_MAX_ELEMENTS = 512;
const DEFAULT_MAX_TOTAL_NODES = 50_000;
export const VTRACER_SVG_LIMITS = {
  maxSvgChars: 4_000_000,
  maxPathDataChars: 3_500_000,
  maxPathTokens: 500_000,
} as const;
const SVG_TOKEN_PATTERN = /([a-zA-Z])|([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/g;
const COMMAND_PATTERN = /^[a-zA-Z]$/;

/** Convert VTracer's SVG document into ArtShift's editable path objects. */
export function parseVTracerSvgToElements(
  svg: string,
  bounds: VTracerAdapterBounds,
): VectorPathElement[] {
  if (!svg.trim()) return [];
  if (
    !Number.isFinite(bounds.sourceWidth) ||
    !Number.isFinite(bounds.sourceHeight) ||
    bounds.sourceWidth <= 0 ||
    bounds.sourceHeight <= 0
  ) {
    throw new Error("VTracer returned invalid source dimensions.");
  }

  const maxElements = bounds.maxElements ?? DEFAULT_MAX_ELEMENTS;
  const maxTotalNodes = bounds.maxTotalNodes ?? DEFAULT_MAX_TOTAL_NODES;
  const maxSvgChars = bounds.maxSvgChars ?? VTRACER_SVG_LIMITS.maxSvgChars;
  const maxPathDataChars = bounds.maxPathDataChars ?? VTRACER_SVG_LIMITS.maxPathDataChars;
  const maxPathTokens = bounds.maxPathTokens ?? VTRACER_SVG_LIMITS.maxPathTokens;
  if (svg.length > maxSvgChars) {
    throw new Error("VTracer SVG output is too large.");
  }
  const elements: VectorPathElement[] = [];
  let totalNodes = 0;

  for (const paintedPath of extractPaintedPaths(svg, {
    maxPaintedPaths: maxElements,
    maxPathDataChars,
  })) {
    const subpaths = parsePathData(paintedPath.d, maxPathTokens).filter(
      (subpath) => subpath.nodes.length >= 2,
    );
    if (subpaths.length === 0) continue;
    if (elements.length >= maxElements) {
      throw new Error("VTracer returned too many vector paths.");
    }

    const subpathStarts: number[] = [];
    const normalizedNodes: VectorPathNode[] = [];
    for (const subpath of subpaths) {
      totalNodes += subpath.nodes.length;
      if (totalNodes > maxTotalNodes) {
        throw new Error("VTracer returned too many vector nodes.");
      }
      subpathStarts.push(normalizedNodes.length);
      normalizedNodes.push(
        ...subpath.nodes.map(
          (node): VectorPathNode => ({
            x: node.x / bounds.sourceWidth,
            y: node.y / bounds.sourceHeight,
            in: node.in
              ? [node.in.x / bounds.sourceWidth, node.in.y / bounds.sourceHeight]
              : undefined,
            out: node.out
              ? [node.out.x / bounds.sourceWidth, node.out.y / bounds.sourceHeight]
              : undefined,
          }),
        ),
      );
    }

    const element: VectorPathElement = {
      id: createElementId(),
      type: "path",
      x: bounds.targetBounds.x,
      y: bounds.targetBounds.y,
      width: bounds.targetBounds.width,
      height: bounds.targetBounds.height,
      angle: 0,
      opacity: paintedPath.opacity,
      strokeColor: "transparent",
      backgroundColor: paintedPath.fill,
      strokeWidth: 0,
      strokeStyle: "solid",
      fillStyle: "solid",
      roughness: 0,
      seed: stableSeed(`${paintedPath.fill}:${elements.length}`),
      groupIds: [],
      locked: false,
      z: elements.length,
      version: 1,
      isDeleted: false,
      visible: true,
      name: `VTracer ${paintedPath.fill}`,
      nodes: normalizedNodes,
      subpathStarts: subpathStarts.length > 1 ? subpathStarts : undefined,
      closed: true,
      fillRule: paintedPath.fillRule,
    };

    elements.push(recomputeVectorPathBounds(element));
  }

  return elements;
}

export function parseVTracerSvgResult(svg: string, bounds: VTracerAdapterBounds): VectorizeResult {
  const elements = parseVTracerSvgToElements(svg, bounds);
  return {
    elements,
    svgString: svg,
    palette: [...new Set(elements.map((element) => element.backgroundColor))],
    totalNodes: elements.reduce((total, element) => total + element.nodes.length, 0),
    width: bounds.targetBounds.width,
    height: bounds.targetBounds.height,
  };
}

function extractPaintedPaths(
  svg: string,
  budget: { maxPaintedPaths: number; maxPathDataChars: number },
): PaintedPath[] {
  const paths: PaintedPath[] = [];
  const fillStack: Array<string | null> = ["#000000"];
  const fillRuleStack: Array<"nonzero" | "evenodd"> = ["nonzero"];
  const opacityStack: number[] = [1];
  let pathDataChars = 0;
  const tagPattern = /<\/?([a-zA-Z][\w:-]*)([^>]*?)>/g;

  for (const match of svg.matchAll(tagPattern)) {
    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const attributes = parseAttributes(match[2]);
    const closing = fullTag.startsWith("</");
    const selfClosing = /\/\s*>$/.test(fullTag);

    if (tagName === "g") {
      if (closing) {
        if (fillStack.length > 1) fillStack.pop();
        if (fillRuleStack.length > 1) fillRuleStack.pop();
        if (opacityStack.length > 1) opacityStack.pop();
      } else {
        const inheritedFill = fillStack.at(-1) ?? null;
        fillStack.push(
          Object.hasOwn(attributes, "fill") ? normalizeFill(attributes.fill) : inheritedFill,
        );
        fillRuleStack.push(normalizeFillRule(attributes["fill-rule"]) ?? fillRuleStack.at(-1)!);
        const inheritedOpacity = opacityStack.at(-1) ?? 1;
        opacityStack.push(
          inheritedOpacity *
            normalizeOpacity(attributes.opacity) *
            normalizeOpacity(attributes["fill-opacity"]),
        );
        if (selfClosing) {
          fillStack.pop();
          fillRuleStack.pop();
          opacityStack.pop();
        }
      }
      continue;
    }

    if (tagName !== "path" || closing) continue;
    const fill = Object.hasOwn(attributes, "fill")
      ? normalizeFill(attributes.fill)
      : (fillStack.at(-1) ?? null);
    if (fill === null) continue;
    const opacity =
      (opacityStack.at(-1) ?? 1) *
      normalizeOpacity(attributes.opacity) *
      normalizeOpacity(attributes["fill-opacity"]);
    if (opacity <= 0) continue;
    if (paths.length >= budget.maxPaintedPaths) {
      throw new Error("VTracer returned too many vector paths.");
    }
    const d = attributes.d ?? "";
    pathDataChars += d.length;
    if (pathDataChars > budget.maxPathDataChars) {
      throw new Error("VTracer path data is too large.");
    }
    paths.push({
      d,
      fill,
      fillRule: normalizeFillRule(attributes["fill-rule"]) ?? fillRuleStack.at(-1) ?? "nonzero",
      opacity,
    });
  }

  return paths.filter((path) => path.d.length > 0);
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  for (const match of source.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  const style = attributes.style;
  if (style) {
    for (const declaration of style.split(";")) {
      const separator = declaration.indexOf(":");
      if (separator <= 0) continue;
      const name = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      if (name && value) attributes[name] = value;
    }
  }
  return attributes;
}

function normalizeFill(value: string | undefined): string | null {
  if (!value) return null;
  const fill = value.trim().toLowerCase();
  if (fill === "none") return null;
  if (/^#[0-9a-f]{3,8}$/.test(fill)) return fill;
  if (/^rgba?\(\s*[\d.]+(?:\s*,\s*[\d.]+){2,3}\s*\)$/.test(fill)) return fill;
  return null;
}

function normalizeOpacity(value: string | undefined): number {
  if (!value) return 1;
  const raw = value.trim();
  const numeric = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric)) : 1;
}

function normalizeFillRule(value: string | undefined): "nonzero" | "evenodd" | null {
  if (value?.trim().toLowerCase() === "evenodd") return "evenodd";
  if (value?.trim().toLowerCase() === "nonzero") return "nonzero";
  return null;
}

function parsePathData(d: string, maxTokens: number): ParsedSubpath[] {
  const tokens: string[] = [];
  for (const match of d.matchAll(SVG_TOKEN_PATTERN)) {
    if (tokens.length >= maxTokens) throw new Error("VTracer SVG path has too many tokens.");
    tokens.push(match[1] ?? match[2]);
  }
  if (tokens.length === 0) throw new Error("VTracer returned an empty SVG path.");

  const subpaths: ParsedSubpath[] = [];
  let tokenIndex = 0;
  let command = "";
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let active: ParsedSubpath | null = null;
  let previousCubicControl: Point | undefined;
  let previousQuadraticControl: Point | undefined;
  let previousCommand = "";

  const flush = () => {
    if (active && active.nodes.length >= 2) subpaths.push(active);
    active = null;
  };
  const ensureActive = () => {
    if (!active) throw new Error("VTracer path command appeared before M.");
    return active;
  };
  const hasNumbers = (count: number) => {
    if (tokenIndex + count > tokens.length) return false;
    for (let offset = 0; offset < count; offset++) {
      if (COMMAND_PATTERN.test(tokens[tokenIndex + offset])) return false;
    }
    return true;
  };
  const readNumber = () => {
    const token = tokens[tokenIndex++];
    const number = Number(token);
    if (!Number.isFinite(number)) throw new Error("VTracer returned an invalid SVG number.");
    return number;
  };
  const readPoint = (relative: boolean): Point => {
    const point = { x: readNumber(), y: readNumber() };
    return relative ? { x: current.x + point.x, y: current.y + point.y } : point;
  };
  const appendLine = (point: Point) => {
    ensureActive().nodes.push({ x: point.x, y: point.y });
    current = point;
    previousCubicControl = undefined;
    previousQuadraticControl = undefined;
  };
  const appendCubic = (control1: Point, control2: Point, point: Point) => {
    const nodes = ensureActive().nodes;
    const previous = nodes.at(-1);
    if (!previous) throw new Error("VTracer cubic path has no starting point.");
    previous.out = { x: control1.x - current.x, y: control1.y - current.y };
    nodes.push({
      x: point.x,
      y: point.y,
      in: { x: control2.x - point.x, y: control2.y - point.y },
    });
    current = point;
    previousCubicControl = control2;
    previousQuadraticControl = undefined;
  };

  while (tokenIndex < tokens.length) {
    if (COMMAND_PATTERN.test(tokens[tokenIndex])) command = tokens[tokenIndex++];
    if (!command) throw new Error("VTracer path has no command.");

    const relative = command === command.toLowerCase();
    const normalizedCommand = command.toUpperCase();
    switch (normalizedCommand) {
      case "M": {
        if (!hasNumbers(2)) throw new Error("VTracer M command is incomplete.");
        flush();
        current = readPoint(relative);
        start = current;
        active = { nodes: [{ x: current.x, y: current.y }], closed: false };
        previousCubicControl = undefined;
        previousQuadraticControl = undefined;
        previousCommand = "M";
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        if (!hasNumbers(2)) throw new Error("VTracer L command is incomplete.");
        while (hasNumbers(2)) appendLine(readPoint(relative));
        previousCommand = "L";
        break;
      }
      case "H": {
        if (!hasNumbers(1)) throw new Error("VTracer H command is incomplete.");
        while (hasNumbers(1)) {
          const x = readNumber();
          appendLine({ x: relative ? current.x + x : x, y: current.y });
        }
        previousCommand = "H";
        break;
      }
      case "V": {
        if (!hasNumbers(1)) throw new Error("VTracer V command is incomplete.");
        while (hasNumbers(1)) {
          const y = readNumber();
          appendLine({ x: current.x, y: relative ? current.y + y : y });
        }
        previousCommand = "V";
        break;
      }
      case "C": {
        if (!hasNumbers(6)) throw new Error("VTracer C command is incomplete.");
        while (hasNumbers(6)) {
          const control1 = readPoint(relative);
          const control2 = readPoint(relative);
          const point = readPoint(relative);
          appendCubic(control1, control2, point);
        }
        previousCommand = "C";
        break;
      }
      case "S": {
        if (!hasNumbers(4)) throw new Error("VTracer S command is incomplete.");
        while (hasNumbers(4)) {
          const control1 =
            (previousCommand === "C" || previousCommand === "S") && previousCubicControl
              ? {
                  x: 2 * current.x - previousCubicControl.x,
                  y: 2 * current.y - previousCubicControl.y,
                }
              : { ...current };
          const control2 = readPoint(relative);
          const point = readPoint(relative);
          appendCubic(control1, control2, point);
        }
        previousCommand = "S";
        break;
      }
      case "Q": {
        if (!hasNumbers(4)) throw new Error("VTracer Q command is incomplete.");
        while (hasNumbers(4)) {
          const quadratic = readPoint(relative);
          const point = readPoint(relative);
          appendCubic(
            {
              x: current.x + (2 / 3) * (quadratic.x - current.x),
              y: current.y + (2 / 3) * (quadratic.y - current.y),
            },
            {
              x: point.x + (2 / 3) * (quadratic.x - point.x),
              y: point.y + (2 / 3) * (quadratic.y - point.y),
            },
            point,
          );
          previousQuadraticControl = quadratic;
        }
        previousCommand = "Q";
        break;
      }
      case "T": {
        if (!hasNumbers(2)) throw new Error("VTracer T command is incomplete.");
        while (hasNumbers(2)) {
          const quadratic =
            (previousCommand === "Q" || previousCommand === "T") && previousQuadraticControl
              ? {
                  x: 2 * current.x - previousQuadraticControl.x,
                  y: 2 * current.y - previousQuadraticControl.y,
                }
              : { ...current };
          const point = readPoint(relative);
          appendCubic(
            {
              x: current.x + (2 / 3) * (quadratic.x - current.x),
              y: current.y + (2 / 3) * (quadratic.y - current.y),
            },
            {
              x: point.x + (2 / 3) * (quadratic.x - point.x),
              y: point.y + (2 / 3) * (quadratic.y - point.y),
            },
            point,
          );
          previousQuadraticControl = quadratic;
        }
        previousCommand = "T";
        break;
      }
      case "Z": {
        const path = ensureActive();
        path.closed = true;
        current = { ...start };
        flush();
        previousCubicControl = undefined;
        previousQuadraticControl = undefined;
        previousCommand = "Z";
        command = "";
        break;
      }
      default:
        throw new Error(`Unsupported SVG path command from VTracer: ${normalizedCommand}`);
    }
  }

  flush();
  return subpaths;
}

function createElementId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `vtracer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stableSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
