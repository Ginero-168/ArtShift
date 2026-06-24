import { beforeEach, describe, expect, it } from "vitest";
import { createRect } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";

describe("engine store", () => {
  beforeEach(() => {
    const st = useEngine.getState();
    st.loadDoc({
      id: "doc1",
      title: "test",
      schemaVersion: 1,
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "s1",
          name: "Slide 1",
          background: "#fff",
          width: 1920,
          height: 1080,
          elements: [],
        },
      ],
      snapGrid: null,
      updatedAt: Date.now(),
    });
  });

  it("assigns unique z-order to pasted elements", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    const b = createRect({ x: 40, y: 10, width: 20, height: 20 });
    st.addElement(a);
    st.addElement(b);

    const before = useEngine.getState().currentSlide();
    const ids = before?.elements.map((e) => e.id) ?? [];
    expect(ids.length).toBe(2);

    st.copyElements(ids);
    st.pasteElements();

    const after = useEngine.getState().currentSlide();
    const pasted = after?.elements.filter((e) => !ids.includes(e.id)) ?? [];
    expect(pasted.length).toBe(2);
    expect(pasted[0].z).not.toBe(pasted[1].z);
    expect(pasted[1].z).toBeGreaterThan(pasted[0].z);
  });

  it("selects only the pasted elements after paste", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    st.addElement(a);
    const before = useEngine.getState().currentSlide();
    const id = before?.elements[0].id;
    st.copyElements([id!]);
    st.pasteElements();
    const afterState = useEngine.getState();
    const after = afterState.currentSlide();
    const pasted = after?.elements.find((e) => e.id !== id);
    expect(afterState.selectedIds.has(pasted!.id)).toBe(true);
    expect(afterState.selectedIds.has(id!)).toBe(false);
  });

  it("supports undo and redo", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    st.addElement(a);
    const added = useEngine.getState().currentSlide()?.elements.length ?? 0;
    expect(added).toBe(1);

    st.undo();
    const undone = useEngine.getState().currentSlide()?.elements.length ?? 0;
    expect(undone).toBe(0);

    st.redo();
    const redone = useEngine.getState().currentSlide()?.elements.length ?? 0;
    expect(redone).toBe(1);
  });

  it("deletes elements and clears selection", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    st.addElement(a);
    const id = useEngine.getState().currentSlide()?.elements[0].id;
    expect(useEngine.getState().selectedIds.has(id!)).toBe(true);

    st.deleteElements([id!]);
    const after = useEngine.getState();
    const el = after.currentSlide()?.elements.find((e) => e.id === id);
    expect(el?.isDeleted).toBe(true);
    expect(after.selectedIds.has(id!)).toBe(false);
  });

  it("updates element properties", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    st.addElement(a);
    const id = useEngine.getState().currentSlide()?.elements[0].id;

    st.updateElements([{ id: id!, patch: { x: 100, y: 200 } }]);
    const el = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((e) => e.id === id);
    expect(el?.x).toBe(100);
    expect(el?.y).toBe(200);
  });

  it("reorders z-index", () => {
    const st = useEngine.getState();
    const a = createRect({ x: 10, y: 10, width: 20, height: 20 });
    const b = createRect({ x: 40, y: 10, width: 20, height: 20 });
    st.addElement(a);
    st.addElement(b);
    const ids =
      useEngine
        .getState()
        .currentSlide()
        ?.elements.map((e) => e.id) ?? [];
    const [idA, idB] = ids;
    expect(idA).not.toBe(idB);

    st.bringToFront([idA]);
    const after = useEngine.getState().currentSlide();
    const aAfter = after?.elements.find((e) => e.id === idA);
    const bAfter = after?.elements.find((e) => e.id === idB);
    expect(aAfter!.z).toBeGreaterThan(bAfter!.z);
  });
});
