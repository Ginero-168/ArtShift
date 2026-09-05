import type { VectorPathElement, VectorPathNode } from "@/lib/engine/types";
import { recomputeVectorPathBounds } from "@/lib/engine/vectorPath";
import type { VectorizeResult } from "./vectorizerTypes";

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
type ParsedGradient = {
  type: "linear" | "radial";
  colors: string[];
  stops: number[];
  angle: number;
};
type PaintedPath = {
  d: string;
  fill: string;
  gradient?: ParsedGradient;
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
/** Recraft can legitimately return more paths than the local VTracer editor budget. */
export const RECRAFT_SVG_LIMITS = {
  maxElements: 6_000,
  maxTotalNodes: 120_000,
  maxSvgChars: 4_000_000,
  maxPathDataChars: 3_500_000,
  maxPathTokens: 600_000,
} as const;
const SVG_TOKEN_PATTERN = /([a-zA-Z])|([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?)/g;
const COMMAND_PATTERN = /^[a-zA-Z]$/;

export type SvgViewport = {
  width: number;
  height: number;
};

export function getSvgViewport(svg: string): SvgViewport {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root) throw new Error("SVG output is missing a root viewport.");
  const attributes = parseAttributes(root[1]);
  const viewBoxValues = (attributes.viewbox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (viewBoxValues.length === 4 && viewBoxValues[2] > 0 && viewBoxValues[3] > 0) {
    return { width: viewBoxValues[2], height: viewBoxValues[3] };
  }
  const width = parseSvgLength(attributes.width);
  const height = parseSvgLength(attributes.height);
  if (width && height) return { width, height };
  throw new Error("SVG output is missing a usable viewport.");
}

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
      ...(paintedPath.gradient
        ? {
            fillType: paintedPath.gradient.type,
            gradientColors: paintedPath.gradient.colors,
            gradientStops: paintedPath.gradient.stops,
            gradientAngle: paintedPath.gradient.angle,
          }
        : {}),
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
  const gradients = parseGradients(svg);
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
          Object.hasOwn(attributes, "fill") ? normalizePaint(attributes.fill) : inheritedFill,
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
    const rawFill = Object.hasOwn(attributes, "fill")
      ? normalizePaint(attributes.fill)
      : (fillStack.at(-1) ?? null);
    const gradient = resolveGradient(rawFill, gradients);
    const fill = gradient?.colors[0] ?? normalizeFill(rawFill ?? undefined);
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
      ...(gradient ? { gradient } : {}),
      fillRule: normalizeFillRule(attributes["fill-rule"]) ?? fillRuleStack.at(-1) ?? "nonzero",
      opacity,
    });
  }

  return paths.filter((path) => path.d.length > 0);
}

function parseGradients(svg: string): Map<string, ParsedGradient> {
  const gradients = new Map<string, ParsedGradient>();
  const gradientPattern = /<(linearGradient|radialGradient)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of svg.matchAll(gradientPattern)) {
    const attributes = parseAttributes(match[2]);
    const id = attributes.id?.trim();
    if (!id) continue;
    const stops: Array<{ color: string; offset: number }> = [];
    const stopPattern = /<stop\b([^>]*)>/gi;
    for (const stopMatch of match[3].matchAll(stopPattern)) {
      const stopAttributes = parseAttributes(stopMatch[1]);
      const color = normalizeGradientStopColor(
        stopAttributes["stop-color"],
        stopAttributes["stop-opacity"],
      );
      const offset = parseStopOffset(stopAttributes.offset);
      if (color && offset !== null) stops.push({ color, offset });
    }
    if (stops.length < 2) continue;
    stops.sort((first, second) => first.offset - second.offset);
    gradients.set(id, {
      type: match[1].toLowerCase() === "radialgradient" ? "radial" : "linear",
      colors: stops.map((stop) => stop.color),
      stops: stops.map((stop) => stop.offset),
      angle: gradientAngle(attributes, match[1].toLowerCase() === "radialgradient"),
    });
  }
  return gradients;
}

function resolveGradient(
  paint: string | null,
  gradients: Map<string, ParsedGradient>,
): ParsedGradient | undefined {
  const reference = /^url\(\s*#([^\s)]+)\s*\)$/i.exec(paint ?? "");
  return reference ? gradients.get(reference[1]) : undefined;
}

function normalizePaint(value: string | undefined): string | null {
  if (!value) return null;
  const paint = value.trim();
  if (/^url\(\s*#[^\s)]+\s*\)$/i.test(paint)) return paint;
  return normalizeFill(paint);
}

function normalizeGradientStopColor(
  value: string | undefined,
  opacityValue: string | undefined,
): string | null {
  const color = normalizeFill(value);
  if (!color) return null;
  const opacity = normalizeOpacity(opacityValue);
  if (opacity >= 0.999 || color.startsWith("rgba(")) return color;
  const rgb = color.match(/^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i);
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${opacity})`;
  const hex = color.slice(1);
  const expanded =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => part + part)
          .join("")
      : hex;
  if (/^[0-9a-f]{6}$/i.test(expanded)) {
    return `rgba(${Number.parseInt(expanded.slice(0, 2), 16)}, ${Number.parseInt(expanded.slice(2, 4), 16)}, ${Number.parseInt(expanded.slice(4, 6), 16)}, ${opacity})`;
  }
  return color;
}

function parseStopOffset(value: string | undefined): number | null {
  if (!value) return null;
  const raw = value.trim();
  const numeric = Number.parseFloat(raw);
  if (!Number.isFinite(numeric)) return null;
  const offset = raw.endsWith("%") ? numeric / 100 : numeric;
  return Math.min(1, Math.max(0, offset));
}

function gradientAngle(attributes: Record<string, string>, radial: boolean): number {
  if (radial) return 90;
  const x1 = Number.parseFloat(attributes.x1 ?? "");
  const y1 = Number.parseFloat(attributes.y1 ?? "");
  const x2 = Number.parseFloat(attributes.x2 ?? "");
  const y2 = Number.parseFloat(attributes.y2 ?? "");
  if (![x1, y1, x2, y2].every(Number.isFinite) || (x1 === x2 && y1 === y2)) return 90;
  return (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
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

function parseSvgLength(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*((?:\d+(?:\.\d*)?|\.\d+))(?:px)?\s*$/i.exec(value);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
