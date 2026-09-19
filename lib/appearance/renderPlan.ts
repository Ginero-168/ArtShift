import type { EngineElement } from "@/lib/engine/types";
import { appearanceCapabilities } from "./capabilities";
import { readAppearance } from "./legacyAdapter";
import { isMvpStackItem } from "./panelModel";

export type CanvasShadowPass = {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  source: "shadow" | "glow";
};

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
      passes.push({
        color: item.effect.color,
        blur: item.effect.blur,
        offsetX: item.effect.offsetX,
        offsetY: item.effect.offsetY,
        source: "shadow",
      });
    } else if (item.effect.type === "glow") {
      passes.push({
        color: item.effect.color,
        blur: item.effect.blur,
        offsetX: 0,
        offsetY: 0,
        source: "glow",
      });
    }
  }

  return passes;
}
