import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addFillOperation,
  addGlowOperation,
  addShadowOperation,
  addStrokeOperation,
  appearanceCapabilities,
  appearanceStackRows,
  canvasPaintPasses,
  canvasShadowPasses,
  changeAppearance,
  fillPaintOperation,
  findFills,
  findStrokes,
  nudgeItemOperation,
  paintInsertIndex,
  readAppearance,
  removeItemOperation,
  strokePatchOperation,
  usesStackedPaint,
} from "@/lib/appearance";
import { createImage, createRect, createText, createVectorPath } from "@/lib/engine/factory";
import type { EngineElement } from "@/lib/engine/types";

function paintKinds(element: EngineElement) {
  return canvasPaintPasses(element).map((pass) => pass.kind);
}

function fillColors(element: EngineElement) {
  return canvasPaintPasses(element).flatMap((pass) =>
    pass.kind === "fill" && pass.item.paint.type === "solid" ? [pass.item.paint.color] : [],
  );
}

function strokeColors(element: EngineElement) {
  return canvasPaintPasses(element).flatMap((pass) =>
    pass.kind === "stroke" ? [pass.item.color] : [],
  );
}

describe("multi-layer Fill/Stroke", () => {
  it("adds extra fills and strokes in front of existing paint and behind effects", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 80, height: 60 }),
      backgroundColor: "#ff0000",
      fillStyle: "solid" as const,
      strokeColor: "#00ff00",
      strokeWidth: 4,
    };
    const withShadow = changeAppearance(rect, addShadowOperation());
    expect(withShadow.ok).toBe(true);
    if (!withShadow.ok) return;

    const addedFill = changeAppearance(withShadow.element, addFillOperation(withShadow.element));
    expect(addedFill.ok).toBe(true);
    if (!addedFill.ok) return;
    expect(findFills(readAppearance(addedFill.element))).toHaveLength(2);

    const addedStroke = changeAppearance(addedFill.element, addStrokeOperation(addedFill.element));
    expect(addedStroke.ok).toBe(true);
    if (!addedStroke.ok) return;
    expect(findStrokes(readAppearance(addedStroke.element))).toHaveLength(2);

    const appearance = readAppearance(addedStroke.element);
    expect(paintInsertIndex(appearance)).toBe(
      appearance.items.findIndex((item) => item.kind === "effect"),
    );
    const paint = appearance.items.filter((item) => item.kind === "fill" || item.kind === "stroke");
    const effects = appearance.items.filter((item) => item.kind === "effect");
    expect(paint.at(-1)?.kind).toBe("stroke");
    expect(effects[0]?.kind).toBe("effect");
    expect(appearance.items.indexOf(paint.at(-1)!)).toBeLessThan(
      appearance.items.indexOf(effects[0]!),
    );
  });

  it("removes a specific fill/stroke by id without dropping the other layers", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 40, height: 40 }),
      backgroundColor: "#111111",
      fillStyle: "solid" as const,
    };
    const withFill = changeAppearance(rect, addFillOperation(rect));
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    const fills = findFills(readAppearance(withFill.element));
    expect(fills).toHaveLength(2);

    const removed = changeAppearance(withFill.element, removeItemOperation(fills[1]!.id));
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    const remaining = findFills(readAppearance(removed.element));
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(fills[0]!.id);
  });

  it("paints stacked fills/strokes back-to-front and reorder changes that order", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 50, height: 50 }),
      backgroundColor: "#ff0000",
      fillStyle: "solid" as const,
      strokeColor: "#0000ff",
      strokeWidth: 2,
    };
    const withFill = changeAppearance(rect, addFillOperation(rect));
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;

    const frontFillId = findFills(readAppearance(withFill.element)).at(-1)!.id;
    const recolored = changeAppearance(
      withFill.element,
      fillPaintOperation(
        withFill.element,
        { type: "solid", color: "#00ff00" },
        { itemId: frontFillId },
      ),
    );
    expect(recolored.ok).toBe(true);
    if (!recolored.ok) return;

    expect(fillColors(recolored.element)).toEqual(["#ff0000", "#00ff00"]);
    expect(usesStackedPaint(canvasPaintPasses(recolored.element))).toBe(true);

    const withStroke = changeAppearance(recolored.element, addStrokeOperation(recolored.element));
    expect(withStroke.ok).toBe(true);
    if (!withStroke.ok) return;
    const frontStrokeId = findStrokes(readAppearance(withStroke.element)).at(-1)!.id;
    const restroked = changeAppearance(
      withStroke.element,
      strokePatchOperation(withStroke.element, { color: "#ffff00", width: 8 }, frontStrokeId),
    );
    expect(restroked.ok).toBe(true);
    if (!restroked.ok) return;
    expect(strokeColors(restroked.element)).toEqual(["#0000ff", "#ffff00"]);
    expect(paintKinds(restroked.element)).toEqual(["fill", "stroke", "fill", "stroke"]);

    const appearance = readAppearance(restroked.element);
    const backFillId = findFills(appearance)[0]!.id;
    const nudged = nudgeItemOperation(restroked.element, backFillId, 1);
    expect(nudged).toBeTruthy();
    const moved = changeAppearance(restroked.element, nudged!);
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;

    expect(paintKinds(moved.element)).toEqual(["stroke", "fill", "fill", "stroke"]);
    expect(fillColors(moved.element)).toEqual(["#ff0000", "#00ff00"]);
    expect(strokeColors(moved.element)).toEqual(["#0000ff", "#ffff00"]);
  });

  it("updates only the targeted fill, not the first fill", () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 24, height: 24 }),
      backgroundColor: "#aaaaaa",
      fillStyle: "solid" as const,
    };
    const withFill = changeAppearance(rect, addFillOperation(rect));
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    const [back, front] = findFills(readAppearance(withFill.element));
    const next = changeAppearance(
      withFill.element,
      fillPaintOperation(
        withFill.element,
        { type: "solid", color: "#abcdef" },
        { itemId: front!.id },
      ),
    );
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    const colors = fillColors(next.element);
    expect(colors[0]).toBe("#aaaaaa");
    expect(colors.at(-1)).toBe("#abcdef");
    expect(back?.id).not.toBe(front?.id);
  });

  it("keeps shadow, glow, and text arc working beside extra fills/strokes", () => {
    const rect = createRect({ x: 0, y: 0, width: 30, height: 30 });
    const withFill = changeAppearance(rect, addFillOperation(rect));
    expect(withFill.ok).toBe(true);
    if (!withFill.ok) return;
    const withShadow = changeAppearance(withFill.element, addShadowOperation());
    expect(withShadow.ok).toBe(true);
    if (!withShadow.ok) return;
    const withGlow = changeAppearance(withShadow.element, addGlowOperation());
    expect(withGlow.ok).toBe(true);
    if (!withGlow.ok) return;

    expect(withGlow.element.shadow).toBeTruthy();
    expect(withGlow.element.glow).toBeTruthy();
    expect(findFills(readAppearance(withGlow.element)).length).toBeGreaterThanOrEqual(2);
    expect(canvasShadowPasses(withGlow.element).map((pass) => pass.source)).toEqual([
      "shadow",
      "glow",
    ]);

    const text = createText({ x: 0, y: 0, width: 80, text: "Arc" });
    text.pathCurvature = 20;
    const withTextStroke = changeAppearance(text, addStrokeOperation(text));
    expect(withTextStroke.ok).toBe(true);
    if (!withTextStroke.ok) return;
    const rows = appearanceStackRows(withTextStroke.element);
    expect(rows[0]).toMatchObject({ kind: "textArc", value: 20 });
    expect(findStrokes(readAppearance(withTextStroke.element)).length).toBeGreaterThanOrEqual(2);
  });

  it("enables stacked paint on shapes, paths, and text — not images", () => {
    expect(
      appearanceCapabilities(createRect({ x: 0, y: 0, width: 8, height: 8 })).multipleFills,
    ).toBe(true);
    expect(
      appearanceCapabilities(
        createVectorPath(
          [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          true,
        ),
      ).multipleFills,
    ).toBe(true);
    expect(
      appearanceCapabilities(createText({ x: 0, y: 0, width: 40, text: "Hi" })).multipleStrokes,
    ).toBe(true);
    expect(
      appearanceCapabilities(
        createImage({
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          fileId: "f",
          naturalWidth: 10,
          naturalHeight: 10,
        }),
      ).multipleFills,
    ).toBe(false);
  });
});

describe("multi Fill/Stroke UI and renderer wiring", () => {
  it("keeps Add Fill/Stroke available and targets item ids for edit/remove/reorder", () => {
    const panel = readFileSync("components/Builder/AppearancePanel.tsx", "utf8");
    const canvas = readFileSync("lib/renderer/canvas.ts", "utf8");
    expect(panel).toContain('data-appearance-add="fill"');
    expect(panel).toContain('data-appearance-add="stroke"');
    expect(panel).toContain("multipleFills");
    expect(panel).toContain("nudgeItemOperation");
    expect(panel).toContain("removeItemOperation");
    expect(panel).toContain("itemId: item.id");
    expect(panel).toContain("ปรับโทนภาพ");
    expect(canvas).toContain("canvasPaintPasses");
    expect(canvas).toContain("usesStackedPaint");
    expect(canvas).toContain("paintStackedGeometry");
  });
});
