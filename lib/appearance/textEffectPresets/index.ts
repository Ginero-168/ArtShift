import type { EngineElement } from "@/lib/engine/types";
import { dualWriteElement } from "../persist";
import { compileTextEffectPreset } from "./compile";
import { TEXT_EFFECT_SOURCE_SPECS } from "./source";
import type { TextEffectFamily, TextEffectPreset } from "./types";

export const TEXT_EFFECT_PRESET_COUNT = 90;

export const TEXT_EFFECT_PRESETS: TextEffectPreset[] =
  TEXT_EFFECT_SOURCE_SPECS.map(compileTextEffectPreset);

const byId = new Map(TEXT_EFFECT_PRESETS.map((preset) => [preset.id, preset]));
const bySlug = new Map(TEXT_EFFECT_PRESETS.map((preset) => [preset.slug, preset]));

export function getTextEffectPreset(idOrSlug: number | string): TextEffectPreset | undefined {
  if (typeof idOrSlug === "number") return byId.get(idOrSlug);
  const asNumber = Number(idOrSlug);
  if (Number.isInteger(asNumber) && asNumber > 0) return byId.get(asNumber);
  return bySlug.get(idOrSlug);
}

export function textEffectPresetsByFamily(): Record<TextEffectFamily, TextEffectPreset[]> {
  const grouped = {} as Record<TextEffectFamily, TextEffectPreset[]>;
  for (const preset of TEXT_EFFECT_PRESETS) {
    grouped[preset.family] ??= [];
    grouped[preset.family].push(preset);
  }
  return grouped;
}

/** Instantiate recipe item ids onto this object, then dual-write legacy fields. */
export function applyTextEffectPreset(
  element: EngineElement,
  idOrSlug: number | string,
): EngineElement | null {
  const preset = getTextEffectPreset(idOrSlug);
  if (!preset) return null;
  const appearance = structuredClone(preset.recipe.appearance);
  appearance.items = appearance.items.map((item) => ({
    ...item,
    id: `${item.kind}:${element.id}:${item.id}`,
  }));
  return dualWriteElement(element, appearance);
}

export { COLORION_INK, resolveColorionColor } from "./tokens";
export type { TextEffectFamily, TextEffectPreset, TextEffectStaticCap } from "./types";
