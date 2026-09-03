import { beforeEach, describe, expect, it } from "vitest";
import { createCompositionBlock } from "@/lib/builder/compositionBlocks";
import { createImage, createRect, createText } from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import {
  inferSemanticMetadata,
  solveSmartArrange,
  validateSmartIntent,
} from "@/lib/engine/smartLayout";
import { useEngine } from "@/lib/engine/store";
import type { EngineSlide } from "@/lib/engine/types";

const slideOf = (elements: EngineSlide["elements"]): EngineSlide => ({
  id: "smart",
  name: "Smart",
  background: "#fff",
  elements,
  layers: [],
  width: 1200,
  height: 800,
});

describe("Smart Layout semantics and solver", () => {
  it("infers semantic roles from builder identity and text", () => {
    const heading = createText({ x: 0, y: 0, text: "A clear headline" });
    heading.builderKind = "heading";
    expect(inferSemanticMetadata(heading).role).toBe("headline");

    const image = createImage({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      fileId: "asset-1",
      naturalWidth: 300,
      naturalHeight: 200,
    });
    image.builderKind = "heroImage";
    expect(inferSemanticMetadata(image).role).toBe("media");
  });

  it("is deterministic, stays in bounds, and protects locked/hidden elements", () => {
    const locked = createRect({ x: 1100, y: 700, width: 80, height: 80 });
    locked.locked = true;
    const hidden = createRect({ x: 1000, y: 700, width: 80, height: 80 });
    hidden.hidden = true;
    const title = createText({ x: 500, y: 30, width: 300, height: 80, text: "Title" });
    const body = createText({ x: 500, y: 500, width: 300, height: 100, text: "Body copy" });
    const slide = slideOf([locked, hidden, title, body]);
    const first = solveSmartArrange(slide);
    expect(first).toEqual(solveSmartArrange(slide));
    expect(first.map((patch) => patch.id)).not.toContain(locked.id);
    expect(first.map((patch) => patch.id)).not.toContain(hidden.id);
    for (const { patch } of first) {
      expect(patch.x! + patch.width!).toBeLessThanOrEqual(slide.width);
      expect(patch.y! + patch.height!).toBeLessThanOrEqual(slide.height);
    }
  });

  it("supports selected scope and distinct goals", () => {
    const first = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const second = createRect({ x: 900, y: 700, width: 100, height: 100 });
    const slide = slideOf([first, second]);
    const selected = solveSmartArrange(slide, {
      scope: "selected",
      selectedIds: [first.id],
      goal: "fill",
    });
    expect(selected.map((patch) => patch.id)).toEqual([first.id]);
    expect(solveSmartArrange(slide, { goal: "fill" })).toHaveLength(2);
    expect(solveSmartArrange(slide, { goal: "fix-overlap" })).toEqual([]);
  });

  it("creates editable slot-backed composition members in one managed group", () => {
    const composition = createCompositionBlock("text-image", { width: 1200, height: 800 });
    expect(composition.elements).toHaveLength(4);
    expect(new Set(composition.elements.flatMap((element) => element.groupIds))).toEqual(
      new Set([composition.groupId]),
    );
    expect(Object.keys(composition.slots)).toEqual(["background", "headline", "body", "media"]);
    expect(
      composition.elements.some(
        (element) => element.builderKind === "composition:text-image:media",
      ),
    ).toBe(true);
    expect(
      composition.elements.find((element) => element.builderKind?.endsWith(":media")),
    ).toMatchObject({
      type: "image",
      fileId: "composition-placeholder",
    });
  });

  it("rejects malformed AI intent and never accepts coordinates", () => {
    expect(validateSmartIntent({ action: "move", x: 10, y: 20 })).toBeNull();
    expect(validateSmartIntent({ action: "smart_arrange", x: 10 })).toBeNull();
    expect(validateSmartIntent({ action: "smart_arrange", gap: "large" })).toBeNull();
    expect(validateSmartIntent({ action: "smart_arrange", goal: "freeform" })).toBeNull();
    expect(
      validateSmartIntent({ action: "smart_arrange", gap: 12, goal: "fill", density: "airy" }),
    ).toEqual({ gap: 12, goal: "fill", density: "airy" });
  });
});

describe("Smart Arrange store lifecycle", () => {
  beforeEach(() => {
    const layer = createEngineLayer("free", { name: "Free" });
    const slide = slideOf([
      createText({ x: 500, y: 20, text: "Title" }),
      createText({ x: 500, y: 500, text: "Body" }),
    ]);
    slide.layers = [layer];
    layer.objectIds = slide.elements.map((element) => element.id);
    useEngine.getState().loadDoc({
      ...useEngine.getState().doc,
      slides: [slide],
      updatedAt: 1,
    });
  });

  it("previews, applies, and can undo the applied layout", () => {
    const before = useEngine
      .getState()
      .currentSlide()!
      .elements.map((element) => [element.id, element.x, element.y]);
    const patches = useEngine.getState().previewSmartArrange();
    expect(patches.length).toBeGreaterThan(0);
    expect(useEngine.getState().smartArrangePreview).toEqual(patches);

    useEngine.getState().applySmartArrange();
    expect(useEngine.getState().smartArrangePreview).toBeNull();
    expect(
      useEngine
        .getState()
        .currentSlide()!
        .elements.map((element) => [element.id, element.x, element.y]),
    ).not.toEqual(before);

    useEngine.getState().undo();
    expect(
      useEngine
        .getState()
        .currentSlide()!
        .elements.map((element) => [element.id, element.x, element.y]),
    ).toEqual(before);
  });

  it("inserts a composition as editable members with one undo boundary", () => {
    const beforeCount = useEngine.getState().currentSlide()!.elements.length;
    const ids = useEngine.getState().insertCompositionBlock("hero");
    expect(ids).toHaveLength(4);
    expect(useEngine.getState().currentSlide()!.elements).toHaveLength(beforeCount + 4);
    expect(
      new Set(
        useEngine
          .getState()
          .currentSlide()!
          .elements.slice(-4)
          .flatMap((element) => element.groupIds),
      ).size,
    ).toBe(1);

    useEngine.getState().undo();
    expect(useEngine.getState().currentSlide()!.elements).toHaveLength(beforeCount);
  });

  it("clears a pending preview when a new document is loaded", () => {
    expect(useEngine.getState().previewSmartArrange()).not.toHaveLength(0);
    useEngine.getState().loadDoc(useEngine.getState().doc);
    expect(useEngine.getState().smartArrangePreview).toBeNull();
  });

  it("clears a pending preview when switching Artwork", () => {
    const current = useEngine.getState().doc.slides[0];
    useEngine.getState().loadDoc({
      ...useEngine.getState().doc,
      slides: [current, { ...current, id: "second-artwork", name: "Second Artwork" }],
    });
    expect(useEngine.getState().previewSmartArrange()).not.toHaveLength(0);
    useEngine.getState().setCurrentSlide("second-artwork");
    expect(useEngine.getState().smartArrangePreview).toBeNull();
  });
});
