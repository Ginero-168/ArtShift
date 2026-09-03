import { describe, expect, it } from "vitest";
import { getObjectContextBarLeft, getObjectContextCategory } from "@/lib/engine/objectContext";
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
});
