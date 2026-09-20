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
import { applyRecipeStill } from "./stills";
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
    style: spec.slug === "contour" || spec.slug === "stamp" ? "dashed" : "solid",
    alignment: "center",
    paintOrder: "fill",
  };
}

function shadowItem(spec: TextEffectSourceSpec): EffectAppearance | null {
  const visible = spec.shadows.filter((layer) => {
    const color = resolveColorionColor(layer.color);
    return (
      color !== "transparent" &&
      color !== "none" &&
      !color.endsWith(",0)") &&
      !color.endsWith(", 0)")
    );
  });
  if (!visible.length) return null;
  const [primary, ...layers] = visible.map((layer) => ({
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

function extrudeItem(spec: TextEffectSourceSpec): EffectAppearance | null {
  if (!spec.extrude) return null;
  return {
    id: itemId("effect", spec.slug, "extrude"),
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: {
      type: "extrude",
      depth: spec.extrude.depth,
      angle: spec.extrude.angle,
      steps: spec.extrude.steps,
      sideColor: resolveColorionColor(spec.extrude.sideColor),
      sideFromFill: spec.extrude.sideFromFill === true,
      taper: spec.extrude.taper ?? 0,
    },
  };
}

function embossItem(spec: TextEffectSourceSpec): EffectAppearance | null {
  if (!spec.emboss) return null;
  return {
    id: itemId("effect", spec.slug, "emboss"),
    kind: "effect",
    visible: true,
    opacity: 1,
    scope: "object",
    effect: {
      type: "emboss",
      mode: spec.emboss.mode,
      depth: spec.emboss.depth,
      angle: spec.emboss.angle,
      softness: spec.emboss.softness,
      highlightColor: resolveColorionColor(spec.emboss.highlightColor),
      shadowColor: resolveColorionColor(spec.emboss.shadowColor),
    },
  };
}

function usesFrontBlend(blend: FillAppearance["blendMode"] | undefined): boolean {
  return !!blend && blend !== "source-over";
}

function offsetFills(spec: TextEffectSourceSpec, side: "behind" | "front"): FillAppearance[] {
  return (spec.offsetFills ?? [])
    .filter((layer) => {
      const front = usesFrontBlend(layer.blendMode ?? spec.blend);
      return side === "front" ? front : !front;
    })
    .map((layer, index) => ({
      id: itemId("fill", spec.slug, `offset-${side}-${index}`),
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
  if (spec.hasBoxReflect) notes.push("box_reflect_css_only");
  if (spec.hasMask && spec.slug === "lens") notes.push("radial_mask_and_backdrop_filter_css_only");
  else if (spec.hasMask) notes.push("css_mask_approximated_with_pattern_or_offsets");
  if (spec.staticCaps.includes("skew_rotate")) notes.push("per_letter_transform_frozen");
  return notes;
}

/**
 * True when the canvas/SVG stack can paint a recognizable still.
 * Remaining CSS-only: true `box-reflect`, and Liquid-Lens radial mask + backdrop-filter puck.
 */
function rendererSupport(spec: TextEffectSourceSpec): boolean {
  if (spec.hasBoxReflect) return false;
  if (spec.slug === "lens") return false;
  return true;
}

export function compileTextEffectAppearance(spec: TextEffectSourceSpec): Appearance {
  const still = applyRecipeStill(spec);
  const items: AppearanceItem[] = [];
  items.push(...offsetFills(still, "behind"));
  items.push(glyphFill(still));
  items.push(...offsetFills(still, "front"));
  items.push(outlineStroke(still));
  const extrude = extrudeItem(still);
  if (extrude) items.push(extrude);
  const emboss = embossItem(still);
  if (emboss) items.push(emboss);
  const shadow = shadowItem(still);
  if (shadow) items.push(shadow);
  const blur = blurItem(still);
  if (blur) items.push(blur);
  return normalizeAppearance({
    ...emptyAppearance({ opacity: 1, blendMode: "source-over", paintSemantics: "object" }),
    items,
  });
}

export function compileTextEffectPreset(spec: TextEffectSourceSpec): TextEffectPreset {
  const still = applyRecipeStill(spec);
  return {
    id: spec.id,
    name: spec.name,
    slug: spec.slug,
    family: spec.family,
    description: spec.description,
    staticCaps: spec.staticCaps,
    sourceHasAnimation: spec.sourceHasAnimation,
    staticStrategy: "freeze_key_visual",
    rendererSupport: rendererSupport(still),
    deferredNotes: deferredNotes(still),
    recipe: {
      appearance: compileTextEffectAppearance(spec),
      letterSpacingEm: still.letterSpacingEm,
    },
  };
}

export function fallbackInkColor(): string {
  return COLORION_INK.ink;
}
