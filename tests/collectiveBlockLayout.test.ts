import { describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { normalizeDocumentLayers } from "@/lib/engine/layers";
import type { EngineDoc, EngineSlide } from "@/lib/engine/types";

function slideWithSeparateBlockLayers(): EngineSlide {
  const elements = [
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
    createRect({ x: 10, y: 10, width: 240, height: 180 }),
  ].map((element) => ({ ...element, layoutMode: "block" as const }));
  return {
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
      placements: {
        [element.id]: { col: 0, row: 0, colSpan: 4, rowSpan: 3 },
      },
      visible: true,
      locked: false,
      z: index + 1,
    })),
  };
}

describe("collective Block layout (P0 bake)", () => {
  it("keeps overlapping geometry when Block layers flatten to Free", () => {
    const source = slideWithSeparateBlockLayers();
    const doc = {
      id: "doc",
      title: "Collective",
      width: 1200,
      height: 800,
      slides: [source],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: 1,
      schemaVersion: 5,
    } satisfies EngineDoc;
    const result = normalizeDocumentLayers(doc).slides[0];
    expect(result.layers.every((layer) => layer.mode === "free")).toBe(true);
    const rects = result.elements.map((element) => ({ x: element.x, y: element.y }));
    expect(new Set(rects.map((rect) => `${rect.x}:${rect.y}`)).size).toBe(1);
    expect(rects.every((rect) => rect.x === 10 && rect.y === 10)).toBe(true);
  });

  it("does not change object dimensions while baking", () => {
    const source = slideWithSeparateBlockLayers();
    const original = new Map(
      source.elements.map((element) => [
        element.id,
        { width: element.width, height: element.height },
      ]),
    );
    const result = normalizeDocumentLayers({
      id: "doc",
      title: "Collective",
      width: 1200,
      height: 800,
      slides: [source],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: 1,
      schemaVersion: 5,
    }).slides[0];
    for (const element of result.elements) {
      expect(element.width).toBe(original.get(element.id)?.width);
      expect(element.height).toBe(original.get(element.id)?.height);
      expect(element.layoutMode).toBe("free");
    }
  });
});
