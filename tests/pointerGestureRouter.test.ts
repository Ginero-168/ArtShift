import { describe, expect, it } from "vitest";
import { createPointerGestureRouter } from "@/lib/engine/pointerGestureRouter";

describe("pointer gesture router", () => {
  it("keeps viewport pan state out of the React event handler", () => {
    const router = createPointerGestureRouter();
    expect(
      router.pointerDown(
        { button: 0, pointerId: 7, clientX: 10, clientY: 20, isPan: true },
        { tx: 100, ty: 200 },
      ),
    ).toMatchObject({ kind: "panStart", pointerId: 7 });
    expect(router.pointerMove({ clientX: 18, clientY: 25 })).toEqual({
      kind: "panMove",
      tx: 108,
      ty: 205,
    });
    expect(router.pointerUp()).toEqual({ kind: "panEnd", pointerId: 7 });
    expect(router.pointerMove({ clientX: 30, clientY: 30 })).toEqual({ kind: "forward" });
  });

  it("forwards content clicks and ignores non-primary clicks", () => {
    const router = createPointerGestureRouter();
    expect(
      router.pointerDown(
        { button: 0, pointerId: 1, clientX: 0, clientY: 0, isPan: false },
        { tx: 0, ty: 0 },
      ),
    ).toEqual({ kind: "forward" });
    expect(
      router.pointerDown(
        { button: 2, pointerId: 2, clientX: 0, clientY: 0, isPan: false },
        { tx: 0, ty: 0 },
      ),
    ).toEqual({ kind: "ignore" });
  });
});
