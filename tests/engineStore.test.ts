import { beforeEach, describe, expect, it } from "vitest";
import {
  createArrow,
  createBookMockup,
  createFrame,
  createImage,
  createRect,
  createText,
} from "@/lib/engine/factory";
import { getHexGridDimensions } from "@/lib/engine/hexLayout";
import { useEngine } from "@/lib/engine/store";
import { measureTextElementHeight } from "@/lib/engine/textLayout";
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

  it("remaps copied bindings, frame children, containers and groups", () => {
    const st = useEngine.getState();
    st.setLayerMode(st.activeLayerId, "free");
    const target = createRect({ x: 40, y: 40, width: 180, height: 120 });
    const arrow = createArrow([300, 100], [220, 100]);
    arrow.endBinding = { elementId: target.id, gap: 0, focus: 0 };
    const frame = createFrame({ x: 400, y: 40, width: 300, height: 220 });
    const label = createText({ x: 430, y: 70, width: 220, height: 80, text: "Bound" });
    label.containerId = frame.id;
    frame.childIds = [label.id];
    const groupId = "source-group";
    target.groupIds = [groupId];
    arrow.groupIds = [groupId];
    for (const element of [target, arrow, frame, label]) st.addElement(element);

    st.copyElements([target.id, arrow.id, frame.id, label.id]);
    st.pasteElements();

    const pasted = useEngine
      .getState()
      .currentSlide()!
      .elements.filter(
        (element) => ![target.id, arrow.id, frame.id, label.id].includes(element.id),
      );
    const pastedTarget = pasted.find((element) => element.type === "rect")!;
    const pastedArrow = pasted.find((element) => element.type === "arrow");
    const pastedFrame = pasted.find((element) => element.type === "frame");
    const pastedLabel = pasted.find((element) => element.type === "text");

    expect(pastedArrow?.endBinding?.elementId).toBe(pastedTarget.id);
    expect(pastedFrame?.childIds).toEqual([pastedLabel?.id]);
    expect(pastedLabel?.containerId).toBe(pastedFrame?.id);
    expect(pastedArrow?.groupIds[0]).toBe(pastedTarget.groupIds[0]);
    expect(pastedArrow?.groupIds[0]).not.toBe(groupId);
  });

  it("grows a Block placement when wrapped Thai text needs more rows", () => {
    const st = useEngine.getState();
    const text = createText({ x: 100, y: 100, width: 240, height: 60, text: "สั้น" });
    st.addElement(text);
    const before = useEngine.getState().currentSlide()!.layers[0].placements[text.id].rowSpan;

    st.updateElements([
      {
        id: text.id,
        patch: {
          text: "หนังสือเล่มนี้จะช่วยให้คุณเข้าใจการออกแบบและสร้างงานประชาสัมพันธ์ได้รวดเร็วยิ่งขึ้นโดยไม่ตัดข้อความ",
        },
      },
    ]);

    const afterSlide = useEngine.getState().currentSlide()!;
    expect(afterSlide.layers[0].placements[text.id].rowSpan).toBeGreaterThan(before);
    expect(afterSlide.elements.find((element) => element.id === text.id)!.height).toBeGreaterThan(
      60,
    );
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

  it("grows Free text when a width change creates more wrapped lines", () => {
    const st = useEngine.getState();
    st.setLayerMode(st.activeLayerId, "free");
    const title = createText({
      x: 100,
      y: 100,
      width: 900,
      height: 120,
      fontSize: 70,
      text: "นี่คือชื่อหนังสือภาษาไทยที่ยาวมากและไม่มีช่องว่างเพื่อทดสอบการตัดบรรทัดอย่างปลอดภัย",
    });
    st.addElement(title);
    const beforeHeight = title.height;

    st.updateElements([{ id: title.id, patch: { width: 260, height: 20 } }], "narrow text");

    const resized = useEngine.getState().currentSlide()?.elements[0];
    expect(resized?.type).toBe("text");
    if (resized?.type !== "text") return;
    expect(resized.height).toBeGreaterThan(beforeHeight);
    expect(resized.height).toBeGreaterThanOrEqual(measureTextElementHeight(resized));
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

  it("creates a resized Artwork variant with stable object and asset identity", () => {
    const st = useEngine.getState();
    const mockup = createBookMockup({
      x: 200,
      y: 100,
      width: 420,
      height: 620,
      fileId: "cover-asset",
      naturalWidth: 1200,
      naturalHeight: 1800,
      yaw: 24,
      pitch: -8,
    });
    st.addElement(mockup);

    const variantId = st.createArtworkVariant("s1", 1080, 1350, "Portrait");
    const state = useEngine.getState();
    const variant = state.doc.slides.find((slide) => slide.id === variantId)!;
    const variantMockup = variant.elements.find((element) => element.id === mockup.id);

    expect(variant).toMatchObject({ width: 1080, height: 1350, variantOf: "s1" });
    expect(variantMockup?.type).toBe("bookMockup");
    if (variantMockup?.type === "bookMockup") {
      expect(variantMockup.fileId).toBe("cover-asset");
      expect(variantMockup.yaw).toBe(24);
      expect(variantMockup.pitch).toBe(-8);
    }
  });

  it("syncs content to sibling variants while preserving their geometry", () => {
    const st = useEngine.getState();
    const title = createText({ x: 100, y: 100, width: 500, height: 120, text: "Original" });
    st.addElement(title);
    const variantId = st.createArtworkVariant("s1", 1080, 1350, "Portrait");
    const beforeMaster = useEngine
      .getState()
      .doc.slides.find((slide) => slide.id === "s1")!
      .elements.find((element) => element.id === title.id)!;

    useEngine.getState().updateElements([{ id: title.id, patch: { text: "Synced title" } }]);
    useEngine.getState().syncElementsToVariants([title.id]);

    const master = useEngine
      .getState()
      .doc.slides.find((slide) => slide.id === "s1")!
      .elements.find((element) => element.id === title.id);
    expect(master?.type).toBe("text");
    if (master?.type === "text") expect(master.text).toBe("Synced title");
    expect(master).toMatchObject({
      x: beforeMaster.x,
      y: beforeMaster.y,
      width: beforeMaster.width,
      height: beforeMaster.height,
    });
    expect(useEngine.getState().currentSlideId).toBe(variantId);
  });

  it("renames a layer and updates slide state with history", () => {
    const st = useEngine.getState();
    const slide = st.currentSlide()!;
    const layer = slide.layers[0];
    expect(layer.name).toBe("Block layer 1");

    st.renameLayer(layer.id, "Header & Hero Elements");

    const updatedSlide = useEngine.getState().currentSlide()!;
    expect(updatedSlide.layers[0].name).toBe("Header & Hero Elements");
  });

  it("toggles hex block grid visibility", () => {
    const st = useEngine.getState();
    expect(st.showHexGrid).toBe(true);

    st.setShowHexGrid(false);
    expect(useEngine.getState().showHexGrid).toBe(false);

    st.setShowHexGrid(true);
    expect(useEngine.getState().showHexGrid).toBe(true);
  });

  it("updates viewport layer filter mode", () => {
    const st = useEngine.getState();
    expect(st.layerFilter).toBe("all");

    st.setLayerFilter("block");
    expect(useEngine.getState().layerFilter).toBe("block");

    st.setLayerFilter("free");
    expect(useEngine.getState().layerFilter).toBe("free");

    st.setLayerFilter("all");
    expect(useEngine.getState().layerFilter).toBe("all");
  });
});
