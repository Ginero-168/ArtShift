import { describe, expect, it } from "vitest";
import { createFrame, createRect, createText } from "@/lib/engine/factory";
import {
  isObjectLocked,
  isObjectVisible,
  moveElementZ,
  normalizeSlideLayers,
  reflowBlockObjects,
  reorderElementsInSlide,
  setElementLocked,
  setElementVisibility,
  toggleObjectLayoutMode,
} from "@/lib/engine/layers";
import type { EngineSlide } from "@/lib/engine/types";

describe("1 Object = 1 Layer Architecture", () => {
  function createTestSlide(): EngineSlide {
    const el1 = createRect({ x: 100, y: 100, width: 200, height: 150 });
    el1.name = "Background Card";
    el1.layoutMode = "block";

    const el2 = createText({ x: 120, y: 120, text: "Heading Text" });
    el2.name = "Main Heading";
    el2.layoutMode = "block";

    const el3 = createFrame({ x: 400, y: 100, width: 300, height: 300 });
    el3.name = "Profile Photo Frame";
    el3.layoutMode = "free";

    return normalizeSlideLayers({
      id: "slide-1",
      name: "Slide 1",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      elements: [el1, el2, el3],
      layers: [
        {
          id: el1.id,
          name: el1.name,
          mode: "block",
          objectIds: [el1.id],
          placements: {},
          visible: true,
          locked: false,
          z: 1,
        },
        {
          id: el2.id,
          name: el2.name,
          mode: "block",
          objectIds: [el2.id],
          placements: {},
          visible: true,
          locked: false,
          z: 2,
        },
        {
          id: el3.id,
          name: el3.name,
          mode: "free",
          objectIds: [el3.id],
          placements: {},
          visible: true,
          locked: false,
          z: 3,
        },
      ],
    });
  }

  it("normalizes slide elements such that 1 object equals 1 layer", () => {
    const slide = createTestSlide();
    expect(slide.layers).toHaveLength(3);
    expect(slide.layers[0].id).toBe(slide.elements[0].id);
    expect(slide.layers[1].id).toBe(slide.elements[1].id);
    expect(slide.layers[2].id).toBe(slide.elements[2].id);

    expect(slide.layers[0].mode).toBe("block");
    expect(slide.layers[1].mode).toBe("block");
    expect(slide.layers[2].mode).toBe("free");
  });

  it("toggles object layout mode between block and free independently", () => {
    const slide = createTestSlide();
    const targetId = slide.elements[0].id;

    // Toggle from block -> free
    const freeSlide = toggleObjectLayoutMode(slide, targetId, 1);
    const freeEl = freeSlide.elements.find((e) => e.id === targetId);
    const freeLayer = freeSlide.layers.find((l) => l.id === targetId);
    expect(freeEl?.layoutMode).toBe("free");
    expect(freeLayer?.mode).toBe("free");

    // Toggle back from free -> block
    const blockSlide = toggleObjectLayoutMode(freeSlide, targetId, 1);
    const blockEl = blockSlide.elements.find((e) => e.id === targetId);
    const blockLayer = blockSlide.layers.find((l) => l.id === targetId);
    expect(blockEl?.layoutMode).toBe("block");
    expect(blockLayer?.mode).toBe("block");
    expect(blockLayer?.placements[targetId]).toBeDefined();
  });

  it("toggling one object mode does not change the mode of other objects sharing a slide", () => {
    const slide = createTestSlide();
    const id0 = slide.elements[0].id;
    const id1 = slide.elements[1].id;
    const id2 = slide.elements[2].id;

    // Initially: id0 = block, id1 = block, id2 = free
    expect(slide.elements.find((e) => e.id === id0)?.layoutMode).toBe("block");
    expect(slide.elements.find((e) => e.id === id1)?.layoutMode).toBe("block");
    expect(slide.elements.find((e) => e.id === id2)?.layoutMode).toBe("free");

    // Toggle id0 to free
    const toggled = toggleObjectLayoutMode(slide, id0, 1);
    expect(toggled.elements.find((e) => e.id === id0)?.layoutMode).toBe("free");
    expect(toggled.elements.find((e) => e.id === id1)?.layoutMode).toBe("block");
    expect(toggled.elements.find((e) => e.id === id2)?.layoutMode).toBe("free");
  });

  it("reflows all block objects in collective layout while leaving free objects untouched", () => {
    const slide = createTestSlide();
    const freeObj = slide.elements.find((e) => e.layoutMode === "free");
    expect(freeObj).toBeDefined();
    const originalFreePos = {
      x: freeObj!.x,
      y: freeObj!.y,
      width: freeObj!.width,
      height: freeObj!.height,
    };

    const reflowed = reflowBlockObjects(slide, 1);
    const afterFreeObj = reflowed.elements.find((e) => e.id === freeObj!.id);

    expect(afterFreeObj?.x).toBe(originalFreePos.x);
    expect(afterFreeObj?.y).toBe(originalFreePos.y);
    expect(afterFreeObj?.width).toBe(originalFreePos.width);
    expect(afterFreeObj?.height).toBe(originalFreePos.height);
  });

  it("supports individual object visibility toggling", () => {
    const slide = createTestSlide();
    const targetId = slide.elements[1].id;

    expect(isObjectVisible(slide, targetId)).toBe(true);

    const hiddenSlide = setElementVisibility(slide, targetId, false);
    expect(isObjectVisible(hiddenSlide, targetId)).toBe(false);
    expect(hiddenSlide.elements.find((e) => e.id === targetId)?.hidden).toBe(true);

    const visibleSlide = setElementVisibility(hiddenSlide, targetId, true);
    expect(isObjectVisible(visibleSlide, targetId)).toBe(true);
    expect(visibleSlide.elements.find((e) => e.id === targetId)?.hidden).toBe(false);
  });

  it("supports individual object lock toggling", () => {
    const slide = createTestSlide();
    const targetId = slide.elements[0].id;

    expect(isObjectLocked(slide, targetId)).toBe(false);

    const lockedSlide = setElementLocked(slide, targetId, true);
    expect(isObjectLocked(lockedSlide, targetId)).toBe(true);
    expect(lockedSlide.elements.find((e) => e.id === targetId)?.locked).toBe(true);

    const unlockedSlide = setElementLocked(lockedSlide, targetId, false);
    expect(isObjectLocked(unlockedSlide, targetId)).toBe(false);
    expect(unlockedSlide.elements.find((e) => e.id === targetId)?.locked).toBe(false);
  });

  it("reorders z-order of elements forward and backward", () => {
    const slide = createTestSlide();
    const firstId = slide.elements[0].id;
    const secondId = slide.elements[1].id;

    // Move first element forward
    const forwardSlide = moveElementZ(slide, firstId, "forward");
    expect(forwardSlide.elements[0].id).toBe(secondId);
    expect(forwardSlide.elements[1].id).toBe(firstId);

    // Move it back
    const backwardSlide = moveElementZ(forwardSlide, firstId, "backward");
    expect(backwardSlide.elements[0].id).toBe(firstId);
    expect(backwardSlide.elements[1].id).toBe(secondId);
  });

  it("preserves each element's layoutMode independently when reordering layers", () => {
    const slide = createTestSlide();
    expect(slide.elements[0].layoutMode).toBe("block");
    expect(slide.elements[1].layoutMode).toBe("block");
    expect(slide.elements[2].layoutMode).toBe("free");

    // Move the free element forward
    const freeId = slide.elements[2].id;
    const moved = moveElementZ(slide, freeId, "backward");

    // All elements must strictly keep their individual layoutMode
    expect(moved.elements.find((e) => e.id === slide.elements[0].id)?.layoutMode).toBe("block");
    expect(moved.elements.find((e) => e.id === slide.elements[1].id)?.layoutMode).toBe("block");
    expect(moved.elements.find((e) => e.id === freeId)?.layoutMode).toBe("free");
  });

  it("reorders elements to arbitrary target positions via drag and drop", () => {
    const slide = createTestSlide();
    const id0 = slide.elements[0].id;
    const id1 = slide.elements[1].id;
    const id2 = slide.elements[2].id;

    // Drag element id2 to the top position (id0's position in UI list)
    const reordered = reorderElementsInSlide(slide, id2, id0);
    const z0 = reordered.elements.find((e) => e.id === id0)?.z ?? 0;
    const z1 = reordered.elements.find((e) => e.id === id1)?.z ?? 0;
    const z2 = reordered.elements.find((e) => e.id === id2)?.z ?? 0;

    expect(z2).toBeGreaterThan(z0);
    expect(z0).toBeGreaterThan(z1);
  });
});
