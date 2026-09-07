import { describe, expect, it } from "vitest";
import { inspectCanvas } from "@/lib/ai/orchestration/canvasInspector";
import { createRect, createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";

describe("local Canvas Inspector", () => {
  it("summarizes objects, layers, selection and dimensions without a provider", () => {
    const layer = createEngineLayer("free", { name: "Main" });
    const title = {
      ...createText({ x: 10, y: 20, width: 300, height: 60, text: "Summer" }),
      id: "title",
    };
    const shape = { ...createRect({ x: 20, y: 100, width: 200, height: 120 }), id: "shape" };
    const result = inspectCanvas({
      slide: {
        id: "slide-1",
        name: "Hero",
        width: 1920,
        height: 1080,
        background: "#fff",
        layers: [{ ...layer, objectIds: [title.id, shape.id] }],
        elements: [title, shape],
      },
      selectedIds: new Set([title.id]),
    });
    expect(result.reply).toContain("2 Object");
    expect(result.reply).toContain("Text 1");
    expect(result.reply).toContain("Rectangle 1");
    expect(result.reply).toContain("Summer");
    expect(result.reply).toContain("1920 × 1080");
    expect(result.providerCallRequired).toBe(false);
  });

  it("counts visibility and lock state inherited from the containing layer", () => {
    const layer = {
      ...createEngineLayer("free", { name: "Hidden locked" }),
      visible: false,
      locked: true,
    };
    const shape = { ...createRect({ x: 0, y: 0, width: 20, height: 20 }), id: "shape" };
    const result = inspectCanvas({
      slide: {
        id: "s",
        name: "S",
        width: 100,
        height: 100,
        background: "#fff",
        layers: [{ ...layer, objectIds: [shape.id] }],
        elements: [shape],
      },
      selectedIds: new Set(),
    });

    expect(result.hiddenCount).toBe(1);
    expect(result.lockedCount).toBe(1);
    expect(result.reply).toContain("ซ่อนอยู่ 1");
    expect(result.reply).toContain("ล็อกอยู่ 1");
  });

  it("does not count deleted objects", () => {
    const rect = { ...createRect({ x: 0, y: 0, width: 10, height: 10 }), isDeleted: true };
    const result = inspectCanvas({
      slide: {
        id: "s",
        name: "S",
        width: 100,
        height: 100,
        background: "#fff",
        layers: [],
        elements: [rect],
      },
      selectedIds: new Set([rect.id]),
    });
    expect(result.objectCount).toBe(0);
    expect(result.reply).toContain("ยังไม่มี Object");
  });
});
