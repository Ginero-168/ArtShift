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

  it("creates every former toolbar shape from the Library", () => {
    const expected: Partial<Record<BuilderBlockKind, string>> = {
      shapeRect: "rect",
      shapeEllipse: "ellipse",
      shapeDiamond: "diamond",
      shapeTriangle: "triangle",
      shapeStar: "star",
      shapeHexagon: "hexagon",
      shapeHeart: "heart",
      shapePlus: "plus",
    };

    for (const [kind, type] of Object.entries(expected)) {
      expect(createBuilderBlock(kind as BuilderBlockKind, ARTWORK).type).toBe(type);
    }
  });
});
