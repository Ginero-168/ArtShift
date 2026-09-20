import { describe, expect, it } from "vitest";
import {
  getObjectContextBarLeft,
  getObjectContextBarTop,
  getObjectContextCategory,
  OBJECT_CONTEXT_BAR_OFFSET,
  OBJECT_CONTEXT_BAR_SCREEN_LIFT,
} from "@/lib/engine/objectContext";
import type { EngineElement } from "@/lib/engine/types";

describe("object context categories", () => {
  it("describes a homogeneous selection with its specific category", () => {
    const elements = [{ type: "image" }, { type: "image" }] as EngineElement[];
    expect(getObjectContextCategory(elements)).toEqual({ category: "Image", multiple: true });
  });

  it("uses a multiple selection category for mixed objects", () => {
    const elements = [{ type: "text" }, { type: "rect" }] as EngineElement[];
    expect(getObjectContextCategory(elements)).toEqual({ category: "Multiple", multiple: true });
  });

  it("keeps a normal-width bar inside the viewport", () => {
    expect(getObjectContextBarLeft(900, 240, 1000)).toBe(760);
    expect(getObjectContextBarLeft(100, 240, 1000)).toBe(0);
  });

  it("allows a too-wide bar to overflow right but never left", () => {
    expect(getObjectContextBarLeft(100, 1200, 1000)).toBe(0);
  });

  it("positions option bar 30 CSS px higher than the scaled world offset", () => {
    expect(OBJECT_CONTEXT_BAR_OFFSET).toBe(25);
    expect(OBJECT_CONTEXT_BAR_SCREEN_LIFT).toBe(30);
    const result = getObjectContextBarTop({
      topPointY: 300,
      bottomPointY: 450,
      barHeight: 38,
      scale: 1,
    });
    // 300 - 38 - (25 * 1 + 30) = 207
    expect(result.placeBelow).toBe(false);
    expect(result.top).toBe(207);
  });

  it("keeps the 30px screen lift when zoomed out so the gap is still CSS pixels", () => {
    const result = getObjectContextBarTop({
      topPointY: 400,
      bottomPointY: 600,
      barHeight: 38,
      scale: 0.19,
    });
    // 400 - 38 - (25 * 0.19 + 30) = 400 - 38 - 34.75 = 327.25
    expect(result.placeBelow).toBe(false);
    expect(result.top).toBe(327.25);
  });

  it("scales the world offset with zoom while keeping the 30px screen lift", () => {
    const result = getObjectContextBarTop({
      topPointY: 400,
      bottomPointY: 600,
      barHeight: 38,
      scale: 1.5,
    });
    // 400 - 38 - (25 * 1.5 + 30) = 400 - 38 - 67.5 = 294.5
    expect(result.placeBelow).toBe(false);
    expect(result.top).toBe(294.5);
  });

  it("places option bar below the object when top clearance is tight", () => {
    const result = getObjectContextBarTop({
      topPointY: 20,
      bottomPointY: 150,
      barHeight: 38,
      scale: 1,
    });
    // 20 - 38 - (25 + 30) = -73 < 4 => placeBelow = true
    // bottomPoint.y + 55 = 150 + 55 = 205
    expect(result.placeBelow).toBe(true);
    expect(result.top).toBe(205);
  });
});
