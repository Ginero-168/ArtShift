import { defaultTextStrokeItem } from "../defaults";
import { emptyAppearance, normalizeAppearance } from "../normalize";
import type {
  Appearance,
  AppearanceItem,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "../types";
import { PRESET_FILL_PAINT } from "./paints";
import { COLORION_INK, resolveColorionColor } from "./tokens";
import type { TextEffectPreset, TextEffectSourceSpec } from "./types";

function itemId(kind: AppearanceItem["kind"], slug: string, slot: string): string {
  return `${kind}:fx:${slug}:${slot}`;
}

function glyphFill(
  spec: TextEffectSourceSpec,
  paint = spec.fillPaint ?? PRESET_FILL_PAINT[spec.slug],
  slot = "0",
): FillAppearance {
  return {
    id: itemId("fill", spec.slug, slot),
    kind: "fill",
    visible: true,
    opacity: 1,
    clipToGlyphs: true,
    fillStyle: "solid",
    paint: paint ?? { type: "solid", color: resolveColorionColor(spec.inkColor) },
    blendMode: spec.blend,
  };
}

function outlineStroke(spec: TextEffectSourceSpec): StrokeAppearance {
  if (!spec.stroke) {
    return {
      ...defaultTextStrokeItem(resolveColorionColor(spec.inkColor)),
      id: itemId("stroke", spec.slug, "0"),
    };
  }
  return {
    id: itemId("stroke", spec.slug, "0"),
    kind: "stroke",
    visible: true,
    opacity: 1,
    color: resolveColorionColor(spec.stroke.color),
    width: spec.stroke.width,
    style: "solid",
    alignment: "center",
    paintOrder: "fill",
  };
}

function shadowItem(spec: TextEffectSourceSpec): EffectAppearance | null {
  if (!spec.shadows.length) return null;
  const [primary, ...layers] = spec.shadows.map((layer) => ({
    ...layer,
    color: resolveColorionColor(layer.color),
  }));
  return {
    id: itemId("effect", spec.slug, "shadow"),
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: {
      type: "shadow",
      color: primary.color,
      blur: primary.blur,
      offsetX: primary.offsetX,
      offsetY: primary.offsetY,
      layers: layers.length ? layers : undefined,
    },
  };
}

function blurItem(spec: TextEffectSourceSpec): EffectAppearance | null {
  if (!spec.blurRadius || spec.blurRadius <= 0) return null;
  return {
    id: itemId("effect", spec.slug, "blur"),
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: { type: "gaussianBlur", radius: spec.blurRadius },
  };
}

function offsetFills(spec: TextEffectSourceSpec): FillAppearance[] {
  return (spec.offsetFills ?? []).map((layer, index) => ({
    id: itemId("fill", spec.slug, `offset-${index}`),
    kind: "fill",
    visible: true,
    opacity: layer.opacity ?? 0.85,
    clipToGlyphs: true,
    fillStyle: "solid",
    paint: { type: "solid", color: resolveColorionColor(layer.color) },
    offsetX: layer.offsetX,
    offsetY: layer.offsetY,
    blendMode: layer.blendMode ?? spec.blend,
  }));
}

function deferredNotes(spec: TextEffectSourceSpec): string[] {
  const notes: string[] = [];
  if (spec.sourceHasAnimation) notes.push("source_keyframes_stripped");
  if (spec.hasClipPath) notes.push("clip_path_approximated_with_offset_fills");
  if (spec.hasPseudo) notes.push("pseudo_layers_baked_to_stack");
  if (spec.hasBoxReflect) notes.push("box_reflect_deferred");
  if (spec.hasMask) notes.push("css_mask_deferred");
  if (spec.staticCaps.includes("skew_rotate")) notes.push("per_letter_transform_frozen");
  return notes;
}

function rendererSupport(spec: TextEffectSourceSpec): boolean {
  if (spec.hasBoxReflect || spec.hasMask) return false;
  return true;
}

export function compileTextEffectAppearance(spec: TextEffectSourceSpec): Appearance {
  const items: AppearanceItem[] = [];
  items.push(...offsetFills(spec));
  items.push(glyphFill(spec));
  items.push(outlineStroke(spec));
  const shadow = shadowItem(spec);
  if (shadow) items.push(shadow);
  const blur = blurItem(spec);
  if (blur) items.push(blur);
  return normalizeAppearance({
    ...emptyAppearance({ opacity: 1, blendMode: "source-over", paintSemantics: "object" }),
    items,
  });
}

export function compileTextEffectPreset(spec: TextEffectSourceSpec): TextEffectPreset {
  return {
    id: spec.id,
    name: spec.name,
    slug: spec.slug,
    family: spec.family,
    description: spec.description,
    staticCaps: spec.staticCaps,
    sourceHasAnimation: spec.sourceHasAnimation,
    staticStrategy: "freeze_key_visual",
    rendererSupport: rendererSupport(spec),
    deferredNotes: deferredNotes(spec),
    recipe: {
      appearance: compileTextEffectAppearance(spec),
      letterSpacingEm: spec.letterSpacingEm,
    },
  };
}

export function fallbackInkColor(): string {
  return COLORION_INK.ink;
}
