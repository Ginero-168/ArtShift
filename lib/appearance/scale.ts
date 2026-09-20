import type { EngineElement } from "@/lib/engine/types";
import { readAppearance } from "./legacyAdapter";
import { normalizeAppearance } from "./normalize";
import { appearanceElementPatch } from "./persist";
import type { Appearance, AppearanceItem } from "./types";

const UNIFORM_EPSILON = 1e-6;

export type AppearanceScaleFactors = {
  /** Width scale (applied to X offsets). */
  sx: number;
  /** Height scale (applied to Y offsets). */
  sy: number;
  /** Average of |sx| and |sy| — depth, blur, softness, stroke width. */
  uniform: number;
};

export function appearanceScaleFactors(
  previous: { width: number; height: number },
  next: { width: number; height: number },
): AppearanceScaleFactors {
  const sx = next.width / Math.max(1e-6, previous.width);
  const sy = next.height / Math.max(1e-6, previous.height);
  return {
    sx,
    sy,
    uniform: Math.max(0.01, (Math.abs(sx) + Math.abs(sy)) / 2),
  };
}

function scaleLength(value: number, factor: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(factor)) return value;
  return value * factor;
}

function scaleAppearanceItem(
  item: AppearanceItem,
  sx: number,
  sy: number,
  uniform: number,
): AppearanceItem {
  if (item.kind === "stroke") {
    return {
      ...item,
      width: scaleLength(item.width, uniform),
      offsetX: item.offsetX !== undefined ? scaleLength(item.offsetX, sx) : item.offsetX,
      offsetY: item.offsetY !== undefined ? scaleLength(item.offsetY, sy) : item.offsetY,
    };
  }
  if (item.kind === "fill" || item.kind === "background") {
    return {
      ...item,
      offsetX: item.offsetX !== undefined ? scaleLength(item.offsetX, sx) : item.offsetX,
      offsetY: item.offsetY !== undefined ? scaleLength(item.offsetY, sy) : item.offsetY,
    };
  }
  if (item.kind !== "effect") return item;
  const effect = item.effect;
  if (effect.type === "shadow") {
    return {
      ...item,
      effect: {
        ...effect,
        blur: scaleLength(effect.blur, uniform),
        offsetX: scaleLength(effect.offsetX, sx),
        offsetY: scaleLength(effect.offsetY, sy),
        layers: effect.layers?.map((layer) => ({
          ...layer,
          blur: scaleLength(layer.blur, uniform),
          offsetX: scaleLength(layer.offsetX, sx),
          offsetY: scaleLength(layer.offsetY, sy),
        })),
      },
    };
  }
  if (effect.type === "glow") {
    return {
      ...item,
      effect: {
        ...effect,
        blur: scaleLength(effect.blur, uniform),
        layers: effect.layers?.map((layer) => ({
          ...layer,
          blur: scaleLength(layer.blur, uniform),
        })),
      },
    };
  }
  if (effect.type === "gaussianBlur") {
    return {
      ...item,
      effect: {
        ...effect,
        radius: scaleLength(effect.radius, uniform),
      },
    };
  }
  if (effect.type === "extrude") {
    return {
      ...item,
      effect: {
        ...effect,
        depth: scaleLength(effect.depth, uniform),
        // angle, steps, and unitless taper (%) stay as-is
      },
    };
  }
  if (effect.type === "emboss") {
    return {
      ...item,
      effect: {
        ...effect,
        depth: scaleLength(effect.depth, uniform),
        softness: scaleLength(effect.softness, uniform),
      },
    };
  }
  return item;
}

/**
 * Illustrator-like “Scale Strokes & Effects”: multiply size-like fields.
 * Angles, colors, blend modes, and unitless percents are unchanged.
 */
export function scaleAppearance(appearance: Appearance, sx: number, sy: number = sx): Appearance {
  const uniform = Math.max(0.01, (Math.abs(sx) + Math.abs(sy)) / 2);
  if (
    Math.abs(uniform - 1) < UNIFORM_EPSILON &&
    Math.abs(sx - 1) < UNIFORM_EPSILON &&
    Math.abs(sy - 1) < UNIFORM_EPSILON
  ) {
    return appearance;
  }
  return normalizeAppearance({
    ...appearance,
    items: appearance.items.map((item) => scaleAppearanceItem(item, sx, sy, uniform)),
  });
}

/** Patch that scales the element's Appearance with a geometry transform. */
export function scaledAppearancePatch(
  element: EngineElement,
  sx: number,
  sy: number = sx,
): Partial<EngineElement> {
  const appearance = scaleAppearance(readAppearance(element), sx, sy);
  return appearanceElementPatch(appearance, element);
}
