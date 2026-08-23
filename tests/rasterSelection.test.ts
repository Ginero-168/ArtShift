import { describe, expect, it } from "vitest";
import { RASTER_TOOL_HOTKEYS } from "@/components/Canvas/rasterHotkeys";
import {
  appendRasterPolygonPoint,
  appendRasterSelection,
  canCommitRasterPolygon,
  createRasterSelection,
  createRasterSelectionOperation,
  normalizeImagePoint,
  selectionModeFromModifiers,
  shapeOutline,
} from "@/lib/raster/selection";

describe("raster selection model", () => {
  it("stores geometry in normalized image-local coordinates", () => {
    expect(normalizeImagePoint([50, 25], 100, 100)).toEqual([0.5, 0.25]);

    const operation = createRasterSelectionOperation("replace", {
      kind: "rect",
      x: 0.1,
      y: 0.2,
      width: 0.4,
      height: 0.3,
    });
    const selection = appendRasterSelection(undefined, operation, 100, 100);

    expect(selection.operations).toHaveLength(1);
    expect(shapeOutline(selection.operations[0].shape)).toHaveLength(4);
  });

  it("replaces the previous selection and appends additive operations", () => {
    const first = createRasterSelectionOperation("replace", {
      kind: "ellipse",
      x: 0,
      y: 0,
      width: 0.5,
      height: 0.5,
    });
    const added = createRasterSelectionOperation("add", {
      kind: "lasso",
      points: [
        [0.5, 0.5],
        [0.8, 0.5],
        [0.7, 0.8],
      ],
    });

    const selection = appendRasterSelection(
      appendRasterSelection(createRasterSelection(100, 100), first, 100, 100),
      added,
      100,
      100,
    );

    expect(selection.operations.map((operation) => operation.mode)).toEqual(["replace", "add"]);

    const replacement = createRasterSelectionOperation("replace", {
      kind: "rect",
      x: 0.2,
      y: 0.2,
      width: 0.1,
      height: 0.1,
    });
    const replaced = appendRasterSelection(selection, replacement, 100, 100);
    expect(replaced.operations).toHaveLength(1);
    expect(replaced.operations[0].mode).toBe("replace");
  });

  it("uses Photoshop-style modifier keys for selection operations", () => {
    expect(selectionModeFromModifiers({ shiftKey: false, altKey: false })).toBe("replace");
    expect(selectionModeFromModifiers({ shiftKey: true, altKey: false })).toBe("add");
    expect(selectionModeFromModifiers({ shiftKey: false, altKey: true })).toBe("subtract");
    expect(selectionModeFromModifiers({ shiftKey: true, altKey: true })).toBe("intersect");
    expect(selectionModeFromModifiers({ shiftKey: false, altKey: false, ctrlKey: true })).toBe(
      "replace",
    );
  });

  it("keeps polygon lasso points across clicks until it has three points", () => {
    const first = appendRasterPolygonPoint([], [10, 10]);
    const second = appendRasterPolygonPoint(first, [80, 10]);
    const third = appendRasterPolygonPoint(second, [45, 80]);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(third).toHaveLength(3);
    expect(canCommitRasterPolygon(second)).toBe(false);
    expect(canCommitRasterPolygon(third)).toBe(true);
  });

  it("exposes only the current Raster tool shortcuts", () => {
    expect(RASTER_TOOL_HOTKEYS).toEqual([
      { id: "rasterMove", key: "v" },
      { id: "rasterBrush", key: "b" },
      { id: "rasterPencil", key: "b", shiftKey: true },
      { id: "rasterMarquee", key: "m" },
      { id: "rasterEllipse", key: "m", shiftKey: true },
      { id: "rasterLasso", key: "l" },
      { id: "rasterPolygonLasso", key: "l", shiftKey: true },
      { id: "rasterMagicWand", key: "w" },
      { id: "rasterEraser", key: "e" },
      { id: "rasterHealing", key: "j" },
      { id: "rasterClone", key: "s" },
    ]);
  });
});
