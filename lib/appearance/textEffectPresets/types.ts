import type {
  Appearance,
  AppearanceEmbossEffect,
  AppearanceExtrudeEffect,
  AppearanceItemBlendMode,
  AppearancePaint,
  AppearanceShadowLayer,
} from "../types";

export type TextEffectStaticCap =
  | "gradient_fill"
  | "bg_clip_text"
  | "transparent_fill"
  | "letter_spacing"
  | "ink_tokens"
  | "clip_path"
  | "pseudo_layers"
  | "data_text_dupe"
  | "opacity_layers"
  | "text_shadow_stack"
  | "multi_text_shadow"
  | "text_stroke"
  | "filter_blur"
  | "skew_rotate"
  | "box_reflect"
  | "mix_blend"
  | "drop_shadow"
  | "mask";

export type TextEffectFamily =
  | "gradient_aurora"
  | "neon_glow"
  | "chrome_metal"
  | "outline_stroke"
  | "glitch_offset"
  | "soft_blur_bloom"
  | "emboss_3d"
  | "texture_fill"
  | "cutout_layers"
  | "liquid_fill"
  | "holographic"
  | "frozen_motion";

export type TextEffectRecipe = {
  appearance: Appearance;
  letterSpacingEm: number;
};

export type TextEffectPreset = {
  id: number;
  name: string;
  slug: string;
  family: TextEffectFamily;
  description: string;
  staticCaps: TextEffectStaticCap[];
  sourceHasAnimation: boolean;
  staticStrategy: "freeze_key_visual";
  rendererSupport: boolean;
  deferredNotes: string[];
  recipe: TextEffectRecipe;
};

export type TextEffectSourceSpec = {
  id: number;
  name: string;
  slug: string;
  description: string;
  family: TextEffectFamily;
  staticCaps: TextEffectStaticCap[];
  letterSpacingEm: number;
  sourceHasAnimation: boolean;
  hasPseudo: boolean;
  hasClipPath: boolean;
  hasBoxReflect: boolean;
  hasMask: boolean;
  fillPaint?: AppearancePaint;
  inkColor: string;
  blend?: AppearanceItemBlendMode;
  stroke?: { width: number; color: string };
  shadows: AppearanceShadowLayer[];
  offsetFills?: Array<{
    color: string;
    offsetX: number;
    offsetY: number;
    opacity?: number;
    blendMode?: AppearanceItemBlendMode;
  }>;
  blurRadius?: number;
  /** Named 3D block — compiled to an `extrude` Appearance effect, not a shadow stack. */
  extrude?: Omit<AppearanceExtrudeEffect, "type">;
  /** Named relief — compiled to an `emboss` Appearance effect. */
  emboss?: Omit<AppearanceEmbossEffect, "type">;
};
