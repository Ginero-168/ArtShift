import type { EngineElement } from "@/lib/engine/types";
import { appearanceCapabilities } from "./capabilities";
import { readAppearance } from "./legacyAdapter";
import { isMvpStackItem } from "./panelModel";
import type { BackgroundAppearance, FillAppearance, StrokeAppearance } from "./types";

function isInvisiblePaintColor(color: string): boolean {
  const value = color.trim().toLowerCase();
  return (
    !value ||
    value === "transparent" ||
    value === "none" ||
    value.endsWith(",0)") ||
    value.endsWith(", 0)") ||
    value.endsWith(",0.0)") ||
    value.endsWith(", 0.0)")
  );
}

export type CanvasShadowPass = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  source: "shadow" | "glow";
};

export type CanvasPaintPass =
  | { kind: "background"; item: BackgroundAppearance }
  | { kind: "fill"; item: FillAppearance }
  | { kind: "stroke"; item: StrokeAppearance };

/**
 * Canvas2D has one shadow state per draw. When both Shadow and Glow are set,
 * emit back-to-front passes so neither is silently dropped (legacy renderer was XOR).
 */
export function canvasShadowPasses(element: EngineElement): CanvasShadowPass[] {
  const appearance = readAppearance(element);
  const caps = appearanceCapabilities(element);
  const passes: CanvasShadowPass[] = [];

  for (const item of appearance.items) {
    if (!item.visible || !isMvpStackItem(item, caps) || item.kind !== "effect") continue;
    if (item.effect.type === "shadow") {
      const layers = [
        {
          color: item.effect.color,
          blur: item.effect.blur,
          offsetX: item.effect.offsetX,
          offsetY: item.effect.offsetY,
        },
        ...(item.effect.layers ?? []),
      ];
      for (const layer of layers) {
        if (isInvisiblePaintColor(layer.color)) continue;
        passes.push({
          color: layer.color,
          blur: layer.blur,
          offsetX: layer.offsetX,
          offsetY: layer.offsetY,
          source: "shadow",
        });
      }
    } else if (item.effect.type === "glow") {
      const layers = [
        { color: item.effect.color, blur: item.effect.blur },
        ...(item.effect.layers ?? []),
      ];
      for (const layer of layers) {
        if (isInvisiblePaintColor(layer.color)) continue;
        passes.push({
          color: layer.color,
          blur: layer.blur,
          offsetX: 0,
          offsetY: 0,
          source: "glow",
        });
      }
    }
  }

  return passes;
}

/**
 * Visible paint items in stored stack order (back-to-front).
 * Background paints behind Fill/Stroke. Interleaved fills and strokes paint
 * in this sequence, like Illustrator.
 */
export function canvasPaintPasses(element: EngineElement): CanvasPaintPass[] {
  const appearance = readAppearance(element);
  const caps = appearanceCapabilities(element);
  const passes: CanvasPaintPass[] = [];

  for (const item of appearance.items) {
    if (!item.visible || !isMvpStackItem(item, caps)) continue;
    if (item.kind === "background") {
      passes.push({ kind: "background", item });
      continue;
    }
    if (item.kind === "fill") {
      if (item.fillStyle === "none") continue;
      passes.push({ kind: "fill", item });
      continue;
    }
    if (item.kind === "stroke") {
      if (item.width <= 0 || item.color === "transparent" || item.color === "none") continue;
      passes.push({ kind: "stroke", item });
    }
  }

  return passes;
}

export function canvasPaintRoles(passes: CanvasPaintPass[]): Array<CanvasPaintPass["kind"]> {
  return passes.map((pass) => pass.kind);
}

/**
 * True when paint cannot be reduced to the legacy single-fill-then-stroke draw.
 * Multiple fills/strokes, a fill in front of a stroke, or a background pass
 * need stacked compositing.
 */
export function usesStackedPaint(passes: CanvasPaintPass[]): boolean {
  let fills = 0;
  let strokes = 0;
  let sawStroke = false;
  for (const pass of passes) {
    if (pass.kind === "background") return true;
    if (pass.kind === "fill") {
      fills += 1;
      if (sawStroke) return true;
    } else {
      strokes += 1;
      sawStroke = true;
    }
  }
  return fills > 1 || strokes > 1;
}

export function appearanceMaxStrokeWidth(element: EngineElement): number {
  const widths = canvasPaintPasses(element)
    .filter((pass): pass is Extract<CanvasPaintPass, { kind: "stroke" }> => pass.kind === "stroke")
    .map((pass) => pass.item.width);
  return Math.max(element.strokeWidth ?? 0, ...widths, 0);
}

/** Static gaussian blur on the object (not CSS animation). */
export function canvasGaussianBlurRadius(element: EngineElement): number {
  const appearance = readAppearance(element);
  let radius = 0;
  for (const item of appearance.items) {
    if (!item.visible || item.kind !== "effect" || item.effect.type !== "gaussianBlur") continue;
    radius = Math.max(radius, item.effect.radius);
  }
  return radius;
}
