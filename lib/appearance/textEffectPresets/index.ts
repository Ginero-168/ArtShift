import type { EngineElement, TextElement } from "@/lib/engine/types";
import { changeAppearance } from "../commands";
import { replaceStackOperation } from "../ops";
import { compileTextEffectPreset } from "./compile";
import { TEXT_EFFECT_FAMILY_LABELS, TEXT_EFFECT_FAMILY_ORDER } from "./families";
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
  for (const family of TEXT_EFFECT_FAMILY_ORDER) grouped[family] = [];
  for (const preset of TEXT_EFFECT_PRESETS) {
    grouped[preset.family] ??= [];
    grouped[preset.family].push(preset);
  }
  return grouped;
}

export function searchTextEffectPresets(query: string): TextEffectPreset[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return TEXT_EFFECT_PRESETS;
  return TEXT_EFFECT_PRESETS.filter((preset) => {
    const familyLabel = TEXT_EFFECT_FAMILY_LABELS[preset.family];
    return (
      preset.name.toLowerCase().includes(needle) ||
      preset.slug.toLowerCase().includes(needle) ||
      preset.family.toLowerCase().includes(needle) ||
      familyLabel.toLowerCase().includes(needle) ||
      String(preset.id).includes(needle) ||
      String(preset.id).padStart(2, "0").includes(needle)
    );
  });
}

function instantiatePresetAppearance(element: EngineElement, preset: TextEffectPreset) {
  const appearance = structuredClone(preset.recipe.appearance);
  appearance.items = appearance.items.map((item) => ({
    ...item,
    id: `${item.kind}:${element.id}:${item.id}`,
  }));
  return appearance;
}

/** Appearance command that replaces the stack (and text tracking) undo-safely. */
export function applyTextEffectPresetOperation(element: EngineElement, idOrSlug: number | string) {
  const preset = getTextEffectPreset(idOrSlug);
  if (!preset) return null;
  return replaceStackOperation(instantiatePresetAppearance(element, preset), {
    letterSpacingEm: preset.recipe.letterSpacingEm,
  });
}

/** Instantiate recipe item ids onto this object, then dual-write legacy fields. */
export function applyTextEffectPreset(
  element: EngineElement,
  idOrSlug: number | string,
): EngineElement | null {
  const operation = applyTextEffectPresetOperation(element, idOrSlug);
  if (!operation) return null;
  const result = changeAppearance(element, operation);
  if (!result.ok) return null;
  if (result.element.type === "text") {
    return {
      ...(result.element as TextElement),
      letterSpacingEm: getTextEffectPreset(idOrSlug)?.recipe.letterSpacingEm ?? 0,
    };
  }
  return result.element;
}

export { TEXT_EFFECT_FAMILY_LABELS, TEXT_EFFECT_FAMILY_ORDER } from "./families";
export { textEffectPreviewStyle } from "./preview";
export { COLORION_INK, resolveColorionColor } from "./tokens";
export type { TextEffectFamily, TextEffectPreset, TextEffectStaticCap } from "./types";
