import { describe, expect, it } from "vitest";
import {
  appendActiveRasterSelection,
  clearActiveRasterSelection,
  selectionForImage,
  setActiveRasterSelection,
} from "@/lib/raster/activeSelection";
import { createRasterSelectionOperation } from "@/lib/raster/selection";

describe("active raster Selection", () => {
  it("replaces the active image when a new Selection starts", () => {
    const first = appendActiveRasterSelection(
      null,
      "image-a",
      createRasterSelectionOperation("replace", {
        kind: "rect",
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      }),
      100,
      100,
    );
    const second = appendActiveRasterSelection(
      first,
      "image-b",
      createRasterSelectionOperation("replace", {
        kind: "ellipse",
        x: 0.2,
        y: 0.2,
        width: 0.3,
        height: 0.3,
      }),
      200,
      100,
    );

    expect(second?.imageId).toBe("image-b");
    expect(selectionForImage(second, "image-a")).toBeUndefined();
    expect(selectionForImage(second, "image-b")?.operations).toHaveLength(1);
  });

  it("does not add or subtract against a different image", () => {
    const active = setActiveRasterSelection("image-a", {
      width: 100,
      height: 100,
      operations: [],
    });
    const next = appendActiveRasterSelection(
      active,
      "image-b",
      createRasterSelectionOperation("add", {
        kind: "rect",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }),
      100,
      100,
    );

    expect(next).toBe(active);
  });

  it("clears only the matching image Selection", () => {
    const active = setActiveRasterSelection("image-a", {
      width: 100,
      height: 100,
      operations: [],
    });

    expect(clearActiveRasterSelection(active, "image-b")).toBe(active);
    expect(clearActiveRasterSelection(active, "image-a")).toBeNull();
    expect(clearActiveRasterSelection(active)).toBeNull();
  });
});
