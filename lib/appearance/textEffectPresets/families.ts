import type { TextEffectFamily } from "./types";

export const TEXT_EFFECT_FAMILY_ORDER: TextEffectFamily[] = [
  "gradient_aurora",
  "neon_glow",
  "chrome_metal",
  "outline_stroke",
  "glitch_offset",
  "soft_blur_bloom",
  "emboss_3d",
  "texture_fill",
  "cutout_layers",
  "liquid_fill",
  "holographic",
  "frozen_motion",
];

export const TEXT_EFFECT_FAMILY_LABELS: Record<TextEffectFamily, string> = {
  gradient_aurora: "Gradient / Aurora",
  neon_glow: "Neon / Glow",
  chrome_metal: "Chrome / Metal",
  outline_stroke: "Outline / Stroke",
  glitch_offset: "Glitch / Offset",
  soft_blur_bloom: "Blur / Bloom",
  emboss_3d: "Emboss / 3D",
  texture_fill: "Texture",
  cutout_layers: "Cutout / Layers",
  liquid_fill: "Liquid",
  holographic: "Holographic",
  frozen_motion: "Frozen motion",
};
