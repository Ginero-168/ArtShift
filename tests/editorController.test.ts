import { describe, expect, it, vi } from "vitest";
import { createEditorController } from "@/lib/engine/editorController";
import { createImage } from "@/lib/engine/factory";
import { createRasterStroke } from "@/lib/raster/mask";
import { createRasterSelectionOperation } from "@/lib/raster/selection";

describe("EditorController", () => {
  it("resolves additive object selection without exposing store details", () => {
    const controller = createEditorController({
      currentSlide: () => undefined,
      updateElements: vi.fn(),
      applyRasterSelection: vi.fn(),
    });

    expect(controller.resolveSelection(new Set(["a", "b"]), ["b"], true)).toEqual(["a"]);
  });

  it("commits one raster stroke against the current image", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      fileId: "image-1",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    const updateElements = vi.fn();
    const controller = createEditorController({
      currentSlide: () => ({ elements: [image] }) as never,
      updateElements,
      applyRasterSelection: vi.fn(),
    });
    const stroke = createRasterStroke([[12, 18]], 24, 1, { mode: "erase" });

    expect(controller.commitRasterStroke(image.id, stroke, "erase pixels")).toBe(true);
    expect(updateElements).toHaveBeenCalledWith(
      [{ id: image.id, patch: { rasterMask: [stroke] } }],
      "erase pixels",
    );
  });

  it("derives selection dimensions from the image model", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      fileId: "image-1",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    const applyRasterSelection = vi.fn();
    const controller = createEditorController({
      currentSlide: () => ({ elements: [image] }) as never,
      updateElements: vi.fn(),
      applyRasterSelection,
    });
    const operation = createRasterSelectionOperation("replace", {
      kind: "rect",
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });

    expect(controller.commitRasterSelection(image.id, operation)).toBe(true);
    expect(applyRasterSelection).toHaveBeenCalledWith(image.id, operation, 320, 240);
  });
});
