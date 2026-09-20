import type { Appearance, AppearanceItem } from "./types";

function paintKey(item: AppearanceItem): string {
  const offsetX = item.kind === "effect" ? 0 : (item.offsetX ?? 0);
  const offsetY = item.kind === "effect" ? 0 : (item.offsetY ?? 0);
  const layer = `${item.blendMode ?? "source-over"}:${offsetX}:${offsetY}`;
  if (item.kind === "fill") {
    return `${JSON.stringify(item.paint)}:${item.clipToGlyphs ? 1 : 0}:${layer}`;
  }
  if (item.kind === "background") return `${JSON.stringify(item.paint)}:${layer}`;
  if (item.kind === "stroke") {
    return [
      item.color,
      item.width,
      item.style,
      item.alignment ?? "center",
      item.paintOrder ?? "fill",
      layer,
    ].join(":");
  }
  return `${JSON.stringify(item.effect)}:${layer}`;
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
