import type { EngineElement } from "@/lib/engine/types";
import {
  emptyAppearance,
  normalizeAppearance,
  normalizeStops,
  validateAppearance,
} from "./normalize";
import type {
  Appearance,
  AppearanceItem,
  AppearanceSnapshot,
  EffectAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";

function itemId(prefix: string, seed: string): string {
  return `${prefix}:${seed}`;
}

function legacyFill(element: EngineElement): FillAppearance | null {
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

  if (element.fillStyle === "none" && element.backgroundColor === "transparent") {
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

function legacyStroke(element: EngineElement): StrokeAppearance | null {
  if (element.strokeWidth <= 0 && element.strokeColor === "transparent") return null;
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

/** Synthesize Appearance from legacy flat fields. Used when `appearance` is absent. */
export function synthesizeAppearanceFromLegacy(element: EngineElement): AppearanceSnapshot {
  const items: AppearanceItem[] = [];
  const fill = legacyFill(element);
  if (fill) items.push(fill);
  const stroke = legacyStroke(element);
  if (stroke) items.push(stroke);
  items.push(...legacyEffects(element));

  const appearance = normalizeAppearance({
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
      const appearance = normalizeAppearance(stored);
      if (!validateAppearance(appearance)) {
        return { ...appearance, fromLegacy: false, unsupported };
      }
    } catch {
      // Fall through to legacy synthesis; hydrate keeps the raw stored object.
    }
  }
  return synthesizeAppearanceFromLegacy(element);
}

/** Apply Appearance root + first fill/stroke/effects back onto legacy fields. */
export function appearanceToLegacyPatch(appearance: Appearance): Partial<EngineElement> {
  const normalized = normalizeAppearance(appearance);
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

  const fill = normalized.items.find(
    (item): item is FillAppearance => item.kind === "fill" && item.visible,
  );
  if (fill) {
    patch.fillStyle = fill.fillStyle;
    if (fill.paint.type === "solid") {
      patch.backgroundColor = fill.paint.color;
      patch.fillType = "solid";
    } else if (fill.paint.type === "linearGradient") {
      patch.fillType = "linear";
      patch.gradientAngle = fill.paint.angle;
      patch.gradientColors = fill.paint.stops.map((stop) => stop.color);
      patch.gradientStops = fill.paint.stops.map((stop) => stop.offset);
      patch.backgroundColor = fill.paint.stops[0]?.color ?? "transparent";
    } else if (fill.paint.type === "radialGradient") {
      patch.fillType = "radial";
      patch.gradientColors = fill.paint.stops.map((stop) => stop.color);
      patch.gradientStops = fill.paint.stops.map((stop) => stop.offset);
      patch.backgroundColor = fill.paint.stops[0]?.color ?? "transparent";
    } else {
      patch.fillPattern = fill.paint.pattern;
      patch.backgroundColor = fill.paint.foreground;
    }
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
