// Best-effort SVG → SlideObject[] converter for pasting shapes & arrows from
// Google Slides / other vector sources. Handles rect/ellipse/circle/line/
// polygon/simple path/text plus translate+rotate+scale transforms, group
// inheritance of fill/stroke/opacity, and viewBox scaling.

import { nanoid } from "nanoid";
import type { ShapeKind, ShapeObject, SlideObject, TextObject } from "./types";

const SLIDE_W = 1280;
const SLIDE_H = 720;

type Mat = [number, number, number, number, number, number]; // a b c d e f (SVG matrix)

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function multiply(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function transformPoint(m: Mat, x: number, y: number) {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Extract translate/rotate/scale from a 2D affine (skips shear). */
function decompose(m: Mat) {
  const tx = m[4];
  const ty = m[5];
  const sx = Math.hypot(m[0], m[1]) || 1;
  const sy = Math.hypot(m[2], m[3]) || 1;
  const rotation = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
  return { tx, ty, sx, sy, rotation };
}

function parseTransform(value: string | null | undefined): Mat {
  if (!value) return IDENTITY;
  let m: Mat = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration pattern
  while ((match = re.exec(value)) !== null) {
    const fn = match[1];
    const args = match[2]
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    let step: Mat = IDENTITY;
    if (fn === "matrix" && args.length === 6) {
      step = args as unknown as Mat;
    } else if (fn === "translate") {
      step = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    } else if (fn === "scale") {
      const sx = args[0] ?? 1;
      const sy = args[1] ?? sx;
      step = [sx, 0, 0, sy, 0, 0];
    } else if (fn === "rotate") {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length >= 3) {
        const cx = args[1];
        const cy = args[2];
        // translate(cx,cy) rotate(a) translate(-cx,-cy)
        step = multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]);
        step = multiply(step, [1, 0, 0, 1, -cx, -cy]);
      } else {
        step = [cos, sin, -sin, cos, 0, 0];
      }
    }
    m = multiply(m, step);
  }
  return m;
}

function pickAttr(el: Element, ...names: string[]): string | null {
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v != null && v !== "") return v;
  }
  return null;
}

