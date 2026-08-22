import { describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { getInteractiveElements } from "@/lib/engine/layers";
import {
  applySelection,
  isSelectionModifierPressed,
  shouldPreserveMultiSelectionForDrag,
} from "@/lib/engine/selection";
import type { EngineSlide } from "@/lib/engine/types";

describe("selection helpers", () => {
  it("treats Shift, Command, and Ctrl as selection modifiers", () => {
    expect(isSelectionModifierPressed({ shiftKey: true, metaKey: false, ctrlKey: false })).toBe(
      true,
    );
    expect(isSelectionModifierPressed({ shiftKey: false, metaKey: true, ctrlKey: false })).toBe(
      true,
    );
    expect(isSelectionModifierPressed({ shiftKey: false, metaKey: false, ctrlKey: true })).toBe(
      true,
    );
    expect(isSelectionModifierPressed({ shiftKey: false, metaKey: false, ctrlKey: false })).toBe(
      false,
    );
  });

  it("adds and removes one or more ids without double-toggling the current selection", () => {
    const current = new Set(["a"]);
    expect(applySelection(current, ["b"], true)).toEqual(new Set(["a", "b"]));
    expect(applySelection(new Set(["a", "b"]), ["a"], true)).toEqual(new Set(["b"]));
    expect(applySelection(new Set(["a", "b"]), ["a", "b"], true)).toEqual(new Set());
    expect(applySelection(current, ["b"], false)).toEqual(new Set(["b"]));
  });

  it("keeps a multi-selection while dragging one of its selected objects", () => {
    expect(shouldPreserveMultiSelectionForDrag(new Set(["a", "b"]), "a", false)).toBe(true);
    expect(shouldPreserveMultiSelectionForDrag(new Set(["a"]), "a", false)).toBe(false);
    expect(shouldPreserveMultiSelectionForDrag(new Set(["a", "b"]), "a", true)).toBe(false);
    expect(shouldPreserveMultiSelectionForDrag(new Set(["a", "b"]), "c", false)).toBe(false);
  });
});

describe("interactive elements", () => {
  it("does not render or offer hidden elements for selection", () => {
    const visible = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const hidden = { ...createRect({ x: 120, y: 0, width: 100, height: 100 }), hidden: true };
    const slide: EngineSlide = {
      id: "slide-1",
      name: "Slide 1",
      background: "#fff",
      width: 1920,
      height: 1080,
      elements: [visible, hidden],
      layers: [
        {
          id: "layer-1",
          name: "Free layer 1",
          mode: "free",
          objectIds: [visible.id, hidden.id],
          placements: {},
          visible: true,
          locked: false,
          z: 1,
        },
      ],
    };

    expect(getInteractiveElements(slide).map((element) => element.id)).toEqual([visible.id]);
  });
});
