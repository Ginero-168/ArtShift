import type { EngineElement } from "@/lib/engine/types";
import {
  DEFAULT_GLOW,
  DEFAULT_SHADOW,
  defaultBackgroundItem,
  defaultFillItem,
  defaultGlowItem,
  defaultShadowItem,
  defaultStrokeItem,
} from "./defaults";
import { readAppearance } from "./legacyAdapter";
import { findBackground, findEffect, findFill, findStroke } from "./panelModel";
import type {
  Appearance,
  AppearanceOperation,
  AppearancePaint,
  BackgroundAppearance,
  FillAppearance,
  StrokeAppearance,
} from "./types";

export function fillPaintOperation(
  element: EngineElement,
  paint: AppearancePaint,
  options: { fillStyle?: FillAppearance["fillStyle"]; itemId?: string } = {},
): AppearanceOperation {
  const fill = resolveFillItem(element, options.itemId);
  if (fill?.kind !== "fill") {
    return {
      type: "insertItem",
      item: { ...defaultFillItem(), paint, fillStyle: options.fillStyle ?? "solid" },
      index: paintInsertIndex(readAppearance(element)),
    };
  }
  return {
    type: "updateItem",
    itemId: fill.id,
    patch: {
      kind: "fill",
      paint,
      ...(options.fillStyle ? { fillStyle: options.fillStyle } : {}),
    },
  };
}

export function fillItemPatchOperation(
  element: EngineElement,
  itemId: string,
  patch: Partial<Pick<FillAppearance, "visible" | "opacity" | "paint" | "fillStyle">>,
): AppearanceOperation {
  const fill = resolveFillItem(element, itemId);
  if (fill?.kind !== "fill") {
    return {
      type: "insertItem",
      item: { ...defaultFillItem(), ...patch },
      index: paintInsertIndex(readAppearance(element)),
    };
  }
  return {
    type: "updateItem",
    itemId: fill.id,
    patch: { kind: "fill", ...patch },
  };
}

export function strokePatchOperation(
  element: EngineElement,
  patch: Partial<
    Pick<StrokeAppearance, "color" | "width" | "style" | "visible" | "opacity" | "alignment">
  >,
  itemId?: string,
): AppearanceOperation {
  const stroke = resolveStrokeItem(element, itemId);
  if (stroke?.kind !== "stroke") {
    return {
      type: "insertItem",
      item: { ...defaultStrokeItem(), ...patch },
      index: paintInsertIndex(readAppearance(element)),
    };
  }
  return {
    type: "updateItem",
    itemId: stroke.id,
    patch: { kind: "stroke", ...patch },
  };
}

export function shadowPatchOperation(
  element: EngineElement,
  patch: Partial<{
    color: string;
    blur: number;
    offsetX: number;
    offsetY: number;
    visible: boolean;
    opacity: number;
  }>,
): AppearanceOperation {
  const shadow = findEffect(readAppearance(element), "shadow");
  if (shadow?.effect.type !== "shadow") {
    return {
      type: "insertItem",
      item: {
        ...defaultShadowItem(),
        visible: patch.visible ?? true,
        opacity: patch.opacity ?? 1,
        effect: {
          type: "shadow",
          color: patch.color ?? DEFAULT_SHADOW.color,
          blur: patch.blur ?? DEFAULT_SHADOW.blur,
          offsetX: patch.offsetX ?? DEFAULT_SHADOW.offsetX,
          offsetY: patch.offsetY ?? DEFAULT_SHADOW.offsetY,
        },
      },
    };
  }
  const effect = shadow.effect;
  return {
    type: "updateItem",
    itemId: shadow.id,
    patch: {
      kind: "effect",
      visible: patch.visible ?? shadow.visible,
      opacity: patch.opacity ?? shadow.opacity,
      effect: {
        type: "shadow",
        color: patch.color ?? effect.color,
        blur: patch.blur ?? effect.blur,
        offsetX: patch.offsetX ?? effect.offsetX,
        offsetY: patch.offsetY ?? effect.offsetY,
      },
    },
  };
}

