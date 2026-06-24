import { nanoid } from "nanoid";
import { DEFAULT_THAI_FONT_FAMILY } from "./fonts";
import {
  CURRENT_SCHEMA_VERSION,
  type ImageObject,
  type ShapeObject,
  type Slide,
  type SlideDoc,
  type SlideObject,
  type TextObject,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceNumber(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function coerceString(v: unknown, d: string): string {
  return typeof v === "string" ? v : d;
}

function sanitizeBaseFields(o: UnknownRecord) {
  return {
    id: coerceString(o.id, nanoid(8)),
    x: coerceNumber(o.x, 0),
    y: coerceNumber(o.y, 0),
    width: Math.max(1, coerceNumber(o.width, 100)),
    height: Math.max(1, coerceNumber(o.height, 40)),
    rotation: coerceNumber(o.rotation, 0),
    opacity: Math.min(1, Math.max(0, coerceNumber(o.opacity, 1))),
    locked: Boolean(o.locked) || undefined,
    name: typeof o.name === "string" ? o.name : undefined,
  };
}

function sanitizeObject(raw: unknown): SlideObject | null {
  if (!isRecord(raw)) return null;
  const base = sanitizeBaseFields(raw);
  const type = raw.type;
  if (type === "text") {
    const t: TextObject = {
      ...base,
      type: "text",
      text: coerceString(raw.text, ""),
      fontSize: Math.max(4, coerceNumber(raw.fontSize, 24)),
      fontFamily: coerceString(raw.fontFamily, DEFAULT_THAI_FONT_FAMILY),
      fontStyle: (["normal", "bold", "italic", "bold italic"] as const).includes(
        raw.fontStyle as TextObject["fontStyle"],
      )
        ? (raw.fontStyle as TextObject["fontStyle"])
        : "normal",
      align: (["left", "center", "right"] as const).includes(raw.align as TextObject["align"])
        ? (raw.align as TextObject["align"])
        : "left",
      fill: coerceString(raw.fill, "#111111"),
      lineHeight: Math.max(0.5, coerceNumber(raw.lineHeight, 1.25)),
      autoFit: raw.autoFit === true ? true : undefined,
    };
    return t;
  }
  if (type === "image") {
    const i: ImageObject = {
      ...base,
      type: "image",
      src: coerceString(raw.src, ""),
      alt: typeof raw.alt === "string" ? raw.alt : undefined,
    };
    if (!i.src) return null;
    return i;
  }
  if (type === "shape") {
    const shapeKinds = ["rect", "ellipse", "line", "arrow", "triangle"] as const;
    const shape = shapeKinds.includes(raw.shape as (typeof shapeKinds)[number])
      ? (raw.shape as ShapeObject["shape"])
      : "rect";
    const s: ShapeObject = {
      ...base,
      type: "shape",
      shape,
      fill: coerceString(raw.fill, "#6366f1"),
      stroke: coerceString(raw.stroke, "#1f2230"),
      strokeWidth: Math.max(0, coerceNumber(raw.strokeWidth, 0)),
      cornerRadius:
        raw.cornerRadius !== undefined ? Math.max(0, coerceNumber(raw.cornerRadius, 0)) : undefined,
      flipX: raw.flipX === true ? true : undefined,
      flipY: raw.flipY === true ? true : undefined,
    };
    return s;
  }
  return null;
}

function sanitizeSlide(raw: unknown): Slide | null {
  if (!isRecord(raw)) return null;
  const objects: SlideObject[] = [];
  if (Array.isArray(raw.objects)) {
    for (const obj of raw.objects) {
      const s = sanitizeObject(obj);
      if (s) objects.push(s);
    }
  }
  return {
    id: coerceString(raw.id, nanoid(8)),
    name: coerceString(raw.name, "Slide"),
    background: coerceString(raw.background, "#ffffff"),
    objects,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

/**
 * Validate and migrate a raw value (possibly from localStorage) into a
 * well-formed SlideDoc. Returns null if the value is unrecoverably broken.
 * Use `fallback` to produce a default when null.
 */
export function migrateDoc(raw: unknown): SlideDoc | null {
  if (!isRecord(raw)) return null;
  const version = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;

  // Future-proof: chain migrations here.
  // v0 -> v1: add schemaVersion field, keep object shape the same.
  let value: UnknownRecord = { ...raw };
  if (version < 1) {
    value = { ...value, schemaVersion: 1 };
  }

  // Sanitize slides.
  const slides: Slide[] = [];
  if (Array.isArray(value.slides)) {
    for (const s of value.slides) {
      const slide = sanitizeSlide(s);
      if (slide) slides.push(slide);
    }
  }
  if (!slides.length) return null;

  return {
    id: coerceString(value.id, nanoid(10)),
    title: coerceString(value.title, "Untitled brief"),
    width: coerceNumber(value.width, 1280),
    height: coerceNumber(value.height, 720),
    slides,
    updatedAt: coerceNumber(value.updatedAt, Date.now()),
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}
