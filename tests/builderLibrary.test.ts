import { describe, expect, it } from "vitest";
import {
  BUILDER_BLOCKS,
  type BuilderBlockKind,
  createBuilderBlock,
  getBuilderBlockDefinition,
} from "@/lib/builder/blocks";
import { TEXT_PRESETS, textPresetPatch } from "@/lib/builder/textPresets";

const ARTWORK = { width: 1920, height: 1080 };

describe("Builder element library", () => {
  it("exposes one unified Text block with semantic presets", () => {
    const visibleTextBlocks = BUILDER_BLOCKS.filter((block) => block.kind === "text");
    expect(visibleTextBlocks).toHaveLength(1);
    expect(TEXT_PRESETS.map((preset) => preset.id)).toEqual([
      "title",
      "subtitle",
      "body",
      "quote",
      "author",
      "details",
      "price",
      "sale",
      "index",
    ]);

    const text = createBuilderBlock("text", ARTWORK);
    expect(text.type).toBe("text");
    expect(text.builderKind).toBe("text");
    if (text.type === "text") expect(text.textPreset).toBe("title");
  });

  it("changes a Text preset without replacing the user's content", () => {
    const text = createBuilderBlock("text", ARTWORK);
    expect(text.type).toBe("text");
    if (text.type !== "text") return;
    text.text = "ข้อความที่ผู้ใช้เขียนเอง";

    const patch = textPresetPatch(text, "quote", false);
    const changed = { ...text, ...patch };

    expect(changed.text).toBe("ข้อความที่ผู้ใช้เขียนเอง");
    expect(changed.textPreset).toBe("quote");
    expect(changed.fontStyle).toBe("italic");
    expect(changed.backgroundColor).toBe("#f1f5f9");
  });

  it("maps legacy text identities to the unified Text definition", () => {
    expect(getBuilderBlockDefinition("heading")?.kind).toBe("text");
    expect(getBuilderBlockDefinition("salePrice")?.kind).toBe("text");
    expect(getBuilderBlockDefinition("indexNumber")?.kind).toBe("text");
  });

  it("creates every former toolbar shape from the Library as a native vector path", () => {
    const shapeKinds: BuilderBlockKind[] = [
      "shapeRect",
      "shapeEllipse",
      "shapeDiamond",
      "shapeTriangle",
      "shapeStar",
      "shapeHexagon",
      "shapeHeart",
      "shapePlus",
    ];

    for (const kind of shapeKinds) {
      const block = createBuilderBlock(kind, ARTWORK);
      expect(block.type).toBe("path");
      expect(block.builderKind).toBe(kind);
      if (block.type === "path") {
        expect(block.nodes.length).toBeGreaterThan(0);
      }
    }
  });

  it("creates individual badge variants directly from the Library", () => {
    const badgeKinds: BuilderBlockKind[] = [
      "badge",
      "badgeStarburst",
      "badgeFlash",
      "badgeRibbon",
      "badgeSeal",
      "badgePriceTag",
      "badgeBookmark",
    ];

    for (const kind of badgeKinds) {
      const def = getBuilderBlockDefinition(kind);
      expect(def).toBeDefined();
      expect(def?.category).toBe("Commerce");
      const element = createBuilderBlock(kind, ARTWORK);
      expect(element).toBeDefined();
      expect(element.builderKind).toBe(kind);
    }
  });

  it("places Pen (Vector) and Pen (Freehand) as the first blocks in Lines category", () => {
    const linesBlocks = BUILDER_BLOCKS.filter((block) => block.category === "Lines");
    expect(linesBlocks[0].kind).toBe("shapePen");
    expect(linesBlocks[0].label).toBe("Pen (Vector)");
    expect(linesBlocks[1].kind).toBe("shapeFreedraw");
    expect(linesBlocks[1].label).toBe("Pen (Freehand)");
  });

  it("creates line and drawing blocks directly as unified Vector Paths from the Library", () => {
    const lineKinds: BuilderBlockKind[] = [
      "shapePen",
      "shapeFreedraw",
      "shapeLine",
      "shapeArrow",
      "shapeDoubleArrow",
      "shapeDashedLine",
      "shapeCurvedArrow",
    ];

    for (const kind of lineKinds) {
      const def = getBuilderBlockDefinition(kind);
      expect(def).toBeDefined();
      expect(def?.category).toBe("Lines");
      const element = createBuilderBlock(kind, ARTWORK);
      expect(element).toBeDefined();
      expect(element.builderKind).toBe(kind);
      expect(element.type).toBe("path");
    }
  });
});