function num(v: string | null, fallback = 0): number {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeColor(c: string | null | undefined, fallback: string | null = null) {
  if (!c) return fallback;
  const v = c.trim().toLowerCase();
  if (!v || v === "none" || v === "transparent") return null;
  if (v === "currentcolor") return fallback;
  // url(#gradient) / unsupported paint → treat as fallback (won't break render).
  if (v.startsWith("url(")) return fallback;
  return c.trim();
}

type Style = {
  fill: string | null;
  stroke: string | null;
  strokeWidth: number | null;
  opacity: number | null;
};

function readStyle(el: Element, parent: Style): Style {
  // Inline `style="fill:...; stroke:..."` takes precedence over attributes.
  const inline: Record<string, string> = {};
  const styleAttr = el.getAttribute("style") || "";
  for (const chunk of styleAttr.split(";")) {
    const [k, v] = chunk.split(":");
    if (k && v) inline[k.trim()] = v.trim();
  }
  const fillRaw = inline.fill ?? el.getAttribute("fill");
  const strokeRaw = inline.stroke ?? el.getAttribute("stroke");
  const swRaw = inline["stroke-width"] ?? el.getAttribute("stroke-width");
  const opRaw = inline.opacity ?? el.getAttribute("opacity");
  return {
    fill: fillRaw != null ? normalizeColor(fillRaw, parent.fill) : parent.fill,
    stroke: strokeRaw != null ? normalizeColor(strokeRaw, parent.stroke) : parent.stroke,
    strokeWidth:
      swRaw != null
        ? Number.isFinite(parseFloat(swRaw))
          ? parseFloat(swRaw)
          : parent.strokeWidth
        : parent.strokeWidth,
    opacity:
      opRaw != null && Number.isFinite(parseFloat(opRaw)) ? parseFloat(opRaw) : parent.opacity,
  };
}

function base<T extends SlideObject["type"]>(
  type: T,
): { id: string; type: T; rotation: number; opacity: number } {
  return { id: nanoid(8), type, rotation: 0, opacity: 1 };
}

function mkShape(
  kind: ShapeKind,
  x: number,
  y: number,
  width: number,
  height: number,
  style: Style,
  rotation = 0,
  extra: Partial<ShapeObject> = {},
): ShapeObject {
  return {
    ...base("shape"),
    shape: kind,
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
    rotation,
    opacity: style.opacity ?? 1,
    fill: style.fill ?? "transparent",
    stroke: style.stroke ?? "transparent",
    strokeWidth: style.strokeWidth ?? 0,
    ...extra,
  };
}

/** Parse a `points="x1,y1 x2,y2 ..."` list. */
function parsePoints(v: string): Array<{ x: number; y: number }> {
  return v
    .trim()
    .split(/[\s,]+/)
    .reduce<number[]>((a, t) => {
      const n = parseFloat(t);
      if (Number.isFinite(n)) a.push(n);
      return a;
    }, [])
    .reduce<Array<{ x: number; y: number }>>((acc, n, i, arr) => {
      if (i % 2 === 0 && i + 1 < arr.length) acc.push({ x: n, y: arr[i + 1] });
      return acc;
    }, []);
}

/** Extract the first M…L endpoint pair from a simple `d` path. */
function parseSimplePath(d: string): { x1: number; y1: number; x2: number; y2: number } | null {
  // Strip commas, uppercase commands for simpler matching.
  const tokens = d.trim().split(/[\s,]+/);
  let i = 0;
  let cx = 0;
  let cy = 0;
  let startX: number | null = null;
  let startY: number | null = null;
  let endX: number | null = null;
  let endY: number | null = null;
  while (i < tokens.length) {
    const t = tokens[i];
    if (!t) {
      i++;
      continue;
    }
    const cmd = t[0];
    // If next token is a letter, this IS the command; numbers otherwise.
    if (/[a-zA-Z]/.test(cmd)) {
      i++;
      if (cmd === "M" || cmd === "m") {
        const x = parseFloat(tokens[i]);
        const y = parseFloat(tokens[i + 1]);
        i += 2;
        cx = cmd === "M" ? x : cx + x;
        cy = cmd === "M" ? y : cy + y;
        if (startX == null) {
          startX = cx;
          startY = cy;
        }
        endX = cx;
        endY = cy;
      } else if (cmd === "L" || cmd === "l") {
        const x = parseFloat(tokens[i]);
        const y = parseFloat(tokens[i + 1]);
        i += 2;
        cx = cmd === "L" ? x : cx + x;
        cy = cmd === "L" ? y : cy + y;
        endX = cx;
        endY = cy;
      } else if (cmd === "H" || cmd === "h") {
        const x = parseFloat(tokens[i]);
        i += 1;
        cx = cmd === "H" ? x : cx + x;
        endX = cx;
        endY = cy;
      } else if (cmd === "V" || cmd === "v") {
        const y = parseFloat(tokens[i]);
        i += 1;
        cy = cmd === "V" ? y : cy + y;
        endX = cx;
        endY = cy;
      } else {
        // Unsupported segment → abort.
        return null;
      }
    } else {
      // Numbers without a command prefix are an error in our simple parser.
      return null;
    }
  }
  if (startX == null || startY == null || endX == null || endY == null) return null;
  return { x1: startX, y1: startY, x2: endX, y2: endY };
}

/** Convert a line (two endpoints in slide coords) into a shape with rotation. */
function lineToShape(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  style: Style,
  kind: "line" | "arrow",
): ShapeObject {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const thickness = Math.max(2, style.strokeWidth ?? 2);
  // Position the shape's bbox so its left-center sits at (x1,y1) and rotates into place.
  return {
    ...base("shape"),
    shape: kind,
    x: x1,
    y: y1 - thickness / 2,
    width: length,
    height: thickness,
    rotation: angle,
    opacity: style.opacity ?? 1,
    fill: kind === "arrow" ? (style.stroke ?? style.fill ?? "#1f2230") : "transparent",
    stroke: style.stroke ?? "#1f2230",
    strokeWidth: thickness,
  };
}

function transformRectAABB(m: Mat, x: number, y: number, w: number, h: number) {
  const p1 = transformPoint(m, x, y);
  const p2 = transformPoint(m, x + w, y);
  const p3 = transformPoint(m, x + w, y + h);
  const p4 = transformPoint(m, x, y + h);
  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const maxX = Math.max(p1.x, p2.x, p3.x, p4.x);
  const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Parse an SVG document into SlideObject[]. Returns `null` if the SVG has no
 * recognisable geometry (so callers can fall back to an image paste).
 */
export function svgToSlideObjects(
  svgText: string,
  maxSlideW = SLIDE_W,
  maxSlideH = SLIDE_H,
): SlideObject[] | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch {
    return null;
  }
  const parserError = doc.querySelector("parsererror");
  if (parserError) return null;
  const root = doc.documentElement;
  if (root?.tagName.toLowerCase() !== "svg") return null;

  // Compute svg-local → slide-local base transform from viewBox / width / height.
  const vb = root.getAttribute("viewBox");
  let vbX = 0;
  let vbY = 0;
  let vbW = num(root.getAttribute("width"), maxSlideW);
  let vbH = num(root.getAttribute("height"), maxSlideH);
  if (vb) {
    const parts = vb
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter((n) => Number.isFinite(n));
    if (parts.length === 4) {
      vbX = parts[0];
      vbY = parts[1];
      vbW = parts[2];
      vbH = parts[3];
    }
  }

  // Fit the svg's natural box into a reasonable region of the slide (leave
  // room so the paste offset in pasteObjects() doesn't push it off-canvas).
  const maxTargetW = maxSlideW * 0.9;
  const maxTargetH = maxSlideH * 0.9;
  const fit = Math.min(maxTargetW / Math.max(1, vbW), maxTargetH / Math.max(1, vbH), 1);
  // Root transform: translate(-vbX, -vbY) then scale(fit) — we leave tx/ty=0 so
  // objects land near the top-left of the stage; pasteObjects applies an offset.
  const rootMat: Mat = multiply([fit, 0, 0, fit, 0, 0], [1, 0, 0, 1, -vbX, -vbY]);

  // Detect arrow markers to classify line/path into "arrow" vs "line".
  const markerIds = new Set<string>();
  doc.querySelectorAll("marker").forEach((m) => {
    const id = m.getAttribute("id");
    if (id) markerIds.add(id);
  });

  const out: SlideObject[] = [];
  const rootStyle: Style = { fill: "#6366f1", stroke: null, strokeWidth: 0, opacity: 1 };

  function walk(el: Element, parentMat: Mat, parentStyle: Style) {
    const localMat = parseTransform(el.getAttribute("transform"));
    const m = multiply(parentMat, localMat);
    const style = readStyle(el, parentStyle);
    const tag = el.tagName.toLowerCase();

    if (tag === "g" || tag === "svg") {
      for (const child of Array.from(el.children)) walk(child, m, style);
      return;
    }

    // Skip definitions / non-visual nodes.
    if (
      [
        "defs",
        "title",
        "desc",
        "clippath",
        "mask",
        "marker",
        "style",
        "lineargradient",
        "radialgradient",
        "pattern",
      ].includes(tag)
    ) {
      return;
    }

    if (tag === "rect") {
      const x = num(el.getAttribute("x"));
      const y = num(el.getAttribute("y"));
      const w = num(el.getAttribute("width"));
      const h = num(el.getAttribute("height"));
      if (w <= 0 || h <= 0) return;
      const rx = num(el.getAttribute("rx"), num(el.getAttribute("ry")));
      const bbox = transformRectAABB(m, x, y, w, h);
      const { rotation } = decompose(m);
      out.push(
        mkShape("rect", bbox.x, bbox.y, bbox.width, bbox.height, style, rotation, {
          cornerRadius: rx > 0 ? Math.round(rx * Math.hypot(m[0], m[1])) : 0,
        }),
      );
      return;
    }

    if (tag === "circle") {
      const cx = num(el.getAttribute("cx"));
      const cy = num(el.getAttribute("cy"));
      const r = num(el.getAttribute("r"));
      if (r <= 0) return;
      const bbox = transformRectAABB(m, cx - r, cy - r, 2 * r, 2 * r);
      const { rotation } = decompose(m);
      out.push(mkShape("ellipse", bbox.x, bbox.y, bbox.width, bbox.height, style, rotation));
      return;
    }

    if (tag === "ellipse") {
      const cx = num(el.getAttribute("cx"));
      const cy = num(el.getAttribute("cy"));
      const rx = num(el.getAttribute("rx"));
      const ry = num(el.getAttribute("ry"));
      if (rx <= 0 || ry <= 0) return;
      const bbox = transformRectAABB(m, cx - rx, cy - ry, 2 * rx, 2 * ry);
      const { rotation } = decompose(m);
      out.push(mkShape("ellipse", bbox.x, bbox.y, bbox.width, bbox.height, style, rotation));
      return;
    }

    if (tag === "line") {
      const x1 = num(el.getAttribute("x1"));
      const y1 = num(el.getAttribute("y1"));
      const x2 = num(el.getAttribute("x2"));
      const y2 = num(el.getAttribute("y2"));
      const p1 = transformPoint(m, x1, y1);
      const p2 = transformPoint(m, x2, y2);
      const hasMarker = Boolean(el.getAttribute("marker-end") || el.getAttribute("marker-start"));
      out.push(lineToShape(p1.x, p1.y, p2.x, p2.y, style, hasMarker ? "arrow" : "line"));
      return;
    }

    if (tag === "polygon" || tag === "polyline") {
      const pointsAttr = el.getAttribute("points") || "";
      const pts = parsePoints(pointsAttr).map((p) => transformPoint(m, p.x, p.y));
      if (pts.length === 3 && tag === "polygon") {
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        const maxX = Math.max(...xs);
        const maxY = Math.max(...ys);
        const { rotation } = decompose(m);
        out.push(mkShape("triangle", minX, minY, maxX - minX, maxY - minY, style, rotation));
        return;
      }
      // Fallback: render polyline as sequential line segments (no rotation combined).
      for (let i = 0; i < pts.length - 1; i++) {
        out.push(lineToShape(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, style, "line"));
      }
      return;
    }

    if (tag === "path") {
      const d = el.getAttribute("d") || "";
      const simple = parseSimplePath(d);
      if (simple) {
        const p1 = transformPoint(m, simple.x1, simple.y1);
        const p2 = transformPoint(m, simple.x2, simple.y2);
        const hasMarker = Boolean(el.getAttribute("marker-end") || el.getAttribute("marker-start"));
        out.push(lineToShape(p1.x, p1.y, p2.x, p2.y, style, hasMarker ? "arrow" : "line"));
      }
      return;
    }

    if (tag === "text") {
      const tx = num(el.getAttribute("x"));
      const ty = num(el.getAttribute("y"));
      const p = transformPoint(m, tx, ty);
      const text = (el.textContent || "").trim();
      if (!text) return;
      const fontSize = num(el.getAttribute("font-size"), 24) * Math.hypot(m[0], m[1]);
      const fontFamily = pickAttr(el, "font-family") || "Inter";
      const weight = pickAttr(el, "font-weight") || "";
      const italic = (pickAttr(el, "font-style") || "").toLowerCase() === "italic";
      const bold = weight === "bold" || parseInt(weight, 10) >= 600;
      const fontStyle: TextObject["fontStyle"] =
        bold && italic ? "bold italic" : bold ? "bold" : italic ? "italic" : "normal";
      const alignRaw = (pickAttr(el, "text-anchor") || "start").toLowerCase();
      const align: TextObject["align"] =
        alignRaw === "middle" ? "center" : alignRaw === "end" ? "right" : "left";
      const size = Math.max(8, Math.round(fontSize));
      // Approximate width/height — Konva measures on render; we size generously.
      const width = Math.max(40, text.length * size * 0.6);
      const height = size * 1.4;
      const { rotation } = decompose(m);
      out.push({
        ...base("text"),
        text,
        x: p.x,
        y: p.y - size, // SVG text y is the baseline, ours is top-left.
        width,
        height,
        rotation,
        opacity: style.opacity ?? 1,
        fill: style.fill ?? "#111827",
        fontSize: size,
        fontFamily,
        fontStyle,
        align,
        lineHeight: 1.3,
      } satisfies TextObject);
      return;
    }

    // Unknown element — recurse in case it has children we understand.
    for (const child of Array.from(el.children)) walk(child, m, style);
  }

  walk(root, rootMat, rootStyle);

  if (!out.length) return null;
  void markerIds; // reserved for future marker-id lookups

  // Translate everything so the top-left of the collection lands at ~(200,160)
  // — a pleasant drop location that pasteObjects will further offset.
  const xs = out.map((o) => o.x);
  const ys = out.map((o) => o.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const dx = 200 - minX;
  const dy = 160 - minY;
  for (const o of out) {
    o.x += dx;
    o.y += dy;
  }
  return out;
}

/** Find `<svg>` inside a text/html clipboard payload and return its serialised text. */
export function extractSvgFromHtml(html: string): string | null {
  if (!html?.includes("<svg")) return null;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const svg = doc.querySelector("svg");
    if (!svg) return null;
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return null;
  }
}
