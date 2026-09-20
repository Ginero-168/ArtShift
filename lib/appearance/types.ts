/**
 * Canonical Appearance stack types (Illustrator-inspired).
 * Engine schema v10 persists this object on EngineElement (v7 introduced the
 * field; v8 added text-effect stack fields; v9 named extrude/emboss; v10
 * extrude taper) and dual-writes legacy flat fields (fill/stroke/shadow/glow/
 * opacity/blendMode) for older readers.
 * Appearance.schemaVersion stays 1; new item fields (including extrude taper)
 * are additive and normalize to defaults when missing.
 */

import type { ColorAdjustments } from "@/lib/color/adjustments";
import type { FillStyle, StrokeStyle } from "@/lib/engine/types";

/** Root compositing — dual-writes to EngineElement.blendMode. */
export type AppearanceBlendMode =
  | "source-over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten";

/**
 * Per-item compositing. Wider than root so Colorion mix-blend stills
 * (difference, soft-light) can live on offset paint layers.
 */
export type AppearanceItemBlendMode =
  | AppearanceBlendMode
  | "difference"
  | "soft-light"
  | "color-dodge"
  | "hard-light";

export type AppearanceColorStop = {
  offset: number;
  color: string;
};

export type AppearancePaint =
  | { type: "solid"; color: string }
  | { type: "linearGradient"; angle: number; stops: AppearanceColorStop[] }
  | { type: "radialGradient"; stops: AppearanceColorStop[] }
  | { type: "conicGradient"; angle: number; stops: AppearanceColorStop[] }
  | {
      type: "pattern";
      pattern: "dots" | "stripes" | "grid";
      foreground: string;
      background: string;
    };

export type AppearanceShadowLayer = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
};

export type AppearanceGlowLayer = {
  color: string;
  blur: number;
};

/** Shared paint-layer fields for offset duplicates (glitch / anaglyph / duotone). */
export type AppearancePaintLayer = {
  blendMode?: AppearanceItemBlendMode;
  offsetX?: number;
  offsetY?: number;
};

export type FillAppearance = {
  id: string;
  kind: "fill";
  visible: boolean;
  opacity: number;
  paint: AppearancePaint;
  fillStyle?: FillStyle;
  /**
   * CSS `background-clip: text` analogue: paint is clipped to glyph
   * silhouettes. Text Fill already paints glyphs; keep true on text-effect
   * recipes. Ignored for shape fills (already clipped to geometry).
   */
  clipToGlyphs?: boolean;
} & AppearancePaintLayer;

/**
 * Behind-content backdrop (text box). Distinct from Fill — Fill is the object
 * fill (glyph fill on text, shape fill on paths).
 */
export type BackgroundAppearance = {
  id: string;
  kind: "background";
  visible: boolean;
  opacity: number;
  paint: AppearancePaint;
} & AppearancePaintLayer;

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
  /** CSS `paint-order` analogue for glyph outline vs fill. */
  paintOrder?: "fill" | "stroke";
} & AppearancePaintLayer;

export type AppearanceEmbossMode = "emboss" | "deboss" | "bevel";

export type AppearanceExtrudeEffect = {
  type: "extrude";
  /** Distance of the block in px along `angle`. */
  depth: number;
  /** Canvas azimuth: 0° = right, 90° = down. */
  angle: number;
  /** 0 = smooth (≈1px copies). 1+ = that many copies along the depth vector. */
  steps: number;
  sideColor: string;
  /** When true, the renderer darkens the current Fill instead of `sideColor`. */
  sideFromFill?: boolean;
  /**
   * 0 = parallel copies along `angle` (legacy). 1 = farthest copy scales to 0
   * toward the element bounds center so the side leans inward.
   * Missing values normalize to 0.
   */
  taper?: number;
};

export type AppearanceEmbossEffect = {
  type: "emboss";
  mode: AppearanceEmbossMode;
  /** Offset magnitude of the highlight/shadow pair in px. */
  depth: number;
  /** Light falls this way in canvas space (0° = right, 90° = down); highlight is opposite. */
  angle: number;
  /** Blur of the highlight/shadow copies. 0 = hard chisel. */
  softness: number;
  highlightColor: string;
  shadowColor: string;
};

export type AppearanceEffect =
  | {
      type: "shadow";
      color: string;
      blur: number;
      offsetX: number;
      offsetY: number;
      /** Extra halo/extrusion layers after the primary (legacy dual-write) layer. */
      layers?: AppearanceShadowLayer[];
    }
  | {
      type: "glow";
      color: string;
      blur: number;
      layers?: AppearanceGlowLayer[];
    }
  | AppearanceExtrudeEffect
  | AppearanceEmbossEffect
  | { type: "gaussianBlur"; radius: number }
  | { type: "colorAdjust"; adjustments: Partial<ColorAdjustments> };

export type EffectAppearance = {
  id: string;
  kind: "effect";
  visible: boolean;
  opacity: number;
  effect: AppearanceEffect;
  scope?: "previous" | "object";
  blendMode?: AppearanceItemBlendMode;
};

export type AppearanceItem =
  | FillAppearance
  | StrokeAppearance
  | BackgroundAppearance
  | EffectAppearance;

export type Appearance = {
  schemaVersion: 1;
  opacity: number;
  blendMode: AppearanceBlendMode;
  items: AppearanceItem[];
  /**
   * Illustrator-like paint roles: Fill = object fill, Stroke = outline,
   * Background = behind-content backdrop. Absent on older text stacks that
   * stored the box as Fill and the glyph color as Stroke.
   */
  paintSemantics?: "object";
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
  | { type: "duplicateItem"; itemId: string }
  | {
      type: "replaceStack";
      appearance: Appearance;
      /** Text-only tracking written onto `TextElement.letterSpacingEm`. */
      letterSpacingEm?: number;
    };

export const APPEARANCE_SCHEMA_VERSION = 1 as const;
/** Raised in v8 so neon stacks + offset duplicate fills can coexist. */
export const APPEARANCE_MAX_ITEMS = 24;
export const MAX_EXTRUDE_DEPTH = 80;
export const MAX_EXTRUDE_STEPS = 48;
export const MAX_EXTRUDE_TAPER = 1;
export const MAX_EMBOSS_SOFTNESS = 32;
