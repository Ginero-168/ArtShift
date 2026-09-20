import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addBackgroundOperation,
  addFillOperation,
  addStrokeOperation,
  appearanceItemLabel,
  appearanceStackRows,
  appearanceToLegacyPatch,
  canvasPaintPasses,
  canvasPaintRoles,
  changeAppearance,
  findBackground,
  findFill,
  findStroke,
  hydrateElementAppearance,
  migrateTextPaintSemantics,
  readAppearance,
  strokePatchOperation,
} from "@/lib/appearance";
import type { Appearance } from "@/lib/appearance/types";
import { createRect, createText } from "@/lib/engine/factory";
import type { TextElement } from "@/lib/engine/types";

function solidFillColor(element: ReturnType<typeof createText>) {
  const fill = findFill(readAppearance(element));
  return fill?.kind === "fill" && fill.paint.type === "solid" ? fill.paint.color : null;
}

describe("text Appearance Fill / Stroke / Background roles", () => {
  it("labels default text Fill and Stroke — not Background-as-Fill or Text-as-Line", () => {
    const text = createText({ x: 0, y: 0, width: 120, text: "Hello" });
    const rows = appearanceStackRows(text);
    const itemRows = rows.filter((row) => row.kind === "item");
    const labels = itemRows.map((row) => appearanceItemLabel(row.item));
    expect(labels).toContain("Fill");
    expect(labels).toContain("Stroke");
    expect(labels).not.toContain("Background");
    expect(labels.filter((label) => label === "Text")).toHaveLength(0);

    const fill = findFill(readAppearance(text));
    const stroke = findStroke(readAppearance(text));
    expect(fill && appearanceItemLabel(fill)).toBe("Fill");
    expect(stroke && appearanceItemLabel(stroke)).toBe("Stroke");
  });

  it("uses the glyph color as Fill and keeps Stroke as an outline (width 0 until added)", () => {
    const text = createText({ x: 0, y: 0, width: 80, text: "Hi" });
    expect(solidFillColor(text)).toBe(text.strokeColor);
    expect(findBackground(readAppearance(text))).toBeUndefined();

    const stroke = findStroke(readAppearance(text));
    expect(stroke?.kind).toBe("stroke");
    if (stroke?.kind !== "stroke") return;
    expect(stroke.width).toBe(0);

    const roles = canvasPaintRoles(canvasPaintPasses(text));
    expect(roles).toEqual(["fill"]);
    expect(roles).not.toContain("background");
  });

  it("paints Fill as glyphs, Stroke as outline, Background behind text", () => {
    const text = createText({ x: 0, y: 0, width: 80, text: "Hi" });
    const withBackground = changeAppearance(text, addBackgroundOperation(text));
    expect(withBackground.ok).toBe(true);
    if (!withBackground.ok) return;

    const stroke = findStroke(readAppearance(withBackground.element));
    expect(stroke?.kind).toBe("stroke");
    const outlined = changeAppearance(
      withBackground.element,
      strokePatchOperation(withBackground.element, { width: 3, color: "#ff0000" }, stroke?.id),
    );
    expect(outlined.ok).toBe(true);
    if (!outlined.ok) return;

    const passes = canvasPaintPasses(outlined.element);
    expect(canvasPaintRoles(passes)).toEqual(["background", "fill", "stroke"]);

    const background = passes[0];
    const fill = passes[1];
    const outline = passes[2];
    expect(background?.kind).toBe("background");
    expect(fill?.kind).toBe("fill");
    expect(outline?.kind).toBe("stroke");
    if (fill?.kind === "fill" && fill.item.paint.type === "solid") {
      expect(fill.item.paint.color).toBe(text.strokeColor);
    }
    if (outline?.kind === "stroke") {
      expect(outline.item.color).toBe("#ff0000");
      expect(outline.item.width).toBe(3);
    }
  });

  it("adds Background as a separate stack item, not by renaming Fill", () => {
    const text = createText({ x: 0, y: 0, width: 80, text: "Hi" });
    const before = readAppearance(text);
    expect(findFill(before)).toBeTruthy();
    expect(findBackground(before)).toBeUndefined();

    const added = changeAppearance(text, addBackgroundOperation(text));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const appearance = readAppearance(added.element);
    expect(findBackground(appearance)?.kind).toBe("background");
    expect(appearanceItemLabel(findBackground(appearance)!)).toBe("Background");
    expect(appearanceItemLabel(findFill(appearance)!)).toBe("Fill");
    expect(solidFillColor(added.element as typeof text)).toBe(text.strokeColor);
    expect(added.element.backgroundColor).not.toBe("transparent");

    const rows = appearanceStackRows(added.element);
    expect(
      rows.filter((row) => row.kind === "item").map((row) => appearanceItemLabel(row.item)),
    ).toEqual(["Stroke", "Fill", "Background"]);
  });

  it("dual-writes text Fill to strokeColor (glyph) and Background to backgroundColor", () => {
    const text = createText({ x: 0, y: 0, width: 80, text: "Hi" });
    const added = changeAppearance(text, addBackgroundOperation(text));
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const patch = appearanceToLegacyPatch(readAppearance(added.element), added.element);
    expect(patch.strokeColor).toBe(text.strokeColor);
    expect(patch.backgroundColor).toBe("#ffffff");
  });

  it("migrates legacy text stacks: old Fill box → Background, old Stroke → glyph Fill", () => {
    const text = {
      ...createText({ x: 0, y: 0, width: 80, text: "Hi" }),
      strokeColor: "#112233",
      backgroundColor: "#abcdef",
      fillStyle: "solid" as const,
    } as TextElement;
    const legacy: Appearance = {
      schemaVersion: 1,
      opacity: 1,
      blendMode: "source-over",
      items: [
        {
          id: "fill:old",
          kind: "fill",
          visible: true,
          opacity: 1,
          paint: { type: "solid", color: "#abcdef" },
          fillStyle: "solid",
        },
        {
          id: "stroke:old",
          kind: "stroke",
          visible: true,
          opacity: 1,
          color: "#112233",
          width: 2,
          style: "solid",
        },
      ],
    };
    const migrated = migrateTextPaintSemantics(text, legacy);
    expect(migrated.paintSemantics).toBe("object");
    expect(migrated.items.map((item) => item.kind)).toEqual(["background", "fill", "stroke"]);
    const background = migrated.items.find((item) => item.kind === "background");
    const fill = migrated.items.find((item) => item.kind === "fill");
    const stroke = migrated.items.find((item) => item.kind === "stroke");
    expect(background?.kind === "background" && background.paint.type === "solid").toBe(true);
    if (background?.kind === "background" && background.paint.type === "solid") {
      expect(background.paint.color).toBe("#abcdef");
    }
    expect(fill?.kind === "fill" && fill.paint.type === "solid" ? fill.paint.color : null).toBe(
      "#112233",
    );
    expect(stroke?.kind === "stroke" ? stroke.width : null).toBe(0);

    const hydrated = hydrateElementAppearance({ ...text, appearance: legacy });
    expect(hydrated.strokeColor).toBe("#112233");
    expect(hydrated.backgroundColor).toBe("#abcdef");
    expect(findBackground(readAppearance(hydrated))?.kind).toBe("background");
    expect(solidFillColor(hydrated as typeof text)).toBe("#112233");
  });

  it("keeps shape Fill/Stroke meaning and does not invent a Background row", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 40, height: 40 }),
      backgroundColor: "#ff0000",
      fillStyle: "solid" as const,
      strokeColor: "#00ff00",
      strokeWidth: 3,
    };
    const appearance = readAppearance(rect);
    expect(findBackground(appearance)).toBeUndefined();
    expect(appearanceItemLabel(findFill(appearance)!)).toBe("Fill");
    expect(appearanceItemLabel(findStroke(appearance)!)).toBe("Stroke");
    expect(canvasPaintRoles(canvasPaintPasses(rect))).toEqual(["fill", "stroke"]);
    expect(appearanceToLegacyPatch(appearance, rect).backgroundColor).toBe("#ff0000");
    expect(appearanceToLegacyPatch(appearance, rect).strokeColor).toBe("#00ff00");
  });

  it("keeps multi Fill/Stroke add on text as extra glyph fills/outlines", () => {
    const text = createText({ x: 0, y: 0, width: 80, text: "Hi" });
    const withFill = changeAppearance(text, addFillOperation(text));
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    const withStroke = changeAppearance(withFill.element, addStrokeOperation(withFill.element));
    expect(withStroke.ok).toBe(true);
    if (!withStroke.ok) return;
    const kinds = readAppearance(withStroke.element).items.map((item) => item.kind);
    expect(kinds.filter((kind) => kind === "fill").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "stroke").length).toBeGreaterThanOrEqual(2);
    expect(kinds).not.toContain("background");
  });
});

describe("text Appearance UI wiring", () => {
  it("exposes + Background and never labels Fill as Background or Stroke as Text", () => {
    const panel = readFileSync("components/Builder/AppearancePanel.tsx", "utf8");
    const canvas = readFileSync("lib/renderer/canvas.ts", "utf8");
    expect(panel).toContain('data-appearance-add="background"');
    expect(panel).toContain("addBackgroundOperation");
    expect(panel).toContain("appearanceItemTypeLabel");
    expect(panel).not.toContain('element.type === "text" ? "Background"');
    expect(panel).not.toContain('element.type === "text" ? "Text"');
    expect(canvas).toContain("paintTextBackground");
    expect(canvas).toContain('mode === "stroke"');
    expect(canvas).toContain("strokeText");
  });
});
