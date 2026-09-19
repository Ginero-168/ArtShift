import { describe, expect, it } from "vitest";
import { createRect, createText } from "@/lib/engine/factory";
import { flattenBlockLayoutToFree, normalizeDocumentLayers } from "@/lib/engine/layers";
import { fromJSON } from "@/lib/engine/serialize";
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineSlide } from "@/lib/engine/types";

function v5BlockDoc(): EngineDoc {
  const a = createRect({ x: 120, y: 80, width: 400, height: 220 });
  const b = createText({ x: 560, y: 90, width: 300, height: 80, text: "Headline" });
  a.layoutMode = "block";
  b.layoutMode = "block";
  const slide: EngineSlide = {
    id: "slide",
    name: "Slide",
    background: "#fff",
    width: 1920,
    height: 1080,
    elements: [a, b],
    layers: [
      {
        id: "block-layer",
        name: "Block layer 1",
        mode: "block",
        objectIds: [a.id, b.id],
        placements: {
          [a.id]: { col: 2, row: 1, colSpan: 8, rowSpan: 4 },
          [b.id]: { col: 10, row: 1, colSpan: 6, rowSpan: 2 },
        },
        visible: true,
        locked: false,
        z: 1,
      },
    ],
  };
  return {
    id: "doc-v5-block",
    title: "V5 Block",
    width: 1920,
    height: 1080,
    slides: [slide],
    snapGrid: null,
    workspaceStrictness: 2,
    strictnessLevel: 2,
    strictnessValues: { 2: 1, 3: 2 },
    updatedAt: 1,
    schemaVersion: 5,
  };
}

describe("P0 Block → Free migration", () => {
  it("bakes v5 Block placements into Free pixels and clears cells", () => {
    const source = v5BlockDoc();
    const before = source.slides[0].elements.map((element) => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }));

    const migrated = normalizeDocumentLayers(source);
    const slide = migrated.slides[0];

    expect(migrated.schemaVersion).toBe(ENGINE_SCHEMA_VERSION);
    expect(slide.layers).toHaveLength(1);
    expect(slide.layers[0].mode).toBe("free");
    expect(slide.layers[0].placements).toEqual({});
    expect(slide.layers[0].objectIds).toEqual(source.slides[0].layers[0].objectIds);
    expect(slide.elements.every((element) => element.layoutMode === "free")).toBe(true);
    expect(
      slide.elements.map((element) => ({
        id: element.id,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
      })),
    ).toEqual(before);
  });

  it("fromJSON of a v5 Block document lands on schema v6 Free geometry", () => {
    const migrated = fromJSON(v5BlockDoc());
    expect(migrated.schemaVersion).toBe(6);
    expect(migrated.slides[0].layers.every((layer) => layer.mode === "free")).toBe(true);
    expect(migrated.slides[0].layers.every((layer) => Object.keys(layer.placements).length === 0)).toBe(
      true,
    );
  });

  it("flatten is idempotent and does not rewrite pixels", () => {
    const slide = v5BlockDoc().slides[0];
    const once = flattenBlockLayoutToFree(slide);
    const twice = flattenBlockLayoutToFree(once);
    expect(twice).toEqual(once);
    expect(once.elements[0]).toMatchObject({
      x: slide.elements[0].x,
      y: slide.elements[0].y,
      width: slide.elements[0].width,
      height: slide.elements[0].height,
      layoutMode: "free",
    });
  });
});
