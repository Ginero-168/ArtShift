import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createText } from "@/lib/engine/factory";
import { layoutText } from "@/lib/engine/textLayout";
import {
  classifyTextCreateGesture,
  createTextFromGesture,
  normalizeTextPatch,
  scaleTextWithBox,
  TEXT_CREATE_DRAG_THRESHOLD_PX,
} from "@/lib/engine/textObject";

describe("Illustrator text objects", () => {
  it("classifies a click as point text and a drag as an area Text Frame", () => {
    expect(classifyTextCreateGesture({ x: 40, y: 80 }, { x: 42, y: 81 }, 8)).toBe("point");
    expect(classifyTextCreateGesture({ x: 40, y: 80 }, { x: 160, y: 180 }, 8)).toBe("area");
    expect(TEXT_CREATE_DRAG_THRESHOLD_PX).toBe(8);
  });

  it("creates a hugging point-text box from a click", () => {
    const point = createTextFromGesture({ x: 120, y: 90 }, { x: 123, y: 91 }, 8);
    expect(point.textMode).toBe("point");
    expect(point.text).toBe("");
    expect(point.x).toBe(120);
    expect(point.y).toBe(90);
    expect(point.width).toBeLessThan(80);
    expect(point.height).toBeLessThan(80);
  });

  it("creates a wrapping area Text Frame from a drag", () => {
    const area = createTextFromGesture({ x: 40, y: 50 }, { x: 280, y: 170 }, 8);
    expect(area.textMode).toBe("area");
    expect(area.x).toBe(40);
    expect(area.y).toBe(50);
    expect(area.width).toBe(240);
    expect(area.height).toBe(120);
  });

  it("autosizes point text as the user types more or less", () => {
    const point = createText({ x: 10, y: 10, text: "Hi", textMode: "point" });
    const grown = normalizeTextPatch(point, { text: "Hello, ArtShift" });
    expect(grown.width).toBeGreaterThan(point.width);
    expect(grown.height).toBe(point.height);

    const shrunk = normalizeTextPatch(
      { ...point, ...grown, text: "Hello, ArtShift" },
      { text: "Hi" },
    );
    expect(shrunk.width).toBeCloseTo(point.width, 5);
    expect(shrunk.height).toBeCloseTo(point.height, 5);
  });

  it("wraps area text inside the dragged frame instead of growing the box", () => {
    const area = createText({
      x: 0,
      y: 0,
      width: 72,
      height: 48,
      fontSize: 12,
      text: "short",
      textMode: "area",
    });
    const patched = normalizeTextPatch(area, {
      text: "This copy should wrap inside the fixed Text Frame",
    });
    expect(patched.width).toBeUndefined();
    expect(patched.height).toBeUndefined();
    const wrapped = layoutText({
      ...area,
      text: "This copy should wrap inside the fixed Text Frame",
    });
    expect(wrapped.lines.length).toBeGreaterThan(1);
    expect(wrapped.minimumHeight).toBeGreaterThan(area.height);
  });

  it("scales glyphs with the transformer box like an image", () => {
    const point = createText({
      x: 20,
      y: 30,
      text: "Scale me",
      fontSize: 20,
      textMode: "point",
    });
    const scaledPoint = scaleTextWithBox(point, {
      x: 20,
      y: 30,
      width: point.width * 2,
      height: point.height * 2,
    });
    expect(scaledPoint.fontSize).toBeCloseTo(40, 5);
    expect(scaledPoint.width).toBeCloseTo(point.width * 2, 5);
    expect(scaledPoint.height).toBeCloseTo(point.height * 2, 5);

    const area = createText({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      fontSize: 16,
      text: "Frame copy that wraps",
      textMode: "area",
    });
    const scaledArea = scaleTextWithBox(area, { x: 0, y: 0, width: 400, height: 200 });
    expect(scaledArea.fontSize).toBeCloseTo(32, 5);
    expect(scaledArea.width).toBe(400);
    expect(scaledArea.height).toBe(200);
  });

  it("does not let an explicit transformer box get overwritten by auto-grow", () => {
    const point = createText({ x: 0, y: 0, text: "Hi", fontSize: 20, textMode: "point" });
    const patch = scaleTextWithBox(point, {
      x: 0,
      y: 0,
      width: point.width * 2,
      height: point.height * 2,
    });
    const normalized = normalizeTextPatch(point, patch);
    expect(normalized.width).toBeCloseTo(point.width * 2, 5);
    expect(normalized.height).toBeCloseTo(point.height * 2, 5);
    expect(normalized.fontSize).toBeCloseTo(40, 5);
  });
});

describe("canvas wiring for Illustrator text", () => {
  it("creates text on pointer-up from click vs drag, not immediately on pointer-down", () => {
    const editor = readFileSync("components/Canvas/CanvasEditor.tsx", "utf8");
    expect(editor).toContain("createTextFromGesture");
    expect(editor).toContain("createTextFrameDraft");
    expect(editor).toContain("TEXT_CREATE_DRAG_THRESHOLD_PX");
    expect(editor).not.toContain('createText({ x: p.x, y: p.y, text: "" })');
    expect(editor).toContain('textEl.textMode === "point" ? "add point text" : "add text frame"');
  });

  it("scales selected text glyphs with the transformer box", () => {
    const transformer = readFileSync("components/Canvas/Transformer.tsx", "utf8");
    expect(transformer).toContain("scaleTextWithBox");
    expect(transformer).toContain("scaledAppearancePatch");
    expect(transformer).toContain('start.type === "text"');
    expect(transformer).not.toContain("getTextMinimumHeight");
  });
});
