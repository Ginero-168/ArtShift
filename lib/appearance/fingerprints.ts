import type { Appearance, AppearanceItem } from "./types";

function paintKey(item: AppearanceItem): string {
  if (item.kind === "fill") return JSON.stringify(item.paint);
  if (item.kind === "stroke") {
    return [item.color, item.width, item.style, item.alignment ?? "center"].join(":");
  }
  return JSON.stringify(item.effect);
}

/**
 * Stable fingerprint for renderer cache keys (Phase 4 will include this).
 */
export function appearanceFingerprint(appearance: Appearance): string {
  const parts = [
    `v${appearance.schemaVersion}`,
    `o${appearance.opacity}`,
    `b${appearance.blendMode}`,
    ...appearance.items.map(
      (item) => `${item.kind}:${item.id}:${item.visible ? 1 : 0}:${item.opacity}:${paintKey(item)}`,
    ),
  ];
  return parts.join("|");
}
