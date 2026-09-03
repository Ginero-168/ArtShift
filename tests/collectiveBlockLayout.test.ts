import { describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { normalizeSlideLayers, reflowBlockObjects } from "@/lib/engine/layers";
import type { EngineSlide } from "@/lib/engine/types";

function slideWithSeparateBlockLayers(): EngineSlide {
  const elements = [
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
  ].map((element) => ({ ...element, layoutMode: "block" as const }));
  return normalizeSlideLayers({
    id: "slide",
    name: "Slide",
    background: "#fff",
    width: 1200,
    height: 800,
    elements,
    layers: elements.map((element, index) => ({
      id: element.id,
      name: element.name ?? `Object ${index}`,
      mode: "block" as const,
      objectIds: [element.id],
      placements: {},
      visible: true,
      locked: false,
      z: index + 1,
    })),
  });
}

describe("collective Block layout", () => {
  it("reflows block objects across separate object layers", () => {
    const result = reflowBlockObjects(slideWithSeparateBlockLayers(), 1);
    const rects = result.elements.map((element) => ({ x: element.x, y: element.y }));
    expect(new Set(rects.map((rect) => `${rect.x}:${rect.y}`)).size).toBe(3);
  });

  it("moves colliding Block objects without changing their dimensions", () => {
    const slide = slideWithSeparateBlockLayers();
    const original = new Map(
      slide.elements.map((element) => [
        element.id,
        { width: element.width, height: element.height },
      ]),
    );
    const result = reflowBlockObjects(slide, 1);
    for (const element of result.elements) {
      expect(element.width).toBe(original.get(element.id)?.width);
      expect(element.height).toBe(original.get(element.id)?.height);
    }
  });
});
