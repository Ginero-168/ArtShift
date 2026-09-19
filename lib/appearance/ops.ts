import type { EngineElement } from "@/lib/engine/types";
import {
  DEFAULT_GLOW,
  DEFAULT_SHADOW,
  defaultFillItem,
  defaultGlowItem,
  defaultShadowItem,
  defaultStrokeItem,
} from "./defaults";
import { readAppearance } from "./legacyAdapter";
import { findEffect, findFill, findStroke } from "./panelModel";
import type {
  AppearanceOperation,
  AppearancePaint,
  FillAppearance,
  StrokeAppearance,
} from "./types";

export function fillPaintOperation(
  element: EngineElement,
  paint: AppearancePaint,
  fillStyle?: FillAppearance["fillStyle"],
): AppearanceOperation {
  const fill = findFill(readAppearance(element));
  if (fill?.kind !== "fill") {
    return {
      type: "insertItem",
      item: { ...defaultFillItem(), paint, fillStyle: fillStyle ?? "solid" },
      index: 0,
    };
  }
  return {
    type: "updateItem",
    itemId: fill.id,
    patch: {
      kind: "fill",
      paint,
      ...(fillStyle ? { fillStyle } : {}),
    },
  };
}

export function strokePatchOperation(
  element: EngineElement,
  patch: Partial<Pick<StrokeAppearance, "color" | "width" | "style" | "visible" | "opacity">>,
): AppearanceOperation {
  const stroke = findStroke(readAppearance(element));
  if (stroke?.kind !== "stroke") {
    return {
      type: "insertItem",
      item: { ...defaultStrokeItem(), ...patch },
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

export function addFillOperation(): AppearanceOperation {
  return { type: "insertItem", item: defaultFillItem(), index: 0 };
}

export function addStrokeOperation(): AppearanceOperation {
  return { type: "insertItem", item: defaultStrokeItem() };
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
  kind: "fill" | "stroke" | "shadow" | "glow",
): AppearanceOperation | null {
  const item = stackKindItem(element, kind);
  if (!item) return null;
  return { type: "updateItem", itemId: item.id, patch: { visible: !item.visible } };
}

export function removeStackKind(
  element: EngineElement,
  kind: "fill" | "stroke" | "shadow" | "glow",
): AppearanceOperation | null {
  const item = stackKindItem(element, kind);
  if (!item) return null;
  return { type: "removeItem", itemId: item.id };
}

function stackKindItem(element: EngineElement, kind: "fill" | "stroke" | "shadow" | "glow") {
  const appearance = readAppearance(element);
  if (kind === "fill") return findFill(appearance);
  if (kind === "stroke") return findStroke(appearance);
  return findEffect(appearance, kind);
}

export function removeItemOperation(itemId: string): AppearanceOperation {
  return { type: "removeItem", itemId };
}

export function setRootOpacityOperation(opacity: number): AppearanceOperation {
  return { type: "setRoot", patch: { opacity } };
}

export function setRootBlendOperation(
  blendMode: NonNullable<EngineElement["blendMode"]>,
): AppearanceOperation {
  return { type: "setRoot", patch: { blendMode } };
}
