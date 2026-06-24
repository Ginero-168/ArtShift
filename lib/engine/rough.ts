/**
 * Seeded roughjs wrapper.
 *
 * roughjs already supports `seed` in its options; this module wraps the API
 * to (a) cache RoughGenerator across calls, (b) translate our `EngineElement`
 * style fields into roughjs Options once, and (c) expose a single
 * `drawElement(ctx, element)` entry point so the renderer never imports
 * roughjs directly.
 */

import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughGenerator } from "roughjs/bin/generator";
import rough from "roughjs/bin/rough";
import type {
  ArrowElement,
  DiamondElement,
  EngineElement,
  HeartElement,
  HexagonElement,
  LineElement,
  PlusElement,
  RectElement,
  StarElement,
  TriangleElement,
} from "./types";

let _gen: RoughGenerator | null = null;
function generator(): RoughGenerator {
  if (!_gen) _gen = rough.generator();
  return _gen;
}

function baseOptions(el: EngineElement): Options {
  return {
    seed: el.seed,
    roughness: el.roughness,
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    fill: el.backgroundColor === "transparent" ? undefined : el.backgroundColor,
    fillStyle: el.fillStyle === "none" ? undefined : el.fillStyle,
    strokeLineDash:
      el.strokeStyle === "dashed"
        ? [el.strokeWidth * 4, el.strokeWidth * 4]
        : el.strokeStyle === "dotted"
          ? [el.strokeWidth, el.strokeWidth * 2]
          : undefined,
  };
}

export type RoughShape = Drawable;

/** Build (but do not draw) the rough geometry for an element. Cache-friendly. */
export function buildRoughShape(el: EngineElement): RoughShape | null {
  const g = generator();
  const opts = baseOptions(el);
  switch (el.type) {
    case "rect":
      return buildRect(g, el, opts);
    case "ellipse":
      return g.ellipse(el.width / 2, el.height / 2, el.width, el.height, opts);
    case "diamond":
      return buildDiamond(g, el, opts);
    case "triangle":
      return buildTriangle(g, el, opts);
    case "star":
      return buildStar(g, el, opts);
    case "hexagon":
      return buildHexagon(g, el, opts);
    case "heart":
      return buildHeart(g, el, opts);
    case "plus":
      return buildPlus(g, el, opts);
    case "line":
      return buildLine(g, el, opts);
    case "arrow":
      return buildArrow(g, el, opts);
    default:
      return null;
  }
}

function buildRect(g: RoughGenerator, el: RectElement, opts: Options): RoughShape {
  if (el.cornerRadius > 0) {
    const r = Math.min(el.cornerRadius, Math.min(el.width, el.height) / 2);
    const x = 0;
    const y = 0;
    const w = el.width;
    const h = el.height;
    const path =
      `M ${x + r} ${y} ` +
      `L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} ` +
      `L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} ` +
      `L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} ` +
      `L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
    return g.path(path, opts);
  }
  return g.rectangle(0, 0, el.width, el.height, opts);
}

function buildDiamond(g: RoughGenerator, el: DiamondElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  return g.polygon(
    [
      [w / 2, 0],
      [w, h / 2],
      [w / 2, h],
      [0, h / 2],
    ],
    opts,
  );
}

function buildTriangle(g: RoughGenerator, el: TriangleElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  return g.polygon(
    [
      [w / 2, 0],
      [w, h],
      [0, h],
    ],
    opts,
  );
}

function buildStar(g: RoughGenerator, el: StarElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.4;
  const n = el.numPoints;
  const points: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = (Math.PI * i) / n - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return g.polygon(points, opts);
}

function buildHexagon(g: RoughGenerator, el: HexagonElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2;
  const points: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * i) / 3 - Math.PI / 2;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return g.polygon(points, opts);
}

function buildHeart(g: RoughGenerator, el: HeartElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  // Heart path using cubic bezier approximation.
  const path =
    `M ${w / 2} ${h * 0.25} ` +
    `C ${w / 2} ${h * 0.05}, ${w * 0.75} ${0}, ${w * 0.75} ${h * 0.2} ` +
    `C ${w * 0.75} ${h * 0.45}, ${w / 2} ${h * 0.6}, ${w / 2} ${h * 0.75} ` +
    `C ${w / 2} ${h * 0.6}, ${w * 0.25} ${h * 0.45}, ${w * 0.25} ${h * 0.2} ` +
    `C ${w * 0.25} ${0}, ${w / 2} ${h * 0.05}, ${w / 2} ${h * 0.25} Z`;
  return g.path(path, opts);
}

function buildPlus(g: RoughGenerator, el: PlusElement, opts: Options): RoughShape {
  const w = el.width;
  const h = el.height;
  const t = el.crossThickness * Math.min(w, h);
  const hw = t / 2;
  const cx = w / 2;
  const cy = h / 2;
  const points: [number, number][] = [
    [cx - hw, 0],
    [cx + hw, 0],
    [cx + hw, cy - hw],
    [w, cy - hw],
    [w, cy + hw],
    [cx + hw, cy + hw],
    [cx + hw, h],
    [cx - hw, h],
    [cx - hw, cy + hw],
    [0, cy + hw],
    [0, cy - hw],
    [cx - hw, cy - hw],
  ];
  return g.polygon(points, opts);
}

function buildLine(g: RoughGenerator, el: LineElement, opts: Options): RoughShape {
  if (el.points.length === 2) {
    const [a, b] = el.points;
    return g.line(a[0], a[1], b[0], b[1], opts);
  }
  // 3+ points: draw as a smooth curve
  if (el.points.length >= 3) {
    return g.curve(el.points, opts);
  }
  return g.linearPath(el.points, opts);
}

function buildArrow(g: RoughGenerator, el: ArrowElement, opts: Options): RoughShape {
  // Arrow body. Heads are stroked separately by the renderer.
  if (el.points.length >= 3) {
    return g.curve(el.points, opts);
  }
  return g.linearPath(el.points, opts);
}

/** Throw away cached generator (e.g. on hot reload tests). */
export function resetRoughCache() {
  _gen = null;
}