export function glowPatchOperation(
  element: EngineElement,
  patch: Partial<{ color: string; blur: number; visible: boolean; opacity: number }>,
): AppearanceOperation {
  const glow = findEffect(readAppearance(element), "glow");
  if (glow?.effect.type !== "glow") {
    return {
      type: "insertItem",
      item: {
        ...defaultGlowItem(),
        visible: patch.visible ?? true,
        opacity: patch.opacity ?? 1,
        effect: {
          type: "glow",
          color: patch.color ?? DEFAULT_GLOW.color,
          blur: patch.blur ?? DEFAULT_GLOW.blur,
        },
      },
    };
  }
  const effect = glow.effect;
  return {
    type: "updateItem",
    itemId: glow.id,
    patch: {
      kind: "effect",
      visible: patch.visible ?? glow.visible,
      opacity: patch.opacity ?? glow.opacity,
      effect: {
        type: "glow",
        color: patch.color ?? effect.color,
        blur: patch.blur ?? effect.blur,
      },
    },
  };
}

export function addShadowOperation(): AppearanceOperation {
  return { type: "insertItem", item: defaultShadowItem() };
}

export function addGlowOperation(): AppearanceOperation {
  return { type: "insertItem", item: defaultGlowItem() };
}

/**
 * Insert a Fill in front of existing paint (before the first effect).
 * When `element` is given, the new fill copies the front-most fill (Illustrator-like).
 */
export function addFillOperation(element?: EngineElement): AppearanceOperation {
  const item = defaultFillItem();
  if (!element) {
    return { type: "insertItem", item, index: 0 };
  }
  const appearance = readAppearance(element);
  const source = appearance.items.findLast((candidate) => candidate.kind === "fill");
  if (source?.kind === "fill") {
    item.paint = structuredClone(source.paint);
    item.fillStyle = source.fillStyle;
    item.opacity = source.opacity;
    item.visible = true;
    if (
      item.paint.type === "solid" &&
      (item.paint.color === "transparent" || item.paint.color === "none")
    ) {
      item.paint = { type: "solid", color: "#ffffff" };
      item.fillStyle = "solid";
    }
  }
  return { type: "insertItem", item, index: paintInsertIndex(appearance) };
}

/**
 * Insert a Stroke in front of existing paint (before the first effect).
 * When `element` is given, the new stroke copies the front-most stroke.
 */
export function addStrokeOperation(element?: EngineElement): AppearanceOperation {
  const item = defaultStrokeItem();
  if (!element) {
    return { type: "insertItem", item };
  }
  const appearance = readAppearance(element);
  const source = appearance.items.findLast((candidate) => candidate.kind === "stroke");
  if (source?.kind === "stroke") {
    item.color =
      source.color === "transparent" || source.color === "none" ? item.color : source.color;
    item.width = source.width > 0 ? source.width : item.width;
    item.style = source.style;
    item.opacity = source.opacity;
    item.alignment = source.alignment;
    item.cap = source.cap;
    item.join = source.join;
    item.dash = source.dash ? [...source.dash] : undefined;
    item.visible = true;
  }
  return { type: "insertItem", item, index: paintInsertIndex(appearance) };
}

/**
 * Insert a behind-text Background at the back of the paint stack.
 * Text only — not a shape fill.
 */
export function addBackgroundOperation(element?: EngineElement): AppearanceOperation {
  const item = defaultBackgroundItem();
  if (!element) {
    return { type: "insertItem", item, index: 0 };
  }
  const appearance = readAppearance(element);
  const source = appearance.items.findLast((candidate) => candidate.kind === "background");
  if (source?.kind === "background") {
    item.paint = structuredClone(source.paint);
    item.opacity = source.opacity;
    item.visible = true;
  }
  return { type: "insertItem", item, index: backgroundInsertIndex(appearance) };
}

export function backgroundPaintOperation(
  element: EngineElement,
  paint: AppearancePaint,
  options: { itemId?: string } = {},
): AppearanceOperation {
  const background = resolveBackgroundItem(element, options.itemId);
  if (background?.kind !== "background") {
    return {
      type: "insertItem",
      item: { ...defaultBackgroundItem(), paint },
      index: backgroundInsertIndex(readAppearance(element)),
    };
  }
  return {
    type: "updateItem",
    itemId: background.id,
    patch: { kind: "background", paint },
  };
}

export function backgroundItemPatchOperation(
  element: EngineElement,
  itemId: string,
  patch: Partial<Pick<BackgroundAppearance, "visible" | "opacity" | "paint">>,
): AppearanceOperation {
  const background = resolveBackgroundItem(element, itemId);
  if (background?.kind !== "background") {
    return {
      type: "insertItem",
      item: { ...defaultBackgroundItem(), ...patch },
      index: backgroundInsertIndex(readAppearance(element)),
    };
  }
  return {
    type: "updateItem",
    itemId: background.id,
    patch: { kind: "background", ...patch },
  };
}

