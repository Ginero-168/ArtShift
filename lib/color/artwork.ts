import { syncElementAppearance } from "@/lib/appearance/persist";
import { isObjectLocked } from "@/lib/engine/layers";
import type { EngineElement, EngineSlide } from "@/lib/engine/types";
import { fromRgb, normalizeHex } from "./studio";

const COLOR_KEYS = new Set([
  "color",
  "strokeColor",
  "backgroundColor",
  "sideColor",
  "highlightColor",
  "shadowColor",
  "foreground",
  "background",
]);
const SVG_PAINTS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"];
function paint(value: string): { hex: string; alpha: number } | null {
  const simple = normalizeHex(value);
  if (simple) return { hex: simple, alpha: 1 };
  const hex = value.trim();
  if (/^#[\da-f]{8}$/i.test(hex))
    return { hex: hex.slice(0, 7).toLowerCase(), alpha: parseInt(hex.slice(7), 16) / 255 };
  if (/^#[\da-f]{4}$/i.test(hex))
    return {
      hex: `#${[...hex.slice(1, 4)].map((c) => c + c).join("")}`.toLowerCase(),
      alpha: parseInt(hex[4] + hex[4], 16) / 255,
    };
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    value,
  );
  if (m)
    return {
      hex: fromRgb(m.slice(1, 4).map(Number)),
      alpha: m[4] === undefined ? 1 : Number(m[4]),
    };
  const named: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    blue: "#0000ff",
    green: "#008000",
    yellow: "#ffff00",
    gray: "#808080",
    grey: "#808080",
  };
  return named[value.toLowerCase()] ? { hex: named[value.toLowerCase()], alpha: 1 } : null;
}
function transformPaint(
  value: string,
  map: Readonly<Record<string, string>>,
  collect?: Set<string>,
): string {
  const p = paint(value);
  if (!p || p.alpha <= 0) return value;
  collect?.add(p.hex);
  const next = map[p.hex];
  if (!next || next === p.hex) return value;
  return p.alpha < 1
    ? `${next}${Math.round(p.alpha * 255)
        .toString(16)
        .padStart(2, "0")}`
    : next;
}
function walk<T>(
  value: T,
  map: Readonly<Record<string, string>>,
  collect?: Set<string>,
  key = "",
): T {
  if (typeof value === "string")
    return (
      COLOR_KEYS.has(key) || key === "gradientColors" ? transformPaint(value, map, collect) : value
    ) as T;
  if (Array.isArray(value)) return value.map((v) => walk(v, map, collect, key)) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, walk(v, map, collect, k)]),
    ) as T;
  return value;
}
function svgPaints(
  svg: string,
  map: Readonly<Record<string, string>>,
  collect?: Set<string>,
): string {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg")
    throw new Error("SVG ไม่ถูกต้อง");
  // CSS selectors and animations need a full stylesheet cascade. Preserve rather than partly recolor.
  if (doc.querySelector("style,animate,animateColor,set"))
    throw new Error("SVG นี้มี stylesheet หรือ animation จึงเก็บสีต้นฉบับไว้");
  let changed = false;
  for (const el of Array.from(doc.querySelectorAll("*"))) {
    for (const name of SVG_PAINTS) {
      const old = el.getAttribute(name);
      if (!old) continue;
      const next = transformPaint(old, map, collect);
      if (next !== old) {
        el.setAttribute(name, next);
        changed = true;
      }
    }
    const style = el.getAttribute("style");
    if (style) {
      const next = style.replace(
        /(^|;)\s*(fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;]+)/gi,
        (all, prefix, name, value) => {
          const important = /\s*!important\s*$/i.test(value);
          const clean = value.replace(/\s*!important\s*$/i, "").trim();
          const replacement = transformPaint(clean, map, collect);
          return replacement === clean
            ? all
            : `${prefix}${name}:${replacement}${important ? " !important" : ""}`;
        },
      );
      if (next !== style) {
        el.setAttribute("style", next);
        changed = true;
      }
    }
  }
  return changed ? new XMLSerializer().serializeToString(doc) : svg;
}
export type RecolorResult = { slide: EngineSlide; changed: number; warnings: string[] };
export function artworkColors(slide: EngineSlide, ids?: ReadonlySet<string>): string[] {
  const colors = new Set<string>();
  if (!ids) transformPaint(slide.background, {}, colors);
  for (const el of slide.elements) {
    if (el.isDeleted || el.hidden || isObjectLocked(slide, el.id) || (ids && !ids.has(el.id)))
      continue;
    walk(el, {}, colors);
    if (el.type === "vectorized")
      try {
        svgPaints(el.svg, {}, colors);
      } catch {
        /* Unsupported SVG remains intact. */
      }
  }
  return [...colors].slice(0, 64);
}
export function recolorArtwork(
  slide: EngineSlide,
  map: Readonly<Record<string, string>>,
  ids?: ReadonlySet<string>,
  includeBackground = false,
): RecolorResult {
  const warnings: string[] = [];
  let changed = 0;
  const elements = slide.elements.map((el) => {
    if (el.isDeleted || el.hidden || isObjectLocked(slide, el.id) || (ids && !ids.has(el.id)))
      return el;
    let next = walk(el, map);
    if (el.type === "vectorized" && next.type === "vectorized")
      try {
        next.svg = svgPaints(el.svg, map);
      } catch (error) {
        warnings.push(
          `${el.name || "SVG"}: ${error instanceof Error ? error.message : "เปลี่ยนสีไม่ได้"}`,
        );
        return el;
      }
    if (JSON.stringify(next) === JSON.stringify(el)) return el;
    changed++;
    next = syncElementAppearance(el, next, next);
    return { ...next, version: el.version + 1 } as EngineElement;
  });
  const background = includeBackground ? transformPaint(slide.background, map) : slide.background;
  if (background !== slide.background) changed++;
  return { slide: changed ? { ...slide, elements, background } : slide, changed, warnings };
}
