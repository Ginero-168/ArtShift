import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILDER_BLOCKS, createBuilderBlock } from "@/lib/builder/blocks";
import {
  createVectorPathFromIcon,
  VECTOR_ICON_CATEGORIES,
  VECTOR_ICONS,
} from "@/lib/builder/vectorIconLibrary";

const ARTWORK = { width: 1920, height: 1080 };

describe("Icon Block & Vector Icon Library", () => {
  it("includes Icon block in BUILDER_BLOCKS under Content category", () => {
    const iconBlock = BUILDER_BLOCKS.find((block) => block.kind === "icon");
    expect(iconBlock).toBeDefined();
    expect(iconBlock?.label).toBe("Icon");
    expect(iconBlock?.category).toBe("Content");
  });

  it("creates a native VectorPathElement when calling createBuilderBlock for icon", () => {
    const element = createBuilderBlock("icon", ARTWORK);
    expect(element.type).toBe("path");
    expect(element.builderKind).toBe("icon");
    expect(element.backgroundColor).toBe("#111827");
    if (element.type === "path") {
      expect(element.nodes.length).toBeGreaterThan(0);
      expect(element.closed).toBe(true);
    }
  });

  it("exposes a rich vector icon library with multiple categories", () => {
    expect(VECTOR_ICONS.length).toBeGreaterThanOrEqual(30);
    expect(VECTOR_ICON_CATEGORIES).toEqual(
      expect.arrayContaining([
        "Interface",
        "Arrows",
        "Commerce",
        "Media",
        "Communication",
        "Shapes",
      ]),
    );
  });

  it("parses SVG icon path into a VectorPathElement with customizable colors", () => {
    const starIcon = VECTOR_ICONS.find((i) => i.id === "star")!;
    expect(starIcon).toBeDefined();

    const element = createVectorPathFromIcon(starIcon, {
      x: 100,
      y: 100,
      size: 80,
      color: "#6366f1",
    });

    expect(element.type).toBe("path");
    expect(element.width).toBeGreaterThan(50);
    expect(element.height).toBeGreaterThan(50);
    expect(element.width).toBeLessThanOrEqual(80);
    expect(element.height).toBeLessThanOrEqual(80);
    expect(element.backgroundColor).toBe("#6366f1");
    expect(element.strokeColor).toBe("transparent");
    expect(element.nodes.length).toBeGreaterThanOrEqual(5);
  });

  it("removes AI Image block from BlockLibrary", () => {
    const librarySource = readFileSync("components/Builder/BlockLibrary.tsx", "utf8");
    expect(librarySource).not.toContain("aiImageBlock");
    expect(librarySource).not.toContain("AI Image Studio · Replicate GPT Image 2");
    expect(librarySource).toContain("IconLibraryModal");
  });
});
