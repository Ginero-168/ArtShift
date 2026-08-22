import { describe, expect, it } from "vitest";
import { RASTER_TOOL_HOTKEYS } from "@/components/Canvas/toolMetadata";

describe("Raster tool metadata", () => {
  it("has one unambiguous shortcut per tool/modifier combination", () => {
    const keys = RASTER_TOOL_HOTKEYS.map(
      (shortcut) => `${shortcut.key}:${shortcut.shiftKey ? "shift" : "plain"}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(RASTER_TOOL_HOTKEYS.map((shortcut) => shortcut.id)).size).toBe(
      RASTER_TOOL_HOTKEYS.length,
    );
  });

  it("keeps Pencil, Ellipse, and Polygon Lasso on shifted variants", () => {
    expect(RASTER_TOOL_HOTKEYS.filter((shortcut) => shortcut.shiftKey).map((s) => s.id)).toEqual([
      "rasterPencil",
      "rasterEllipse",
      "rasterPolygonLasso",
    ]);
  });
});
