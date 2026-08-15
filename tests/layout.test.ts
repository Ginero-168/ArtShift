import { describe, expect, it } from "vitest";
import { createBuilderBlock } from "@/lib/builder/blocks";
import { createText } from "@/lib/engine/factory";
import { placementOverlapCells } from "@/lib/engine/hexLayout";
import {
  addObjectToLayer,
  convertLayerMode,
  createEngineLayer,
  moveObjectsToLayer,
  normalizeDocumentLayers,
} from "@/lib/engine/layers";
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineSlide } from "@/lib/engine/types";

const ARTWORK = { width: 1200, height: 1200 };

function emptySlide(layers = [createEngineLayer("free", { name: "Free layer 1" })]): EngineSlide {
  return {
    id: "slide",
    name: "Slide",
    background: "#fff",
    elements: [],
    layers,
    ...ARTWORK,
  };
}

describe("Layer-owned placement", () => {
  it("keeps Block identity independent from Layer type", () => {
    const block = createBuilderBlock("heading", {
      ...ARTWORK,
      point: { x: 600, y: 600 },
    });

    expect(block.builderKind).toBe("heading");
    expect(block.bento).toBeUndefined();
  });

  it("lets one Layer own several Objects", () => {
    const layer = createEngineLayer("free", { name: "Copy" });
    let slide = emptySlide([layer]);
    const heading = createText({ x: 100, y: 100, width: 400, height: 120, text: "Heading" });
    const subtitle = createText({ x: 100, y: 240, width: 400, height: 80, text: "Subtitle" });
    slide = addObjectToLayer(slide, heading, layer.id, 1);
    slide = addObjectToLayer(slide, subtitle, layer.id, 1);

    expect(slide.layers[0].objectIds).toEqual([heading.id, subtitle.id]);
  });

  it("switches a whole Layer to Block and back without replacing Objects", () => {
    const layer = createEngineLayer("free", { name: "Copy" });
    let slide = emptySlide([layer]);
    const heading = createText({ x: 80, y: 90, width: 440, height: 140, text: "Heading" });
    const subtitle = createText({ x: 640, y: 90, width: 320, height: 100, text: "Subtitle" });
    slide = addObjectToLayer(slide, heading, layer.id, 1);
    slide = addObjectToLayer(slide, subtitle, layer.id, 1);

    const blocked = convertLayerMode(slide, layer.id, "block", 1);
    const blockedLayer = blocked.layers[0];
    expect(blockedLayer.mode).toBe("block");
    expect(Object.keys(blockedLayer.placements)).toEqual([heading.id, subtitle.id]);
    expect(
      placementOverlapCells(
        blockedLayer.placements[heading.id],
        blockedLayer.placements[subtitle.id],
      ),
    ).toBe(0);

    const geometry = blocked.elements.map(({ id, x, y, width, height }) => ({
      id,
      x,
      y,
      width,
      height,
    }));
    const freed = convertLayerMode(blocked, layer.id, "free", 1);
    expect(freed.layers[0].mode).toBe("free");
    expect(freed.layers[0].placements).toEqual({});
    expect(
      freed.elements.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    ).toEqual(geometry);
  });

  it("moves multiple selected Objects into another Layer", () => {
    const source = createEngineLayer("free", { name: "Source", z: 1 });
    const target = createEngineLayer("block", { name: "Target", z: 2 });
    let slide = emptySlide([source, target]);
    const a = createText({ x: 40, y: 40, text: "A" });
    const b = createText({ x: 400, y: 40, text: "B" });
    slide = addObjectToLayer(slide, a, source.id, 1);
    slide = addObjectToLayer(slide, b, source.id, 1);
    slide = moveObjectsToLayer(slide, [a.id, b.id], target.id, 1);

    expect(slide.layers.find((layer) => layer.id === source.id)?.objectIds).toEqual([]);
    expect(slide.layers.find((layer) => layer.id === target.id)?.objectIds).toEqual([a.id, b.id]);
  });

  it("migrates schema-v1 Object placement into Layer containers", () => {
    const grid = createText({ x: 0, y: 0, text: "Grid" });
    grid.bento = { col: 2, row: 3, colSpan: 4, rowSpan: 2 };
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
    const blockLayer = migrated.slides[0].layers.find((layer) => layer.mode === "block");
    const freeLayer = migrated.slides[0].layers.find((layer) => layer.mode === "free");
    expect(blockLayer?.objectIds).toEqual([grid.id]);
    expect(blockLayer?.placements[grid.id]).toMatchObject({ col: 3, colSpan: 6 });
    expect(freeLayer?.objectIds).toEqual([free.id]);
  });

  it("migrates schema-v2 Block placement from the reference grid to a portrait grid", () => {
    const block = createText({ x: 100, y: 100, width: 600, height: 300, text: "Portrait" });
    const layer = createEngineLayer("block", { name: "Legacy Block" });
    layer.objectIds = [block.id];
    layer.placements[block.id] = { col: 6, row: 3, colSpan: 12, rowSpan: 6 };
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
    const placement = slide.layers[0].placements[block.id];
    const element = slide.elements[0];
    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    expect(placement).toMatchObject({ col: 4, row: 5, colSpan: 8, rowSpan: 9 });
    expect(element.x).toBeGreaterThanOrEqual(0);
    expect(element.y).toBeGreaterThanOrEqual(0);
    expect(element.x + element.width).toBeLessThanOrEqual(slide.width);
    expect(element.y + element.height).toBeLessThanOrEqual(slide.height);
  });
});
