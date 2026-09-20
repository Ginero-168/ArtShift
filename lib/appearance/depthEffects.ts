import { parseCssColor } from "@/lib/color/swatches";
import {
  type AppearanceEmbossEffect,
  type AppearanceExtrudeEffect,
  type AppearanceItem,
  type EffectAppearance,
  MAX_EMBOSS_SOFTNESS,
  MAX_EXTRUDE_DEPTH,
  MAX_EXTRUDE_STEPS,
  MAX_EXTRUDE_TAPER,
} from "./types";

type Padding = { top: number; right: number; bottom: number; left: number };

function wrapAngleDegrees(angle: number, fallback = 45): number {
  if (!Number.isFinite(angle)) return fallback;
  const wrapped = angle % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export type DepthEffectRole = "shadow" | "highlight";

/**
 * `halo` uses Canvas2D `shadow*` (source + colored drop).
 * `tint` paints a SourceAlpha-colored copy — required for light colors,
 * because `shadow*` of a colored still drops / multiplies highlights.
 */
export type DepthEffectComposite = "halo" | "tint";

export type DepthEffectPass = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  /** 1 = parallel copy. <1 scales the copy toward the element bounds center. */
  scale?: number;
  role?: DepthEffectRole;
  composite?: DepthEffectComposite;
};

const SIDE_DARKEN = 0.42;

export function clampExtrudeDepth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_EXTRUDE_DEPTH, value));
}

export function clampExtrudeSteps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_EXTRUDE_STEPS, Math.round(value)));
}

export function clampEmbossSoftness(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_EMBOSS_SOFTNESS, value));
}

export function clampExtrudeTaper(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_EXTRUDE_TAPER, value as number));
}

/** Scale of a copy at `progress` along depth (0 = face, 1 = farthest). */
export function extrudeCopyScale(taper: number, progress: number): number {
  const amount = clampExtrudeTaper(taper);
  if (amount <= 0) return 1;
  const t = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  return Math.max(0, 1 - amount * t);
}

export function offsetFromAngle(angle: number, distance: number): { x: number; y: number } {
  const rad = (wrapAngleDegrees(angle) * Math.PI) / 180;
  return { x: Math.cos(rad) * distance, y: Math.sin(rad) * distance };
}

