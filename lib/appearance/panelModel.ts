import type { EngineElement, TextElement } from "@/lib/engine/types";
import { appearanceCapabilities } from "./capabilities";
import { readAppearance } from "./legacyAdapter";
import type {
  AppearanceItem,
  AppearanceSnapshot,
  BackgroundAppearance,
  EffectAppearance,
} from "./types";

export type AppearanceStackRow =
  | { key: string; kind: "item"; item: AppearanceItem }
  | { key: "textArc"; kind: "textArc"; value: number };

/**
 * Exclusive accordion that still allows none selected: click a closed row to
 * open it (closing any other), click the open row again to collapse.
 */
export function toggleAppearanceExpandedKey(
  currentKey: string | null,
  clickedKey: string,
): string | null {
  return currentKey === clickedKey ? null : clickedKey;
}

/** Drop a stale id (removed stack item) so the panel can sit fully collapsed. */
export function resolveAppearanceExpandedKey(
  expandedKey: string | null,
  rowKeys: readonly string[],
): string | null {
  if (expandedKey && rowKeys.includes(expandedKey)) return expandedKey;
  return null;
}

/**
 * UI lists items top-to-bottom as front-to-back (reverse of stored back-to-front).
 * Text Arc is a text-only geometry attribute (`pathCurvature`), not an Appearance item.
 */
export function appearanceStackRows(element: EngineElement): AppearanceStackRow[] {
  const appearance = readAppearance(element);
  const caps = appearanceCapabilities(element);
  const items = appearance.items.filter((item) => isMvpStackItem(item, caps));
  const rows: AppearanceStackRow[] = items
    .slice()
    .reverse()
    .map((item) => ({ key: item.id, kind: "item" as const, item }));

  if (caps.textArc && element.type === "text") {
    rows.unshift({
      key: "textArc",
      kind: "textArc",
      value: (element as TextElement).pathCurvature ?? 0,
    });
  }

  return rows;
}

export function isMvpStackItem(
  item: AppearanceItem,
  caps: ReturnType<typeof appearanceCapabilities>,
): boolean {
  if (item.kind === "fill") return caps.fills;
  if (item.kind === "stroke") return caps.strokes;
  if (item.kind === "background") return caps.background;
  if (item.kind === "effect" && item.effect.type === "shadow") return caps.shadow;
  if (item.kind === "effect" && item.effect.type === "glow") return caps.glow;
  if (item.kind === "effect" && item.effect.type === "gaussianBlur") return caps.staticBlur;
  return false;
}

export function findEffect(
  appearance: AppearanceSnapshot | { items: AppearanceItem[] },
  type: "shadow" | "glow",
): EffectAppearance | undefined {
  return appearance.items.find(
    (item): item is EffectAppearance => item.kind === "effect" && item.effect.type === type,
  );
}

export function findFill(appearance: { items: AppearanceItem[] }): AppearanceItem | undefined {
  return appearance.items.find((item) => item.kind === "fill");
}

export function findStroke(appearance: { items: AppearanceItem[] }): AppearanceItem | undefined {
  return appearance.items.find((item) => item.kind === "stroke");
}

export function findBackground(appearance: {
  items: AppearanceItem[];
}): BackgroundAppearance | undefined {
  return appearance.items.find((item): item is BackgroundAppearance => item.kind === "background");
}

export function findFills(appearance: { items: AppearanceItem[] }): AppearanceItem[] {
  return appearance.items.filter((item) => item.kind === "fill");
}

export function findStrokes(appearance: { items: AppearanceItem[] }): AppearanceItem[] {
  return appearance.items.filter((item) => item.kind === "stroke");
}

export function findBackgrounds(appearance: { items: AppearanceItem[] }): BackgroundAppearance[] {
  return appearance.items.filter(
    (item): item is BackgroundAppearance => item.kind === "background",
  );
}

/**
 * Illustrator-like names for every object type.
 * Fill = object fill (glyphs on text). Stroke = outline. Background = behind-text box.
 */
export function appearanceItemLabel(item: AppearanceItem): string {
  if (item.kind === "fill") return "Fill";
  if (item.kind === "stroke") return "Stroke";
  if (item.kind === "background") return "Background";
  if (item.kind !== "effect") return "Item";
  if (item.effect.type === "shadow") return "Shadow";
  if (item.effect.type === "glow") return "Glow";
  if (item.effect.type === "gaussianBlur") return "Blur";
  return item.effect.type;
}

export function appearanceItemTypeLabel(item: AppearanceItem): string {
  if (item.kind === "fill") return "Fill";
  if (item.kind === "stroke") return "Line";
  if (item.kind === "background") return "Bg";
  return "Fx";
}

export function appearanceItemSwatch(item: AppearanceItem): string {
  if (item.kind === "fill" || item.kind === "background") {
    if (item.paint.type === "solid") return item.paint.color;
    if (item.paint.type === "pattern") return item.paint.foreground;
    return item.paint.stops[0]?.color ?? "transparent";
  }
  if (item.kind === "stroke") return item.color;
  if (item.kind === "effect") {
    if (item.effect.type === "shadow" || item.effect.type === "glow") return item.effect.color;
  }
  return "transparent";
}

export function stackKindOf(
  item: AppearanceItem,
): "fill" | "stroke" | "background" | "shadow" | "glow" | "blur" | null {
  if (item.kind === "fill") return "fill";
  if (item.kind === "stroke") return "stroke";
  if (item.kind === "background") return "background";
  if (item.kind === "effect" && (item.effect.type === "shadow" || item.effect.type === "glow")) {
    return item.effect.type;
  }
  if (item.kind === "effect" && item.effect.type === "gaussianBlur") return "blur";
  return null;
}
