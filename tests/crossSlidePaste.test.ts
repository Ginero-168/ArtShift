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
            name: "Free",
            mode: "free" as const,
            objectIds: [],
            placements: {},
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
            name: "Free",
            mode: "free" as const,
            objectIds: [],
            placements: {},
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

  it("copies from one slide and pastes onto another", () => {
    const st = useEngine.getState();
    st.setCurrentSlide("s1");
    const rect = createRect({ x: 40, y: 40, width: 120, height: 80 });
    st.addElement(rect);
    st.copyElements([rect.id]);

    st.setCurrentSlide("s2");
    expect(useEngine.getState().clipboard?.length).toBe(1);
    handleCanvasHotkey(
      new KeyboardEvent("keydown", { key: "v", code: "KeyV", metaKey: true, cancelable: true }),
    );

    const s2 = useEngine.getState().doc.slides.find((slide) => slide.id === "s2");
    const live = s2?.elements.filter((el) => !el.isDeleted) ?? [];
    expect(live).toHaveLength(1);
    expect(live[0]?.type).toBe("rect");
    expect(
      useEngine.getState().doc.slides.find((slide) => slide.id === "s1")?.elements,
    ).toHaveLength(1);
  });

  it("cuts from one slide and pastes onto another", () => {
    const st = useEngine.getState();
    st.setCurrentSlide("s1");
    const text = createText({ x: 40, y: 40, text: "move me" });
    st.addElement(text);
    st.cutElements([text.id]);

    const s1 = useEngine.getState().doc.slides.find((slide) => slide.id === "s1");
    expect(s1?.elements.find((el) => el.id === text.id)?.isDeleted).toBe(true);

    st.setCurrentSlide("s2");
    st.pasteElements();
    const s2 = useEngine.getState().doc.slides.find((slide) => slide.id === "s2");
    const live = s2?.elements.filter((el) => !el.isDeleted) ?? [];
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
