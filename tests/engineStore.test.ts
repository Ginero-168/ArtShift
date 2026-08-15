import { beforeEach, describe, expect, it } from "vitest";
import { createBookMockup, createImage, createRect, createText } from "@/lib/engine/factory";
import { getHexGridDimensions } from "@/lib/engine/hexLayout";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";

describe("engine store", () => {
  beforeEach(() => {
    const st = useEngine.getState();
    st.loadDoc({
      id: "doc1",
      title: "test",
      schemaVersion: ENGINE_SCHEMA_VERSION,
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
          layers: [
            {
              id: "layer1",
              name: "Block layer 1",
              mode: "block",
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

  it("records a pointer interaction as one undo step", () => {
    const st = useEngine.getState();
    st.setLayerMode(st.activeLayerId, "free");
    const element = createRect({ x: 10, y: 20, width: 100, height: 80 });
    st.addElement(element);
    st.checkpointInteraction("move");
    st.previewElements([{ id: element.id, patch: { x: 80 } }]);
    st.previewElements([{ id: element.id, patch: { x: 140 } }]);

    useEngine.getState().undo();
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find((item) => item.id === element.id)?.x,
    ).toBe(10);

    useEngine.getState().redo();
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find((item) => item.id === element.id)?.x,
    ).toBe(140);
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

  it("switches a whole Layer between Block and Free without replacing its Object", () => {
    const st = useEngine.getState();
    const text = createText({ x: 120, y: 90, width: 420, height: 160, text: "Layer" });
    st.addElement(text);
    const layerId = useEngine.getState().activeLayerId;

    st.setLayerMode(layerId, "free");
    const freeSlide = useEngine.getState().currentSlide();
    expect(freeSlide?.elements[0].id).toBe(text.id);
    expect(freeSlide?.layers[0].mode).toBe("free");
    expect(freeSlide?.layers[0].placements).toEqual({});

    useEngine.getState().setLayerMode(layerId, "block");
    const blockSlide = useEngine.getState().currentSlide();
    expect(blockSlide?.elements[0].id).toBe(text.id);
    expect(blockSlide?.layers[0].mode).toBe("block");
    expect(blockSlide?.layers[0].placements[text.id]).toBeDefined();
  });

  it("hides a layer without deleting it and removes it from selection", () => {
    const st = useEngine.getState();
    const layer = createRect({ x: 10, y: 10, width: 100, height: 100 });
    st.addElement(layer);

    const layerId = useEngine.getState().activeLayerId;
    st.setLayerVisibility(layerId, false);
    const after = useEngine.getState();
    const hidden = after.currentSlide()?.elements.find((element) => element.id === layer.id);
    expect(after.currentSlide()?.layers[0].visible).toBe(false);
    expect(hidden?.isDeleted).toBe(false);
    expect(after.selectedIds.has(layer.id)).toBe(false);
  });

  it("stores multiple Objects in one active Layer", () => {
    const st = useEngine.getState();
    const title = createText({ x: 100, y: 100, text: "Title" });
    const price = createText({ x: 500, y: 100, text: "฿395" });
    st.addElement(title);
    st.addElement(price);

    expect(useEngine.getState().currentSlide()?.layers[0].objectIds).toEqual([title.id, price.id]);
  });

  it("stores Workspace Strictness as a shared layout rule", () => {
    useEngine.getState().setWorkspaceStrictness(3);
    expect(useEngine.getState().doc.workspaceStrictness).toBe(3);
  });

  it("keeps one mockup identity and camera when artwork dimensions change", () => {
    const st = useEngine.getState();
    const mockup = createBookMockup({
      x: 100,
      y: 100,
      width: 500,
      height: 700,
      fileId: "cover",
      naturalWidth: 1200,
      naturalHeight: 1800,
      yaw: 32,
      pitch: -11,
    });
    st.addElement(mockup);
    st.setSlideDimensions("s1", 1080, 1350);

    const resized = useEngine.getState().currentSlide()?.elements[0];
    expect(resized?.id).toBe(mockup.id);
    expect(resized?.type).toBe("bookMockup");
    if (resized?.type === "bookMockup") {
      expect(resized.yaw).toBe(32);
      expect(resized.pitch).toBe(-11);
      expect(resized.fileId).toBe("cover");
    }
  });

  it("keeps Free-layer images proportional when the Artwork ratio changes", () => {
    const st = useEngine.getState();
    st.setLayerMode(st.activeLayerId, "free");
    const image = createImage({
      x: 240,
      y: 180,
      width: 640,
      height: 400,
      fileId: "photo",
      naturalWidth: 1600,
      naturalHeight: 1000,
    });
    st.addElement(image);

    st.setSlideDimensions("s1", 1080, 1350);

    const resized = useEngine.getState().currentSlide()?.elements[0];
    expect(resized).toBeDefined();
    if (!resized) return;
    expect(resized.width / resized.height).toBeCloseTo(1.6, 5);
  });

  it("refits a media bounding box when its source ratio changes", () => {
    const st = useEngine.getState();
    st.setLayerMode(st.activeLayerId, "free");
    const image = createImage({
      x: 200,
      y: 100,
      width: 600,
      height: 400,
      fileId: "photo",
      naturalWidth: 1200,
      naturalHeight: 800,
    });
    st.addElement(image);

    st.updateElements([
      {
        id: image.id,
        patch: { naturalWidth: 800, naturalHeight: 1200, fileId: "portrait" },
      },
    ]);

    const replaced = useEngine.getState().currentSlide()?.elements[0];
    expect(replaced).toBeDefined();
    if (!replaced) return;
    expect(replaced.width / replaced.height).toBeCloseTo(2 / 3, 5);
    expect(replaced.x + replaced.width / 2).toBeCloseTo(500, 5);
    expect(replaced.y + replaced.height / 2).toBeCloseTo(300, 5);
  });

  it("remaps Block placement and geometry when the Artwork ratio changes", () => {
    const st = useEngine.getState();
    const block = createRect({ x: 480, y: 270, width: 960, height: 540 });
    st.addElement(block);
    st.updateBlockPlacement(block.id, { col: 6, row: 3, colSpan: 12, rowSpan: 6 });

    st.setSlideDimensions("s1", 1080, 1350);

    const resized = useEngine.getState().currentSlide()!;
    const placement = resized.layers[0].placements[block.id];
    const grid = getHexGridDimensions(resized.width, resized.height);
    const element = resized.elements.find((candidate) => candidate.id === block.id)!;
    expect(grid).toEqual({ columns: 16, rows: 18 });
    expect(placement).toMatchObject({ col: 4, row: 5, colSpan: 8, rowSpan: 9 });
    expect(element.x).toBeGreaterThanOrEqual(0);
    expect(element.y).toBeGreaterThanOrEqual(0);
    expect(element.x + element.width).toBeLessThanOrEqual(resized.width);
    expect(element.y + element.height).toBeLessThanOrEqual(resized.height);
  });
});