export function formatRgba(r: number, g: number, b: number, a: number): string {
  const rr = Math.round(Math.min(255, Math.max(0, r)));
  const gg = Math.round(Math.min(255, Math.max(0, g)));
  const bb = Math.round(Math.min(255, Math.max(0, b)));
  const aa = Math.min(1, Math.max(0, a));
  if (aa >= 1) {
    return `#${[rr, gg, bb].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return `rgba(${rr}, ${gg}, ${bb}, ${Math.round(aa * 1000) / 1000})`;
}

export function applyColorOpacity(color: string, opacity: number): string {
  if (opacity >= 1) return color;
  const parsed = parseCssColor(color);
  return formatRgba(parsed.r, parsed.g, parsed.b, parsed.a * clamp01Unit(opacity));
}

function clamp01Unit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function darkenColor(color: string, amount = SIDE_DARKEN): string {
  const parsed = parseCssColor(color);
  const keep = 1 - amount;
  return formatRgba(parsed.r * keep, parsed.g * keep, parsed.b * keep, parsed.a);
}

export function resolveExtrudeSideColor(
  effect: AppearanceExtrudeEffect,
  faceColor: string,
): string {
  if (effect.sideFromFill) return darkenColor(faceColor);
  return effect.sideColor || darkenColor(faceColor);
}

export function normalizeExtrudeEffect(effect: AppearanceExtrudeEffect): AppearanceExtrudeEffect {
  return {
    type: "extrude",
    depth: clampExtrudeDepth(effect.depth),
    angle: wrapAngleDegrees(effect.angle),
    steps: clampExtrudeSteps(effect.steps),
    sideColor: effect.sideColor || "#2a2438",
    sideFromFill: effect.sideFromFill === true,
    taper: clampExtrudeTaper(effect.taper),
  };
}

export function normalizeEmbossEffect(effect: AppearanceEmbossEffect): AppearanceEmbossEffect {
  const mode =
    effect.mode === "deboss" || effect.mode === "bevel" ? effect.mode : ("emboss" as const);
  return {
    type: "emboss",
    mode,
    depth: clampExtrudeDepth(effect.depth),
    angle: wrapAngleDegrees(effect.angle),
    softness: clampEmbossSoftness(effect.softness),
    highlightColor: effect.highlightColor || "rgba(255, 255, 255, 0.72)",
    shadowColor: effect.shadowColor || "rgba(0, 0, 0, 0.55)",
  };
}

function copyCount(depth: number, steps: number): number {
  if (depth <= 0) return 0;
  if (steps <= 0) return Math.max(1, Math.min(MAX_EXTRUDE_STEPS, Math.round(depth)));
  return Math.max(1, Math.min(MAX_EXTRUDE_STEPS, steps));
}

/**
 * Back-to-front copies along the depth vector (farthest first).
 * t=0 (the face) is omitted — the cached still paints that.
 */
export function expandExtrudePasses(
  effect: AppearanceExtrudeEffect,
  options: { color: string; opacity?: number } = { color: effect.sideColor },
): DepthEffectPass[] {
  const depth = clampExtrudeDepth(effect.depth);
  const count = copyCount(depth, effect.steps);
  if (count === 0) return [];
  const color = applyColorOpacity(options.color, options.opacity ?? 1);
  const unit = offsetFromAngle(effect.angle, 1);
  const step = depth / count;
  const taper = clampExtrudeTaper(effect.taper);
  const passes: DepthEffectPass[] = [];
  for (let i = count; i >= 1; i--) {
    const distance = i * step;
    const scale = extrudeCopyScale(taper, distance / depth);
    if (scale <= 0) continue;
    passes.push({
      color,
      blur: 0,
      offsetX: unit.x * distance,
      offsetY: unit.y * distance,
      scale,
    });
  }
  return passes;
}

function embossPair(
  angle: number,
  depth: number,
  softness: number,
  highlightColor: string,
  shadowColor: string,
  invert: boolean,
): DepthEffectPass[] {
  if (depth <= 0 && softness <= 0) return [];
  // Light travels along `angle`; shadow is cast that way, highlight toward the source.
  const dir = offsetFromAngle(angle, depth);
  const shadow = invert ? { x: -dir.x, y: -dir.y } : dir;
  const highlight = { x: -shadow.x, y: -shadow.y };
  return [
    {
      color: shadowColor,
      blur: softness,
      offsetX: shadow.x,
      offsetY: shadow.y,
      role: "shadow",
      composite: "tint",
    },
    {
      color: highlightColor,
      blur: softness,
      offsetX: highlight.x,
      offsetY: highlight.y,
      role: "highlight",
      composite: "tint",
    },
  ];
}

export function expandEmbossPasses(
  effect: AppearanceEmbossEffect,
  options: { opacity?: number } = {},
): DepthEffectPass[] {
  const depth = clampExtrudeDepth(effect.depth);
  const softness = clampEmbossSoftness(effect.softness);
  const opacity = options.opacity ?? 1;
  const highlight = applyColorOpacity(effect.highlightColor, opacity);
  const shadow = applyColorOpacity(effect.shadowColor, opacity);
  const invert = effect.mode === "deboss";
  if (effect.mode === "bevel") {
    const outer = embossPair(effect.angle, depth, softness * 0.35, highlight, shadow, invert);
    const inner = embossPair(effect.angle, depth * 0.45, 0, highlight, shadow, invert);
    return [...outer, ...inner];
  }
  return embossPair(effect.angle, depth, softness, highlight, shadow, invert);
}

export function depthEffectPadding(item: EffectAppearance): Padding {
  const empty = { top: 0, right: 0, bottom: 0, left: 0 };
  if (!item.visible) return empty;
  if (item.effect.type === "extrude") {
    const depth = clampExtrudeDepth(item.effect.depth);
    const { x, y } = offsetFromAngle(item.effect.angle, depth);
    return {
      top: Math.max(0, -y),
      right: Math.max(0, x),
      bottom: Math.max(0, y),
      left: Math.max(0, -x),
    };
  }
  if (item.effect.type === "emboss") {
    const depth = clampExtrudeDepth(item.effect.depth);
    const softness = clampEmbossSoftness(item.effect.softness);
    const { x, y } = offsetFromAngle(item.effect.angle, depth);
    const expandX = Math.abs(x) + softness;
    const expandY = Math.abs(y) + softness;
    return { top: expandY, right: expandX, bottom: expandY, left: expandX };
  }
  return empty;
}

export function isExtrudeItem(
  item: AppearanceItem,
): item is EffectAppearance & { effect: AppearanceExtrudeEffect } {
  return item.kind === "effect" && item.effect.type === "extrude";
}

export function isEmbossItem(
  item: AppearanceItem,
): item is EffectAppearance & { effect: AppearanceEmbossEffect } {
  return item.kind === "effect" && item.effect.type === "emboss";
}
