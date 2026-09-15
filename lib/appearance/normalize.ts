import {
  APPEARANCE_MAX_ITEMS,
  APPEARANCE_SCHEMA_VERSION,
  type Appearance,
  type AppearanceColorStop,
  type AppearanceError,
  type AppearanceItem,
  type AppearancePaint,
} from "./types";

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function normalizeAngleDegrees(angle: number): number {
  if (!Number.isFinite(angle)) return 90;
  const wrapped = angle % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

export function normalizeStops(stops: AppearanceColorStop[]): AppearanceColorStop[] {
  const cleaned = stops
    .filter((stop) => typeof stop.color === "string" && stop.color.length > 0)
    .map((stop) => ({ offset: clamp01(stop.offset), color: stop.color }))
    .sort((a, b) => a.offset - b.offset);
  if (cleaned.length >= 2) return cleaned;
  if (cleaned.length === 1) {
    return [
      { offset: 0, color: cleaned[0].color },
      { offset: 1, color: cleaned[0].color },
    ];
  }
  return [
    { offset: 0, color: "#ffffff" },
    { offset: 1, color: "#000000" },
  ];
}

export function normalizePaint(paint: AppearancePaint): AppearancePaint {
  if (paint.type === "solid") {
    return { type: "solid", color: paint.color || "transparent" };
  }
  if (paint.type === "linearGradient") {
    return {
      type: "linearGradient",
      angle: normalizeAngleDegrees(paint.angle),
      stops: normalizeStops(paint.stops),
    };
  }
  if (paint.type === "radialGradient") {
    return { type: "radialGradient", stops: normalizeStops(paint.stops) };
  }
  return {
    type: "pattern",
    pattern: paint.pattern,
    foreground: paint.foreground || "#111827",
    background: paint.background || "transparent",
  };
}

export function normalizeItem(item: AppearanceItem): AppearanceItem {
  const opacity = clamp01(item.opacity);
  if (item.kind === "fill") {
    return {
      ...item,
      visible: item.visible !== false,
      opacity,
      paint: normalizePaint(item.paint),
    };
  }
  if (item.kind === "stroke") {
    return {
      ...item,
      visible: item.visible !== false,
      opacity,
      color: item.color || "transparent",
      width: clampNonNegative(item.width),
      style: item.style || "solid",
      alignment: item.alignment ?? "center",
    };
  }
  const effect =
    item.effect.type === "shadow"
      ? {
          ...item.effect,
          blur: clampNonNegative(item.effect.blur),
          offsetX: Number.isFinite(item.effect.offsetX) ? item.effect.offsetX : 0,
          offsetY: Number.isFinite(item.effect.offsetY) ? item.effect.offsetY : 0,
        }
      : item.effect.type === "glow" || item.effect.type === "gaussianBlur"
        ? {
            ...item.effect,
            ...(item.effect.type === "glow"
              ? { blur: clampNonNegative(item.effect.blur) }
              : { radius: clampNonNegative(item.effect.radius) }),
          }
        : item.effect;
  return {
    ...item,
    visible: item.visible !== false,
    opacity,
    effect,
    scope: item.scope ?? "object",
  };
}

export function emptyAppearance(
  patch: Partial<Pick<Appearance, "opacity" | "blendMode">> = {},
): Appearance {
  return {
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    opacity: clamp01(patch.opacity ?? 1),
    blendMode: patch.blendMode ?? "source-over",
    items: [],
  };
}

export function validateAppearance(appearance: Appearance): AppearanceError | null {
  if (appearance.schemaVersion !== APPEARANCE_SCHEMA_VERSION) {
    return {
      code: "invariant_violation",
      message: `Unsupported appearance schemaVersion ${appearance.schemaVersion}`,
    };
  }
  if (appearance.opacity < 0 || appearance.opacity > 1) {
    return { code: "invalid_opacity", message: "Root opacity must be between 0 and 1" };
  }
  if (appearance.items.length > APPEARANCE_MAX_ITEMS) {
    return {
      code: "invariant_violation",
      message: `Appearance may contain at most ${APPEARANCE_MAX_ITEMS} items`,
    };
  }
  const seen = new Set<string>();
  for (const item of appearance.items) {
    if (!item.id) {
      return { code: "invariant_violation", message: "Appearance item is missing id" };
    }
    if (seen.has(item.id)) {
      return { code: "duplicate_id", message: `Duplicate appearance item id ${item.id}` };
    }
    seen.add(item.id);
    if (item.opacity < 0 || item.opacity > 1) {
      return { code: "invalid_opacity", message: `Item ${item.id} opacity out of range` };
    }
    if (item.kind === "stroke" && item.width < 0) {
      return { code: "invalid_width", message: `Stroke ${item.id} width cannot be negative` };
    }
    if (
      item.kind === "effect" &&
      ((item.effect.type === "shadow" && item.effect.blur < 0) ||
        (item.effect.type === "glow" && item.effect.blur < 0) ||
        (item.effect.type === "gaussianBlur" && item.effect.radius < 0))
    ) {
      return { code: "invalid_blur", message: `Effect ${item.id} blur/radius cannot be negative` };
    }
  }
  return null;
}

export function normalizeAppearance(appearance: Appearance): Appearance {
  return {
    schemaVersion: APPEARANCE_SCHEMA_VERSION,
    opacity: clamp01(appearance.opacity),
    blendMode: appearance.blendMode || "source-over",
    items: appearance.items.map(normalizeItem),
  };
}
