import { createVectorized } from "@/lib/engine/factory";
import type { EngineElement, VectorizedElement } from "@/lib/engine/types";
import type { VectorizeResult } from "./vectorizerTypes";
import { getSvgViewport } from "./vtracerAdapter";

const SVG_NS = "http://www.w3.org/2000/svg";
const VECTOR_CONTENT_PATTERN = /<(?:path|polygon|polyline|rect|circle|ellipse|line|g|use|text)\b/i;

export type AtomicVectorizeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function isVectorizedElement(element: EngineElement): element is VectorizedElement {
  return element.type === "vectorized";
}

/** True when the selection is exactly one locked Vectorize result. */
export function isAtomicVectorizedSelection(
  selected: readonly EngineElement[],
): selected is readonly [VectorizedElement] {
  return selected.length === 1 && isVectorizedElement(selected[0]);
}

export function isLockedCompoundObject(element: EngineElement): boolean {
  return isVectorizedElement(element) && element.atomic === true;
}

export function canUngroupVectorized(_element: EngineElement): boolean {
  return false;
}

export function canIsolateVectorizedChildren(_element: EngineElement): boolean {
  return false;
}

export function svgHasVectorContent(svg: string): boolean {
  return VECTOR_CONTENT_PATTERN.test(svg);
}

export function createAtomicVectorizedFromSvg(params: {
  svg: string;
  bounds: AtomicVectorizeBounds;
  sourceWidth?: number;
  sourceHeight?: number;
  name?: string;
}): VectorizedElement {
  const svg = params.svg.trim();
  if (!svg) throw new Error("Vectorize returned an empty SVG.");
  if (!svgHasVectorContent(svg)) {
    throw new Error("Vectorize returned no vector content.");
  }
  const viewport =
    params.sourceWidth && params.sourceHeight && params.sourceWidth > 0 && params.sourceHeight > 0
      ? { width: params.sourceWidth, height: params.sourceHeight }
      : getSvgViewport(svg);
  return createVectorized({
    svg,
    x: params.bounds.x,
    y: params.bounds.y,
    width: params.bounds.width,
    height: params.bounds.height,
    sourceWidth: viewport.width,
    sourceHeight: viewport.height,
    name: params.name ?? "Vectorized",
  });
}

export function createAtomicVectorizedFromResult(
  result: Pick<VectorizeResult, "svgString" | "width" | "height">,
  bounds: AtomicVectorizeBounds,
): VectorizedElement {
  return createAtomicVectorizedFromSvg({
    svg: result.svgString,
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: result.width || bounds.width,
      height: result.height || bounds.height,
    },
  });
}

/** Option Bar labels when a Vectorize result is selected — Download SVG only. */
export function getAtomicVectorizedOptionBarLabels(
  selected: readonly EngineElement[],
): string[] | null {
  if (!isAtomicVectorizedSelection(selected)) return null;
  return ["Download as SVG"];
}

export function vectorizedSvgMarkup(element: VectorizedElement): string {
  const prepared = upsertSvgRootAttributes(element.svg, {
    xmlns: SVG_NS,
    width: String(Math.max(1, Math.round(element.width))),
    height: String(Math.max(1, Math.round(element.height))),
    viewBox: existingViewBox(element.svg) ?? `0 0 ${element.sourceWidth} ${element.sourceHeight}`,
  });
  return prepared.startsWith("<?xml")
    ? prepared
    : `<?xml version="1.0" encoding="UTF-8"?>\n${prepared}`;
}

export function prepareSvgForCanvas(element: VectorizedElement): string {
  return upsertSvgRootAttributes(element.svg, {
    xmlns: SVG_NS,
    width: String(element.sourceWidth),
    height: String(element.sourceHeight),
    viewBox: existingViewBox(element.svg) ?? `0 0 ${element.sourceWidth} ${element.sourceHeight}`,
  });
}

export function downloadVectorizedSvg(element: VectorizedElement, filename = "vectorized.svg") {
  if (typeof document === "undefined") return;
  const blob = new Blob([vectorizedSvgMarkup(element)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function existingViewBox(svg: string): string | undefined {
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (!root) return undefined;
  const attrs = parseAttributes(root[1]);
  const viewBox = attrs.viewbox?.trim();
  return viewBox || undefined;
}

function upsertSvgRootAttributes(svg: string, patch: Record<string, string>): string {
  const markup = svg.trim();
  if (!/<svg\b/i.test(markup)) {
    const attrs = Object.entries({ xmlns: SVG_NS, ...patch })
      .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
      .join(" ");
    return `<svg ${attrs}>${markup}</svg>`;
  }
  return markup.replace(/<svg\b([^>]*)>/i, (_full, rawAttrs: string) => {
    const attrs = parseAttributes(rawAttrs);
    for (const [key, value] of Object.entries(patch)) {
      attrs[key.toLowerCase() === "viewbox" ? "viewBox" : key] = value;
      if (key.toLowerCase() === "viewbox") delete attrs.viewbox;
    }
    if (!attrs.xmlns) attrs.xmlns = SVG_NS;
    const serialized = Object.entries(attrs)
      .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
      .join(" ");
    return `<svg ${serialized}>`;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  for (const match of source.matchAll(attributePattern)) {
    attributes[match[1].toLowerCase() === "viewbox" ? "viewBox" : match[1]] = match[3];
  }
  return attributes;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
