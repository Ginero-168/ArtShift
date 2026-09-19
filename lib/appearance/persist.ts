import type { EngineDoc, EngineElement, EngineSlide } from "@/lib/engine/types";
import { appearanceToLegacyPatch, synthesizeAppearanceFromLegacy } from "./legacyAdapter";
import { normalizeAppearance, validateAppearance } from "./normalize";
import type { Appearance, AppearanceItem, AppearanceSnapshot, EffectAppearance } from "./types";

/** Legacy flat fields that dual-write with the canonical Appearance stack. */
export const LEGACY_APPEARANCE_KEYS = [
  "opacity",
  "blendMode",
  "shadow",
  "glow",
  "backgroundColor",
  "fillStyle",
  "fillType",
  "fillPattern",
  "gradientColors",
  "gradientAngle",
  "gradientStops",
  "strokeColor",
  "strokeWidth",
  "strokeStyle",
] as const satisfies ReadonlyArray<keyof EngineElement>;

export function persistedAppearance(appearance: Appearance): Appearance {
  return normalizeAppearance({
    schemaVersion: appearance.schemaVersion,
    opacity: appearance.opacity,
    blendMode: appearance.blendMode,
    items: appearance.items,
  });
}

export function snapshotToAppearance(snapshot: AppearanceSnapshot): Appearance {
  return persistedAppearance(snapshot);
}

export function tryNormalizeAppearance(value: unknown): Appearance | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Appearance;
  if (!Array.isArray(candidate.items)) return null;
  try {
    const normalized = normalizeAppearance(candidate);
    if (validateAppearance(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

/** Write canonical `appearance` and the legacy flat fields the current renderer still reads. */
export function dualWriteElement(element: EngineElement, appearance: Appearance): EngineElement {
  const canonical = persistedAppearance(appearance);
  return {
    ...element,
    ...appearanceToLegacyPatch(canonical),
    appearance: canonical,
  } as EngineElement;
}

export function appearanceElementPatch(appearance: Appearance): Partial<EngineElement> {
  const canonical = persistedAppearance(appearance);
  return {
    ...appearanceToLegacyPatch(canonical),
    appearance: canonical,
  };
}

export function patchTouchesLegacyAppearance(patch: Partial<EngineElement>): boolean {
  return LEGACY_APPEARANCE_KEYS.some((key) => key in patch);
}

/**
 * Load/save hydrate: prefer a valid `appearance` (and refresh legacy from it).
 * If `appearance` is missing, synthesize it from legacy fields without dropping them.
 * Invalid stored appearance is kept as-is so migration is not a silent data loss.
 */
export function hydrateElementAppearance(element: EngineElement): EngineElement {
  const stored = element.appearance;
  const normalized = tryNormalizeAppearance(stored);
  if (normalized) return dualWriteElement(element, normalized);
  if (stored) return element;
  return dualWriteElement(element, snapshotToAppearance(synthesizeAppearanceFromLegacy(element)));
}

export function hydrateSlideAppearance(slide: EngineSlide): EngineSlide {
  return {
    ...slide,
    elements: slide.elements.map(hydrateElementAppearance),
  };
}

export function hydrateDocumentAppearance(doc: EngineDoc): EngineDoc {
  return {
    ...doc,
    slides: doc.slides.map(hydrateSlideAppearance),
  };
}

/**
 * After a legacy-field patch (FillSection, AI, factories), keep extra Appearance
 * items and refresh the primary fill/stroke/shadow/glow/root from the merged element.
 */
export function syncAppearanceFromLegacy(
  previous: EngineElement,
  merged: EngineElement,
): EngineElement {
  const synthesized = snapshotToAppearance(synthesizeAppearanceFromLegacy(merged));
  const existing = tryNormalizeAppearance(previous.appearance);
  const appearance = existing ? replacePrimaryItems(existing, synthesized) : synthesized;
  return dualWriteElement(merged, appearance);
}

export function syncElementAppearance(
  previous: EngineElement,
  merged: EngineElement,
  patch: Partial<EngineElement>,
): EngineElement {
  const fromPatch = tryNormalizeAppearance(patch.appearance);
  if (fromPatch) return dualWriteElement(merged, fromPatch);
  if (patchTouchesLegacyAppearance(patch)) {
    return syncAppearanceFromLegacy(previous, merged);
  }
  return merged;
}

function replacePrimaryItems(existing: Appearance, synthesized: Appearance): Appearance {
  const items = [...existing.items];
  replaceFirst(
    items,
    (item) => item.kind === "fill",
    synthesized.items.find((item) => item.kind === "fill"),
  );
  replaceFirst(
    items,
    (item) => item.kind === "stroke",
    synthesized.items.find((item) => item.kind === "stroke"),
  );
  replaceFirst(
    items,
    (item) => item.kind === "effect" && item.effect.type === "shadow",
    synthesized.items.find(
      (item): item is EffectAppearance => item.kind === "effect" && item.effect.type === "shadow",
    ),
  );
  replaceFirst(
    items,
    (item) => item.kind === "effect" && item.effect.type === "glow",
    synthesized.items.find(
      (item): item is EffectAppearance => item.kind === "effect" && item.effect.type === "glow",
    ),
  );
  return persistedAppearance({
    ...existing,
    opacity: synthesized.opacity,
    blendMode: synthesized.blendMode,
    items,
  });
}

function replaceFirst(
  items: AppearanceItem[],
  predicate: (item: AppearanceItem) => boolean,
  nextItem: AppearanceItem | undefined,
): void {
  const index = items.findIndex(predicate);
  if (nextItem) {
    if (index >= 0) {
      items[index] = { ...nextItem, id: items[index].id };
      return;
    }
    items.push(nextItem);
    return;
  }
  if (index >= 0) items.splice(index, 1);
}
