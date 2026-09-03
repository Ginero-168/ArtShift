import { beforeEach, describe, expect, it } from "vitest";
import { buildLocalEditPlan } from "@/lib/designAgent/localPlan";
import { createRect, createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import { useEngine } from "@/lib/engine/store";

function setup() {
  const layer = createEngineLayer("free", { name: "Layer" });
  const title = {
    ...createText({ text: "Old", x: 20, y: 20, width: 300, height: 50 }),
    id: "title",
  };
  const rect = { ...createRect({ x: 20, y: 100, width: 100, height: 50 }), id: "rect" };
  layer.objectIds = [title.id, rect.id];
  useEngine.setState({
    doc: {
      id: "doc",
      title: "Test",
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "artwork",
          name: "Artwork",
          width: 1920,
          height: 1080,
          background: "#fff",
          elements: [title, rect],
          layers: [layer],
        },
      ],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: 100,
      schemaVersion: 5,
    },
    currentSlideId: "artwork",
    selectedIds: new Set(["title"]),
    activeLayerId: layer.id,
  });
}

describe("local design edit plan", () => {
  beforeEach(setup);

  it("creates a targeted exact text replacement plan", () => {
    const plan = buildLocalEditPlan("เปลี่ยนข้อความนี้เป็น Summer Sale");
    expect(plan?.commands).toHaveLength(1);
    expect(plan?.commands[0]).toMatchObject({
      kind: "update",
      target: {
        docId: "doc",
        artworkId: "artwork",
        objectId: "title",
        elementVersion: 1,
        baseRevision: 100,
      },
      patch: { text: "Summer Sale" },
    });
  });

  it("creates a text color plan for a selected text object", () => {
    const plan = buildLocalEditPlan("เปลี่ยนสีเป็น #ff0000");
    const command = plan?.commands[0];
    expect(command?.kind).toBe("update");
    if (command?.kind !== "update") return;
    expect(command.patch).toEqual({ strokeColor: "#ff0000" });
  });

  it("creates a local position plan for a selected object", () => {
    const plan = buildLocalEditPlan("ขยับไปทางขวา 40px");
    expect(plan?.commands[0]).toMatchObject({
      kind: "update",
      patch: { x: 60, y: 20 },
    });
  });

  it("creates a local resize plan for a selected object", () => {
    const plan = buildLocalEditPlan("ปรับขนาดเป็น 640 x 120");
    expect(plan?.commands[0]).toMatchObject({
      kind: "update",
      patch: { width: 640, height: 120 },
    });
  });

  it("does not create a plan for an ambiguous or unselected request", () => {
    expect(buildLocalEditPlan("ออกแบบใหม่")).toBeNull();
    useEngine.setState({ selectedIds: new Set() });
    expect(buildLocalEditPlan("เปลี่ยนข้อความนี้เป็น New")).toBeNull();
  });
});
