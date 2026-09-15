/**
 * Canonical Appearance stack types (Illustrator-inspired).
 * Phase 1 keeps legacy EngineElement fields as persistence source of truth;
 * these types are the semantic read/write model for the Appearance module.
 */

import type { ColorAdjustments } from "@/lib/color/adjustments";
import type { FillStyle, StrokeStyle } from "@/lib/engine/types";

export type AppearanceBlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

export type AppearanceColorStop = {
  offset: number;
  color: string;
};

export type AppearancePaint =
  | { type: "solid"; color: string }
  | { type: "linearGradient"; angle: number; stops: AppearanceColorStop[] }
  | { type: "radialGradient"; stops: AppearanceColorStop[] }
  | {
      type: "pattern";
      pattern: "dots" | "stripes" | "grid";
      foreground: string;
      background: string;
    };

export type FillAppearance = {
  id: string;
  kind: "fill";
  visible: boolean;
  opacity: number;
  paint: AppearancePaint;
  fillStyle?: FillStyle;
};

export type StrokeAppearance = {
  id: string;
  kind: "stroke";
  visible: boolean;
  opacity: number;
  color: string;
  width: number;
  style: StrokeStyle;
  alignment?: "inside" | "center" | "outside";
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  dash?: number[];
};

export type AppearanceEffect =
  | { type: "shadow"; color: string; blur: number; offsetX: number; offsetY: number }
  | { type: "glow"; color: string; blur: number }
  | { type: "gaussianBlur"; radius: number }
  | { type: "colorAdjust"; adjustments: Partial<ColorAdjustments> };

export type EffectAppearance = {
  id: string;
  kind: "effect";
  visible: boolean;
  opacity: number;
  effect: AppearanceEffect;
  scope?: "previous" | "object";
};

export type AppearanceItem = FillAppearance | StrokeAppearance | EffectAppearance;

export type Appearance = {
  schemaVersion: 1;
  opacity: number;
  blendMode: AppearanceBlendMode;
  items: AppearanceItem[];
};

export type AppearanceSnapshot = Appearance & {
  /** True when snapshot was synthesized from legacy flat fields. */
  fromLegacy: boolean;
  unsupported: string[];
};

export type AppearanceErrorCode =
  | "invalid_opacity"
  | "invalid_width"
  | "invalid_blur"
  | "duplicate_id"
  | "item_not_found"
  | "invalid_index"
  | "unsupported_operation"
  | "invariant_violation";

export type AppearanceError = {
  code: AppearanceErrorCode;
  message: string;
};

export type AppearanceOperation =
  | { type: "setRoot"; patch: Partial<Pick<Appearance, "opacity" | "blendMode">> }
  | { type: "insertItem"; item: AppearanceItem; index?: number }
  | { type: "updateItem"; itemId: string; patch: Partial<AppearanceItem> }
  | { type: "removeItem"; itemId: string }
  | { type: "moveItem"; itemId: string; toIndex: number }
  | { type: "duplicateItem"; itemId: string };

export const APPEARANCE_SCHEMA_VERSION = 1 as const;
export const APPEARANCE_MAX_ITEMS = 12;
