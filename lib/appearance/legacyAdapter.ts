import type { EngineElement } from "@/lib/engine/types";
import { defaultTextStrokeItem } from "./defaults";
import {
  emptyAppearance,
  normalizeAppearance,
  normalizeItem,
  normalizeStops,
  validateAppearance,
} from "./normalize";
import type {
  Appearance,
  AppearanceItem,
  AppearancePaint,
  AppearanceSnapshot,
  BackgroundAppearance,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";

function itemId(prefix: string, seed: string): string {
  return `${prefix}:${seed}`;
}

function isTransparentColor(color: string | undefined): boolean {
  return !color || color === "transparent" || color === "none";
}

function paintIsInvisible(paint: AppearancePaint): boolean {
  if (paint.type === "solid") return isTransparentColor(paint.color);
  if (paint.type === "pattern") {
    return isTransparentColor(paint.foreground) && isTransparentColor(paint.background);
  }
  return paint.stops.every((stop) => isTransparentColor(stop.color));
}

function fillFromBox(element: EngineElement): FillAppearance | null {
  if (element.fillPattern) {
    return {
      id: itemId("fill", element.id),
      kind: "fill",
      visible: true,
      opacity: 1,
      paint: {
        type: "pattern",
        pattern: element.fillPattern,
        foreground: element.backgroundColor || "#111827",
        background: "transparent",
      },
      fillStyle: element.fillStyle,
    };
  }

  if (element.fillType === "linear" || element.fillType === "radial") {
    const colors = element.gradientColors?.length
      ? element.gradientColors
      : [element.backgroundColor || "#ffffff", "#000000"];
    const stops = normalizeStops(
      colors.map((color, index) => ({
        offset:
          element.gradientStops?.[index] ?? (colors.length <= 1 ? 0 : index / (colors.length - 1)),
        color,
      })),
    );
    return {
      id: itemId("fill", element.id),
      kind: "fill",
      visible: true,
      opacity: 1,
      paint:
        element.fillType === "linear"
          ? {
              type: "linearGradient",
              angle: element.gradientAngle ?? 90,
              stops,
            }
          : { type: "radialGradient", stops },
      fillStyle: element.fillStyle,
    };
  }

  if (element.fillStyle === "none" && isTransparentColor(element.backgroundColor)) {
    return null;
  }

  return {
    id: itemId("fill", element.id),
    kind: "fill",
    visible: true,
    opacity: 1,
    paint: { type: "solid", color: element.backgroundColor || "transparent" },
    fillStyle: element.fillStyle,
  };
}

function backgroundFromBox(element: EngineElement): BackgroundAppearance | null {
  const fill = fillFromBox(element);
  if (!fill || paintIsInvisible(fill.paint)) return null;
  return {
    id: itemId("background", element.id),
    kind: "background",
    visible: fill.visible,
    opacity: fill.opacity,
    paint: fill.paint,
  };
}

function glyphFillFromStrokeColor(element: EngineElement): FillAppearance {
  return {
    id: itemId("fill", element.id),
    kind: "fill",
    visible: true,
    opacity: 1,
    paint: { type: "solid", color: element.strokeColor || "#1b1b1f" },
    fillStyle: "solid",
    clipToGlyphs: true,
  };
}

function legacyStroke(element: EngineElement): StrokeAppearance | null {
  if (element.strokeWidth <= 0 && isTransparentColor(element.strokeColor)) return null;
  return {
    id: itemId("stroke", element.id),
    kind: "stroke",
    visible: true,
    opacity: 1,
    color: element.strokeColor || "transparent",
    width: Math.max(0, element.strokeWidth ?? 0),
    style: element.strokeStyle || "solid",
    alignment: "center",
  };
}

function legacyEffects(element: EngineElement): EffectAppearance[] {
  const effects: EffectAppearance[] = [];
  if (element.shadow) {
    effects.push({
      id: itemId("shadow", element.id),
      kind: "effect",
      visible: true,
      opacity: 1,
      scope: "object",
      effect: {
        type: "shadow",
        color: element.shadow.color,
        blur: element.shadow.blur,
        offsetX: element.shadow.offsetX,
        offsetY: element.shadow.offsetY,
      },
    });
  }
  if (element.glow) {
    effects.push({
      id: itemId("glow", element.id),
      kind: "effect",
      visible: true,
      opacity: 1,
      scope: "object",
      effect: {
        type: "glow",
        color: element.glow.color,
        blur: element.glow.blur,
      },
    });
  }
  return effects;
}

function collectUnsupported(element: EngineElement): string[] {
  const unsupported: string[] = [];
  if (element.type === "image" && "adjustments" in element && element.adjustments) {
    unsupported.push("image.adjustments");
  }
  if (element.type === "image" && "filterBlur" in element && element.filterBlur) {
    unsupported.push("image.filterBlur");
  }
  return unsupported;
}

function withObjectSemantics(appearance: Appearance): Appearance {
  return normalizeAppearance({ ...appearance, paintSemantics: "object" });
}

/**
 * Older text Appearance stored the box as Fill and the glyph color as Stroke.
 * Remap to Illustrator-like roles: Fill = glyphs, Stroke = outline, Background = box.
 */
export function migrateTextPaintSemantics(
  element: EngineElement,
  appearance: Appearance,
): Appearance {
  if (appearance.paintSemantics === "object") return withObjectSemantics(appearance);
  if (element.type !== "text") return withObjectSemantics(appearance);
  if (appearance.items.some((item) => item.kind === "background")) {
    return withObjectSemantics(appearance);
  }

  const items: AppearanceItem[] = [];
  let glyphColor = element.strokeColor || "#1b1b1f";

  for (const item of appearance.items) {
    if (item.kind === "background") {
      items.push(item);
      continue;
    }
    if (item.kind === "fill") {
      if (!paintIsInvisible(item.paint)) {
        items.push({
          id: item.id.startsWith("fill:") ? item.id.replace("fill:", "background:") : item.id,
          kind: "background",
          visible: item.visible,
          opacity: item.opacity,
          paint: item.paint,
          blendMode: item.blendMode,
          offsetX: item.offsetX,
          offsetY: item.offsetY,
        });
      }
      continue;
    }
    if (item.kind === "stroke") {
      if (item.color && !isTransparentColor(item.color)) glyphColor = item.color;
      items.push({
        id: item.id.startsWith("stroke:") ? item.id.replace("stroke:", "fill:") : item.id,
        kind: "fill",
        visible: item.visible,
        opacity: item.opacity,
        paint: { type: "solid", color: item.color || glyphColor },
        fillStyle: "solid",
        clipToGlyphs: true,
        blendMode: item.blendMode,
        offsetX: item.offsetX,
        offsetY: item.offsetY,
      });
      continue;
    }
    items.push(item);
  }

  if (!items.some((item) => item.kind === "fill")) {
    items.unshift({
      ...glyphFillFromStrokeColor(element),
      paint: { type: "solid", color: glyphColor },
    });
  }
  if (!items.some((item) => item.kind === "stroke")) {
    const firstEffect = items.findIndex((item) => item.kind === "effect");
    const stroke = {
      ...defaultTextStrokeItem(glyphColor),
      id: itemId("stroke", element.id),
    };
    if (firstEffect === -1) items.push(stroke);
    else items.splice(firstEffect, 0, stroke);
  }

  return withObjectSemantics({ ...appearance, items: items.map(normalizeItem) });
}

/** Synthesize Appearance from legacy flat fields. Used when `appearance` is absent. */
export function synthesizeAppearanceFromLegacy(element: EngineElement): AppearanceSnapshot {
  const items: AppearanceItem[] = [];

  if (element.type === "text") {
    const background = backgroundFromBox(element);
    if (background) items.push(background);
    items.push(glyphFillFromStrokeColor(element));
    items.push({
      ...defaultTextStrokeItem(element.strokeColor || "#1b1b1f"),
      id: itemId("stroke", element.id),
    });
  } else {
    const fill = fillFromBox(element);
    if (fill) items.push(fill);
    const stroke = legacyStroke(element);
    if (stroke) items.push(stroke);
  }
  items.push(...legacyEffects(element));

  const appearance = withObjectSemantics({
    ...emptyAppearance({
      opacity: element.opacity,
      blendMode: element.blendMode ?? "source-over",
    }),
    items,
  });

  return {
    ...appearance,
    fromLegacy: true,
    unsupported: collectUnsupported(element),
  };
}

/**
 * Read semantic Appearance. Prefers the persisted `appearance` field (schema v7);
 * otherwise synthesizes from legacy flat fields.
 */
export function readAppearance(element: EngineElement): AppearanceSnapshot {
  const unsupported = collectUnsupported(element);
  const stored = element.appearance;
  if (stored) {
    try {
      const appearance = migrateTextPaintSemantics(element, normalizeAppearance(stored));
      if (!validateAppearance(appearance)) {
        return { ...appearance, fromLegacy: false, unsupported };
      }
    } catch {
      // Fall through to legacy synthesis; hydrate keeps the raw stored object.
    }
  }
  return synthesizeAppearanceFromLegacy(element);
}

function applyPaintToLegacyFill(
  patch: Partial<EngineElement>,
  paint: AppearancePaint,
  fillStyle?: FillAppearance["fillStyle"],
) {
  patch.fillStyle = fillStyle;
  if (paint.type === "solid") {
    patch.backgroundColor = paint.color;
    patch.fillType = "solid";
    return;
  }
  if (paint.type === "linearGradient") {
    patch.fillType = "linear";
    patch.gradientAngle = paint.angle;
    patch.gradientColors = paint.stops.map((stop) => stop.color);
    patch.gradientStops = paint.stops.map((stop) => stop.offset);
    patch.backgroundColor = paint.stops[0]?.color ?? "transparent";
    return;
  }
  if (paint.type === "radialGradient" || paint.type === "conicGradient") {
    patch.fillType = "radial";
    if (paint.type === "conicGradient") patch.gradientAngle = paint.angle;
    patch.gradientColors = paint.stops.map((stop) => stop.color);
    patch.gradientStops = paint.stops.map((stop) => stop.offset);
    patch.backgroundColor = paint.stops[0]?.color ?? "transparent";
    return;
  }
  patch.fillPattern = paint.pattern;
  patch.backgroundColor = paint.foreground;
}

function applyPaintToLegacyGlyph(patch: Partial<EngineElement>, paint: AppearancePaint) {
  if (paint.type === "solid") {
    patch.strokeColor = paint.color;
    return;
  }
  if (
    paint.type === "linearGradient" ||
    paint.type === "radialGradient" ||
    paint.type === "conicGradient"
  ) {
    patch.strokeColor = paint.stops[0]?.color ?? "#1b1b1f";
    return;
  }
  patch.strokeColor = paint.foreground;
}

/** Apply Appearance root + first fill/stroke/effects back onto legacy fields. */
export function appearanceToLegacyPatch(
  appearance: Appearance,
  element?: Pick<EngineElement, "type">,
): Partial<EngineElement> {
  const normalized = withObjectSemantics(appearance);
  const patch: Partial<EngineElement> = {
    opacity: normalized.opacity,
    blendMode: normalized.blendMode,
    shadow: undefined,
    glow: undefined,
    fillPattern: undefined,
    fillType: "solid",
    gradientColors: undefined,
    gradientAngle: undefined,
    gradientStops: undefined,
  };

  const isText = element?.type === "text";

  if (isText) {
    const fill = normalized.items.find(
      (item): item is FillAppearance => item.kind === "fill" && item.visible,
    );
    if (fill) applyPaintToLegacyGlyph(patch, fill.paint);
    else patch.strokeColor = "transparent";

    const background = normalized.items.find(
      (item): item is BackgroundAppearance => item.kind === "background" && item.visible,
    );
    if (background) {
      applyPaintToLegacyFill(patch, background.paint, "solid");
    } else {
      patch.backgroundColor = "transparent";
      patch.fillStyle = "none";
    }

    const stroke = normalized.items.find(
      (item): item is StrokeAppearance => item.kind === "stroke" && item.visible,
    );
    if (stroke) {
      patch.strokeWidth = stroke.width;
      patch.strokeStyle = stroke.style;
    }
  } else {
    const fill = normalized.items.find(
      (item): item is FillAppearance => item.kind === "fill" && item.visible,
    );
    if (fill) {
      applyPaintToLegacyFill(patch, fill.paint, fill.fillStyle);
    } else {
      patch.backgroundColor = "transparent";
      patch.fillStyle = "none";
    }

    const stroke = normalized.items.find(
      (item): item is StrokeAppearance => item.kind === "stroke" && item.visible,
    );
    if (stroke) {
      patch.strokeColor = stroke.color;
      patch.strokeWidth = stroke.width;
      patch.strokeStyle = stroke.style;
    } else {
      patch.strokeColor = "transparent";
      patch.strokeWidth = 0;
    }
  }

  for (const item of normalized.items) {
    if (item.kind !== "effect" || !item.visible) continue;
    if (item.effect.type === "shadow") {
      patch.shadow = {
        color: item.effect.color,
        blur: item.effect.blur,
        offsetX: item.effect.offsetX,
        offsetY: item.effect.offsetY,
      };
    }
    if (item.effect.type === "glow") {
      patch.glow = {
        color: item.effect.color,
        blur: item.effect.blur,
      };
    }
  }

  return patch;
}
