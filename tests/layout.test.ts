import { describe, expect, it } from "vitest";
import { createBuilderBlock } from "@/lib/builder/blocks";
import { createRect, createText } from "@/lib/engine/factory";
import {
  addObjectToLayer,
  createEngineLayer,
  moveObjectsToLayer,
  normalizeDocumentLayers,
} from "@/lib/engine/layers";
import {
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineLayer,
  type EngineSlide,
} from "@/lib/engine/types";

const ARTWORK = { width: 1200, height: 1200 };

type LegacyLayer = EngineLayer & {
  mode?: string;
  placements?: Record<string, { col: number; row: number; colSpan: number; rowSpan: number }>;
};

function emptySlide(layers = [createEngineLayer("free", { name: "Layer 1" })]): EngineSlide {
  return {
    id: "slide",
    name: "Slide",
    background: "#fff",
    elements: [],
    layers,
    ...ARTWORK,
  };
}

function assertNoHexFields(slide: EngineSlide) {
  for (const layer of slide.layers) {
    expect("mode" in layer).toBe(false);
    expect("placements" in layer).toBe(false);
  }
  for (const element of slide.elements) {
    expect("layoutMode" in element).toBe(false);
    expect("bento" in element).toBe(false);
  }
}

describe("Layer-owned placement", () => {
  it("keeps Block library identity independent from hex layout", () => {
    const block = createBuilderBlock("heading", {
      ...ARTWORK,
      point: { x: 600, y: 600 },
    });

    expect(block.builderKind).toBe("heading");
    expect("bento" in block).toBe(false);
    expect("layoutMode" in block).toBe(false);
    expect(block.width).toBeGreaterThan(0);
    expect(block.height).toBeGreaterThan(0);
  });

  it("lets one Layer own several Objects", () => {
    const layer = createEngineLayer("free", { name: "Copy" });
    let slide = emptySlide([layer]);
    const heading = createText({ x: 100, y: 100, width: 400, height: 120, text: "Heading" });
    const subtitle = createText({ x: 100, y: 240, width: 400, height: 80, text: "Subtitle" });
    slide = addObjectToLayer(slide, heading, layer.id);
    slide = addObjectToLayer(slide, subtitle, layer.id);

    expect(slide.layers[0].objectIds).toEqual([heading.id, subtitle.id]);
  });

  it("keeps Free geometry when adding objects to a layer", () => {
    const layer = createEngineLayer("free", { name: "Copy" });
    let slide = emptySlide([layer]);
    const heading = createText({ x: 80, y: 90, width: 440, height: 140, text: "Heading" });
    const subtitle = createText({ x: 640, y: 90, width: 320, height: 100, text: "Subtitle" });
    slide = addObjectToLayer(slide, heading, layer.id);
    slide = addObjectToLayer(slide, subtitle, layer.id);
    expect(
      slide.elements.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    ).toEqual([
      { id: heading.id, x: 80, y: 90, width: 440, height: 140 },
      { id: subtitle.id, x: 640, y: 90, width: 320, height: 100 },
    ]);
    assertNoHexFields(slide);
  });

  it("moves multiple selected Objects into another Layer", () => {
    const source = createEngineLayer("free", { name: "Source", z: 1 });
    const target = createEngineLayer("block", { name: "Target", z: 2 });
    let slide = emptySlide([source, target]);
    const a = createText({ x: 40, y: 40, text: "A" });
    const b = createText({ x: 400, y: 40, text: "B" });
    slide = addObjectToLayer(slide, a, source.id);
    slide = addObjectToLayer(slide, b, source.id);
    slide = moveObjectsToLayer(slide, [a.id, b.id], target.id);

    expect(slide.layers.find((layer) => layer.id === source.id)?.objectIds).toEqual([]);
    expect(slide.layers.find((layer) => layer.id === target.id)?.objectIds).toEqual([a.id, b.id]);
    assertNoHexFields(slide);
  });

  it("keeps overlapping Block objects where they were when baking to Free", () => {
    const lower = createEngineLayer("block", { name: "Lower", z: 1 }) as LegacyLayer;
    const upper = createEngineLayer("block", { name: "Upper", z: 2 }) as LegacyLayer;
    const lowerObject = createRect({ x: 40, y: 40, width: 200, height: 200 });
    const upperObject = createRect({ x: 40, y: 40, width: 200, height: 200 });
    lower.objectIds = [lowerObject.id];
    upper.objectIds = [upperObject.id];
    lower.mode = "block";
    upper.mode = "block";
    lower.placements = { [lowerObject.id]: { col: 2, row: 2, colSpan: 4, rowSpan: 4 } };
    upper.placements = { [upperObject.id]: { col: 2, row: 2, colSpan: 4, rowSpan: 4 } };

    const migrated = normalizeDocumentLayers({
      id: "doc-overlap",
      title: "Overlap",
      width: 1200,
      height: 1200,
      slides: [{ ...emptySlide([lower, upper]), elements: [lowerObject, upperObject] }],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: 1,
      schemaVersion: 5,
    });
    const slide = migrated.slides[0];
    assertNoHexFields(slide);
    expect(slide.elements[0]).toMatchObject({ x: 40, y: 40, width: 200, height: 200 });
    expect(slide.elements[1]).toMatchObject({ x: 40, y: 40, width: 200, height: 200 });
  });

  it("migrates schema-v1 Object placement into Layer containers", () => {
    const grid = createText({ x: 0, y: 0, text: "Grid" });
    Object.assign(grid, { bento: { col: 2, row: 3, colSpan: 4, rowSpan: 2 } });
    const free = createText({ x: 500, y: 200, text: "Free" });
    const legacy = {
      id: "doc",
      title: "Legacy",
      width: 1200,
      height: 1200,
      slides: [{ ...emptySlide([]), elements: [grid, free] }],
      snapGrid: null,
      updatedAt: 1,
      schemaVersion: 1,
    } as unknown as EngineDoc;

    const migrated = normalizeDocumentLayers(legacy);
    const slide = migrated.slides[0];
    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    assertNoHexFields(slide);
    expect(slide.elements.map((element) => element.id).sort()).toEqual([free.id, grid.id].sort());
    const bakedGrid = slide.elements.find((element) => element.id === grid.id);
    expect(bakedGrid?.x).toBeGreaterThanOrEqual(0);
    expect(bakedGrid?.y).toBeGreaterThanOrEqual(0);
    const bakedFree = slide.elements.find((element) => element.id === free.id);
    expect(bakedFree).toMatchObject({ x: 500, y: 200 });
  });

  it("migrates schema-v2 Block placement from the reference grid to a portrait grid", () => {
    const block = createText({ x: 100, y: 100, width: 600, height: 300, text: "Portrait" });
    const layer = createEngineLayer("block", { name: "Legacy Block" }) as LegacyLayer;
    layer.objectIds = [block.id];
    layer.mode = "block";
    layer.placements = { [block.id]: { col: 6, row: 3, colSpan: 12, rowSpan: 6 } };
    const portraitSlide: EngineSlide = {
      ...emptySlide([layer]),
      width: 1080,
      height: 1350,
      elements: [block],
    };
    const legacy = {
      id: "doc-v2",
      title: "Legacy adaptive grid",
      width: 1080,
      height: 1350,
      slides: [portraitSlide],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: 1,
      schemaVersion: 2,
    } satisfies EngineDoc;

    const migrated = normalizeDocumentLayers(legacy);
    const slide = migrated.slides[0];
    const element = slide.elements[0];
    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    assertNoHexFields(slide);
    expect(element.x).toBeGreaterThanOrEqual(0);
    expect(element.y).toBeGreaterThanOrEqual(0);
    expect(element.x + element.width).toBeLessThanOrEqual(slide.width);
    expect(element.y + element.height).toBeLessThanOrEqual(slide.height);
  });
});
