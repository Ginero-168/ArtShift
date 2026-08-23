import { describe, expect, it } from "vitest";
import {
  isMeaningfulMove,
  resolveMarqueeSelection,
  resolveObjectPointerSelection,
} from "@/lib/engine/gestureController";

describe("gesture controller", () => {
  it("preserves a multi-selection when dragging one selected object", () => {
    const result = resolveObjectPointerSelection(new Set(["a", "b"]), "a", ["a"], {
      shiftKey: false,
      metaKey: false,
      ctrlKey: false,
    });

    expect(result.ids).toEqual(["a", "b"]);
    expect(result.clickSelection).toEqual(["a"]);
  });

  it("toggles object selection with Shift/Command/Ctrl", () => {
    expect(
      resolveObjectPointerSelection(new Set(["a"]), "b", ["b"], {
        shiftKey: true,
        metaKey: false,
        ctrlKey: false,
      }).ids,
    ).toEqual(["a", "b"]);
  });

  it("merges marquee ids only when additive", () => {
    expect(resolveMarqueeSelection(new Set(["a"]), ["b"], true)).toEqual(["a", "b"]);
    expect(resolveMarqueeSelection(new Set(["a"]), ["b"], false)).toEqual(["b"]);
  });

  it("uses a small pointer threshold for click versus drag", () => {
    expect(isMeaningfulMove({ x: 0, y: 0 }, { x: 2, y: 0 }, 3)).toBe(false);
    expect(isMeaningfulMove({ x: 0, y: 0 }, { x: 3, y: 4 }, 3)).toBe(true);
  });
});
