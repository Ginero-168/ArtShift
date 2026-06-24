import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "@/lib/store";
import type { SlideObject } from "@/lib/types";

function reset() {
  useStore.getState().resetDoc();
  useStore.setState({ history: [], future: [] });
}

describe("store undo/redo", () => {
  beforeEach(() => reset());

  it("undo rewinds the most recent update", () => {
    const id = useStore.getState().addText({ text: "a" });
    useStore.getState().updateObject(id, { text: "b" });
    expect(useStore.getState().currentSlide().objects[0]).toMatchObject({ text: "b" });
    useStore.getState().undo();
    expect(useStore.getState().currentSlide().objects[0]).toMatchObject({ text: "a" });
    useStore.getState().redo();
    expect(useStore.getState().currentSlide().objects[0]).toMatchObject({ text: "b" });
  });

  it("coalesces rapid same-field edits into one undo step", () => {
    const id = useStore.getState().addText({ text: "a" });
    const before = useStore.getState().history.length;
    useStore.getState().updateObject(id, { text: "b" });
    useStore.getState().updateObject(id, { text: "c" });
    useStore.getState().updateObject(id, { text: "d" });
    const after = useStore.getState().history.length;
    // One snapshot for the first text edit (coalesced with the rest).
    expect(after - before).toBe(1);
  });

  it("batchHistory groups multiple mutations under one undo", async () => {
    const store = useStore.getState();
    store.addText({ text: "seed" });
    const base = useStore.getState().history.length;
    await store.batchHistory("test", async () => {
      store.addText({ text: "one" });
      store.addText({ text: "two" });
      store.addShape("rect");
    });
    const afterBatch = useStore.getState().history.length;
    expect(afterBatch - base).toBe(1);
    expect(useStore.getState().currentSlide().objects).toHaveLength(4);
    useStore.getState().undo();
    // After a single undo, the batch is reverted together.
    expect(useStore.getState().currentSlide().objects).toHaveLength(1);
  });

  it("updateObject rejects attempts to change id or type", () => {
    const id = useStore.getState().addText({ text: "hi" });
    // Simulate an AI tool passing an unsafe patch at runtime (bypass TS).
    const unsafePatch = {
      id: "hijack",
      type: "shape",
      text: "ok",
    } as unknown as Partial<SlideObject>;
    useStore.getState().updateObject(id, unsafePatch);
    const obj = useStore.getState().currentSlide().objects[0];
    expect(obj.id).toBe(id);
    expect(obj.type).toBe("text");
    expect((obj as { text: string }).text).toBe("ok");
  });
});

describe("paste clamp", () => {
  beforeEach(() => reset());

  it("wraps pasted objects that would fall off the right/bottom edge", () => {
    const store = useStore.getState();
    const id = store.addText({ x: 1270, y: 710, width: 200, height: 100, text: "edge" });
    const source = useStore
      .getState()
      .currentSlide()
      .objects.find((o) => o.id === id)!;
    store.pasteObjects([source]);
    const pasted = useStore.getState().currentSlide().objects.at(-1)!;
    expect(pasted.x + pasted.width).toBeLessThanOrEqual(1280);
    expect(pasted.y + pasted.height).toBeLessThanOrEqual(720);
  });
});

describe("pasteSlide", () => {
  beforeEach(() => reset());

  it("inserts the cloned slide directly after the anchor and switches to it", () => {
    const store = useStore.getState();
    store.addSlide(); // now 2 slides
    const { doc } = useStore.getState();
    const anchor = doc.slides[0].id;
    const cloned = {
      ...doc.slides[0],
      id: "will-be-replaced",
      name: "src",
    };
    store.pasteSlide(cloned, anchor);
    const after = useStore.getState();
    expect(after.doc.slides).toHaveLength(3);
    expect(after.doc.slides[1].name).toBe("src copy");
    expect(after.doc.slides[1].id).not.toBe("will-be-replaced");
    expect(after.currentSlideId).toBe(after.doc.slides[1].id);
  });
});
