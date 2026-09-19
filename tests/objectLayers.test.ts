import { describe, expect, it } from "vitest";
import { createFrame, createRect, createText } from "@/lib/engine/factory";
import {
  flattenBlockLayoutToFree,
  isObjectLocked,
  isObjectVisible,
  moveElementZ,
  normalizeSlideLayers,
  reorderElementsInSlide,
  setElementLocked,
  setElementVisibility,
} from "@/lib/engine/layers";
import type { EngineSlide } from "@/lib/engine/types";

describe("1 Object = 1 Layer Architecture", () => {
  function createTestSlide(): EngineSlide {
    const el1 = createRect({ x: 100, y: 100, width: 200, height: 150 });
    el1.name = "Background Card";

    const el2 = createText({ x: 120, y: 120, text: "Heading Text" });
    el2.name = "Main Heading";

    const el3 = createFrame({ x: 400, y: 100, width: 300, height: 300 });
    el3.name = "Profile Photo Frame";

    return flattenBlockLayoutToFree(
      normalizeSlideLayers({
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
            objectIds: [el1.id],
            visible: true,
            locked: false,
            z: 1,
          },
          {
            id: el2.id,
            name: el2.name,
            objectIds: [el2.id],
            visible: true,
            locked: false,
            z: 2,
          },
          {
            id: el3.id,
            name: el3.name,
            objectIds: [el3.id],
            visible: true,
            locked: false,
            z: 3,
          },
        ],
      }),
    );
  }

  it("normalizes slide elements such that 1 object equals 1 layer", () => {
    const slide = createTestSlide();
    expect(slide.layers).toHaveLength(3);
    expect(slide.layers[0].id).toBe(slide.elements[0].id);
    expect(slide.layers[1].id).toBe(slide.elements[1].id);
    expect(slide.layers[2].id).toBe(slide.elements[2].id);
    for (const layer of slide.layers) {
      expect("mode" in layer).toBe(false);
      expect("placements" in layer).toBe(false);
    }
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

    const forwardSlide = moveElementZ(slide, firstId, "forward");
    expect(forwardSlide.elements[0].id).toBe(secondId);
    expect(forwardSlide.elements[1].id).toBe(firstId);

    const backwardSlide = moveElementZ(forwardSlide, firstId, "backward");
    expect(backwardSlide.elements[0].id).toBe(firstId);
    expect(backwardSlide.elements[1].id).toBe(secondId);
  });

  it("preserves object identity when reordering layers", () => {
    const slide = createTestSlide();
    const freeId = slide.elements[2].id;
    const moved = moveElementZ(slide, freeId, "backward");

    expect(moved.elements.find((e) => e.id === slide.elements[0].id)?.id).toBe(
      slide.elements[0].id,
    );
    expect(moved.elements.find((e) => e.id === slide.elements[1].id)?.id).toBe(
      slide.elements[1].id,
    );
    expect(moved.elements.find((e) => e.id === freeId)?.id).toBe(freeId);
  });

  it("reorders elements to arbitrary target positions via drag and drop", () => {
    const slide = createTestSlide();
    const id0 = slide.elements[0].id;
    const id1 = slide.elements[1].id;
    const id2 = slide.elements[2].id;

    const reordered = reorderElementsInSlide(slide, id2, id0);
    const z0 = reordered.elements.find((e) => e.id === id0)?.z ?? 0;
    const z1 = reordered.elements.find((e) => e.id === id1)?.z ?? 0;
    const z2 = reordered.elements.find((e) => e.id === id2)?.z ?? 0;

    expect(z2).toBeGreaterThan(z0);
    expect(z0).toBeGreaterThan(z1);
  });
});