export function toggleItemVisibleOperation(
  element: EngineElement,
  itemId: string,
): AppearanceOperation | null {
  const item = readAppearance(element).items.find((candidate) => candidate.id === itemId);
  if (!item) return null;
  return { type: "updateItem", itemId, patch: { visible: !item.visible } };
}

export function toggleStackKindVisible(
  element: EngineElement,
  kind: "fill" | "stroke" | "background" | "shadow" | "glow",
): AppearanceOperation | null {
  const item = stackKindItem(element, kind);
  if (!item) return null;
  return { type: "updateItem", itemId: item.id, patch: { visible: !item.visible } };
}

export function removeStackKind(
  element: EngineElement,
  kind: "fill" | "stroke" | "background" | "shadow" | "glow",
): AppearanceOperation | null {
  const item = stackKindItem(element, kind);
  if (!item) return null;
  return { type: "removeItem", itemId: item.id };
}

function stackKindItem(
  element: EngineElement,
  kind: "fill" | "stroke" | "background" | "shadow" | "glow",
) {
  const appearance = readAppearance(element);
  if (kind === "fill") return findFill(appearance);
  if (kind === "stroke") return findStroke(appearance);
  if (kind === "background") return findBackground(appearance);
  return findEffect(appearance, kind);
}

export function removeItemOperation(itemId: string): AppearanceOperation {
  return { type: "removeItem", itemId };
}

/**
 * Nudge an item toward the front (`+1`, paints later / UI up) or back (`-1`).
 * Stored `items[]` is back-to-front, so UI “Bring forward” is `delta: 1`.
 */
export function nudgeItemOperation(
  element: EngineElement,
  itemId: string,
  delta: 1 | -1,
): AppearanceOperation | null {
  const items = readAppearance(element).items;
  const from = items.findIndex((item) => item.id === itemId);
  if (from < 0) return null;
  const toIndex = from + delta;
  if (toIndex < 0 || toIndex >= items.length) return null;
  return { type: "moveItem", itemId, toIndex };
}

export function setRootOpacityOperation(opacity: number): AppearanceOperation {
  return { type: "setRoot", patch: { opacity } };
}

export function setRootBlendOperation(
  blendMode: NonNullable<EngineElement["blendMode"]>,
): AppearanceOperation {
  return { type: "setRoot", patch: { blendMode } };
}

export function replaceStackOperation(
  appearance: Appearance,
  options: { letterSpacingEm?: number } = {},
): AppearanceOperation {
  return {
    type: "replaceStack",
    appearance,
    ...(options.letterSpacingEm !== undefined ? { letterSpacingEm: options.letterSpacingEm } : {}),
  };
}

/** New paint sits in front of current fills/strokes and behind the first effect. */
export function paintInsertIndex(appearance: Appearance | { items: Appearance["items"] }): number {
  const firstEffect = appearance.items.findIndex((item) => item.kind === "effect");
  return firstEffect === -1 ? appearance.items.length : firstEffect;
}

/** Backgrounds paint first (behind). Insert after existing backgrounds. */
export function backgroundInsertIndex(
  appearance: Appearance | { items: Appearance["items"] },
): number {
  const lastBackground = appearance.items.findLastIndex((item) => item.kind === "background");
  return lastBackground === -1 ? 0 : lastBackground + 1;
}

function resolveFillItem(element: EngineElement, itemId?: string) {
  const appearance = readAppearance(element);
  if (itemId) {
    const match = appearance.items.find((item) => item.id === itemId);
    return match?.kind === "fill" ? match : undefined;
  }
  return findFill(appearance);
}

function resolveStrokeItem(element: EngineElement, itemId?: string) {
  const appearance = readAppearance(element);
  if (itemId) {
    const match = appearance.items.find((item) => item.id === itemId);
    return match?.kind === "stroke" ? match : undefined;
  }
  return findStroke(appearance);
}

function resolveBackgroundItem(element: EngineElement, itemId?: string) {
  const appearance = readAppearance(element);
  if (itemId) {
    const match = appearance.items.find((item) => item.id === itemId);
    return match?.kind === "background" ? match : undefined;
  }
  return findBackground(appearance);
}
