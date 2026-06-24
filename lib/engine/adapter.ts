/**
 * Legacy ↔ Engine adapter.
 *
 * Converts the legacy `SlideDoc / Slide / SlideObject` (1280×720, crisp
 * rendering, degrees for rotation) into the new `EngineDoc / EngineSlide /
 * EngineElement` format (1920×1080, radians, hand-drawn-by-default).
 *
 * To preserve the visual look of legacy content we set:
 *   - roughness = 0 (clean / architect)
 *   - fillStyle = "solid"
 *   - edgeStyle = cornerRadius > 0 ? "round" : "sharp"
 *
 * Coordinates are scaled by 1.5× both axes (1280→1920, 720→1080). The same
 * factor applies to widths/heights/font sizes.
 *
 * Triangle has no engine analogue yet → mapped to diamond as a pragmatic
 * fallback (close enough visually). We can add a polygon element later.
 *
 * Image binaries: the legacy `src` is a dataURL or a remote URL. We register
 * dataURLs with the image cache so they render immediately; remote URLs are
 * stored as-is and decoded on demand.
 */

import { shapeDiagonal } from "../shape";
import type { ImageObject, ShapeObject, Slide, SlideDoc, SlideObject, TextObject } from "../types";
import {
  createArrow,
  createDiamond,
  createEllipse,
  createImage,
  createLine,
  createRect,
  createText,
} from "./factory";
import { loadDataURL } from "./imageCache";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineSlide,
  SLIDE_H,
  SLIDE_W,
} from "./types";

const LEGACY_W = 1280;
const LEGACY_H = 720;

export type LegacyConvertOptions = {
  /** Override the auto scale (default = SLIDE_W / LEGACY_W = 1.5). */
  scale?: number;
};

export async function legacyToEngineDoc(
  legacy: SlideDoc,
  opts: LegacyConvertOptions = {},
): Promise<EngineDoc> {
  const k = opts.scale ?? SLIDE_W / LEGACY_W;
  const slides: EngineSlide[] = [];
  for (const sl of legacy.slides) slides.push(await legacyToEngineSlide(sl, k));
  return {
    id: legacy.id,
    title: legacy.title,
    width: SLIDE_W,
    height: SLIDE_H,
    slides,
    snapGrid: null,
    updatedAt: legacy.updatedAt,
    schemaVersion: ENGINE_SCHEMA_VERSION,
  };
}

async function legacyToEngineSlide(legacy: Slide, k: number): Promise<EngineSlide> {
  const elements: EngineElement[] = [];
  let z = 1;
  for (const obj of legacy.objects) {
    const el = await legacyObjectToElement(obj, k);
    if (!el) continue;
    elements.push({ ...el, z: z++ });
  }
  return {
    id: legacy.id,
    name: legacy.name,
    background: legacy.background,
    elements,
    width: SLIDE_W,
    height: SLIDE_H,
  };
}

async function legacyObjectToElement(obj: SlideObject, k: number): Promise<EngineElement | null> {
  const baseGeom = {
    x: obj.x * k,
    y: obj.y * k,
    width: obj.width * k,
    height: obj.height * k,
  };
  const angle = ((obj.rotation || 0) * Math.PI) / 180;
  const opacity = obj.opacity ?? 1;
  const locked = obj.locked ?? false;

  if (obj.type === "shape") return convertShape(obj, baseGeom, angle, opacity, locked, k);
  if (obj.type === "text") return convertText(obj, baseGeom, angle, opacity, locked, k);
  if (obj.type === "image") return convertImage(obj, baseGeom, angle, opacity, locked);
  return null;
}

type Geom = { x: number; y: number; width: number; height: number };

function applyCommon<T extends EngineElement>(
  el: T,
  angle: number,
  opacity: number,
  locked: boolean,
): T {
  return { ...el, angle, opacity, locked };
}

function convertShape(
  obj: ShapeObject,
  geom: Geom,
  angle: number,
  opacity: number,
  locked: boolean,
  k: number,
): EngineElement {
  const stroke = obj.stroke || "#1b1b1f";
  const fill = obj.fill || "transparent";
  const strokeWidth = Math.max(1, (obj.strokeWidth || 0) * k);
  const styleOverlay = {
    strokeColor: stroke,
    backgroundColor: fill,
    strokeWidth: strokeWidth || 2,
    fillStyle: "solid" as const,
    roughness: 0 as const,
    edgeStyle: (obj.shape === "rect" && (obj.cornerRadius ?? 0) > 0 ? "round" : "sharp") as
      | "sharp"
      | "round",
  };
  if (obj.shape === "rect") {
    const el = createRect(geom);
    el.cornerRadius = (obj.cornerRadius ?? 0) * k;
    return applyCommon({ ...el, ...styleOverlay }, angle, opacity, locked);
  }
  if (obj.shape === "ellipse") {
    return applyCommon({ ...createEllipse(geom), ...styleOverlay }, angle, opacity, locked);
  }
  if (obj.shape === "triangle") {
    // Map to diamond as a pragmatic fallback — close enough to a triangle for
    // most decks; can be upgraded to a real polygon element later.
    return applyCommon({ ...createDiamond(geom), ...styleOverlay }, angle, opacity, locked);
  }
  if (obj.shape === "line" || obj.shape === "arrow") {
    const [sx, sy, ex, ey] = shapeDiagonal(obj);
    const a: [number, number] = [obj.x * k + sx * k, obj.y * k + sy * k];
    const b: [number, number] = [obj.x * k + ex * k, obj.y * k + ey * k];
    const base = obj.shape === "arrow" ? createArrow(a, b) : createLine(a, b);
    return applyCommon(
      {
        ...base,
        // Lines/arrows in legacy use `fill` as the visible color.
        strokeColor: obj.fill || stroke,
        strokeWidth: Math.max(2, strokeWidth || 4),
        roughness: 0,
      },
      angle,
      opacity,
      locked,
    );
  }
  return applyCommon({ ...createRect(geom), ...styleOverlay }, angle, opacity, locked);
}

function convertText(
  obj: TextObject,
  geom: Geom,
  angle: number,
  opacity: number,
  locked: boolean,
  k: number,
): EngineElement {
  const el = createText({
    x: geom.x,
    y: geom.y,
    text: obj.text,
    fontSize: obj.fontSize * k,
    fontFamily: obj.fontFamily,
    width: geom.width,
    height: geom.height,
  });
  return applyCommon(
    {
      ...el,
      strokeColor: obj.fill,
      fontStyle: obj.fontStyle,
      textAlign: obj.align,
      lineHeight: obj.lineHeight,
    },
    angle,
    opacity,
    locked,
  );
}

async function convertImage(
  obj: ImageObject,
  geom: Geom,
  angle: number,
  opacity: number,
  locked: boolean,
): Promise<EngineElement> {
  let fileId = obj.src;
  let nw = geom.width;
  let nh = geom.height;
  if (obj.src.startsWith("data:")) {
    try {
      const cached = await loadDataURL(obj.src);
      fileId = cached.fileId;
      nw = cached.width;
      nh = cached.height;
    } catch {
      /* fall through with src as fileId */
    }
  }
  return applyCommon(
    createImage({
      x: geom.x,
      y: geom.y,
      width: geom.width,
      height: geom.height,
      fileId,
      naturalWidth: nw,
      naturalHeight: nh,
    }),
    angle,
    opacity,
    locked,
  );
}
