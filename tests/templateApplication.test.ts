import { describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { applyTemplateToSlide } from "@/lib/engine/templateApplication";
import type { EngineSlide } from "@/lib/engine/types";
import type { TemplateResult } from "@/lib/templates";

function slideWithObject(): EngineSlide {
  const original = createRect({ x: 20, y: 30, width: 100, height: 80 });
  const layer = createEngineLayer("block", { name: "Original" });
  layer.objectIds = [original.id];
  layer.placements[original.id] = { col: 1, row: 1, colSpan: 2, rowSpan: 2 };
  return {
    id: "slide",
    name: "Slide",
    background: "#ffffff",
    elements: [original],
    layers: [layer],
    width: 1920,
    height: 1080,
  };
}

function template(): TemplateResult {
  return {
    background: "#f4efe6",
    objects: [createRect({ x: 321, y: 123, width: 456, height: 234 })],
  };
}

describe("template application", () => {
  it("replaces an artwork atomically on an absolute-positioned Free layer", () => {
    const outcome = applyTemplateToSlide(slideWithObject(), template(), "replace");

    expect(outcome.slide.background).toBe("#f4efe6");
    expect(outcome.slide.layers).toHaveLength(1);
    expect(outcome.slide.layers[0]).toMatchObject({ mode: "free", objectIds: outcome.objectIds });
    expect(outcome.slide.elements).toHaveLength(1);
    expect(outcome.slide.elements[0]).toMatchObject({ x: 321, y: 123, width: 456, height: 234 });
  });

  it("appends a template without changing existing objects or background", () => {
    const original = slideWithObject();
    const outcome = applyTemplateToSlide(original, template(), "append");

    expect(outcome.slide.background).toBe("#ffffff");
    expect(outcome.slide.layers).toHaveLength(2);
    expect(outcome.slide.elements[0]).toEqual(original.elements[0]);
    expect(outcome.slide.layers[1].mode).toBe("free");
  });
});
