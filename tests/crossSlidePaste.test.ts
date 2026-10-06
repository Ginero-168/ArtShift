import { beforeEach, describe, expect, it } from "vitest";
import { handleCanvasHotkey } from "@/components/Canvas/useCanvasHotkeys";
import { createRect, createText } from "@/lib/engine/factory";
import { clampElementsToSlide, useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";

function twoSlideDoc() {
  return {
    id: "cross-slide-doc",
    title: "Cross slide",
    schemaVersion: ENGINE_SCHEMA_VERSION,
    width: 1920,
    height: 1080,
    slides: [
      {
        id: "s1",
        name: "S1",
        background: "#fff",
        width: 1920,
        height: 1080,
        elements: [],
        layers: [
          {
            id: "l1",
            name: "Layer 1",
            objectIds: [],
            visible: true,
            locked: false,
            z: 1,
          },
        ],
      },
      {
        id: "s2",
        name: "S2",
        background: "#fff",
        width: 800,
        height: 600,
        elements: [],
        layers: [
          {
            id: "l2",
            name: "Layer 1",
            objectIds: [],
            visible: true,
            locked: false,
            z: 1,
          },
        ],
      },
    ],
    snapGrid: null,
    workspaceStrictness: 1,
    updatedAt: Date.now(),
  };
}

describe("cross-slide clipboard", () => {
  beforeEach(() => {
    useEngine.getState().loadDoc(twoSlideDoc());
  });

  it("copies an object and pastes it on the same canvas", () => {
    const st = useEngine.getState();
    const rect = createRect({ x: 40, y: 40, width: 120, height: 80 });
    st.addElement(rect);
    st.copyElements([rect.id]);

    expect(useEngine.getState().clipboard?.length).toBe(1);
    handleCanvasHotkey(
      new KeyboardEvent("keydown", { key: "v", code: "KeyV", metaKey: true, cancelable: true }),
    );

    const live =
      useEngine
        .getState()
        .doc.slides[0]?.elements.filter((el) => !el.isDeleted && el.type === "rect") ?? [];
    expect(live).toHaveLength(2);
    expect(useEngine.getState().doc.slides).toHaveLength(1);
  });

  it("cuts an object and pastes it back on the same canvas", () => {
    const st = useEngine.getState();
    const text = createText({ x: 40, y: 40, text: "move me" });
    st.addElement(text);
    st.cutElements([text.id]);

    const board = useEngine.getState().doc.slides[0];
    expect(board?.elements.find((el) => el.id === text.id)?.isDeleted).toBe(true);

    st.pasteElements();
    const live = useEngine.getState().doc.slides[0]?.elements.filter((el) => !el.isDeleted) ?? [];
    expect(live).toHaveLength(1);
    expect(live[0]?.type).toBe("text");
  });

  it("clamps oversized source geometry into a smaller destination slide", () => {
    const clamped = clampElementsToSlide(
      [createRect({ x: 1700, y: 900, width: 400, height: 300 })],
      800,
      600,
    );
    expect(clamped[0].x + clamped[0].width).toBeLessThanOrEqual(800);
    expect(clamped[0].y + clamped[0].height).toBeLessThanOrEqual(600);
    expect(clamped[0].x).toBeGreaterThanOrEqual(0);
    expect(clamped[0].y).toBeGreaterThanOrEqual(0);
  });
});
