import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCanvasHotkey } from "@/components/Canvas/useCanvasHotkeys";
import { createImage, createText } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type ImageElement } from "@/lib/engine/types";
import { createRasterStroke } from "@/lib/raster/mask";
import { createRasterSelectionOperation } from "@/lib/raster/selection";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";

describe("Canvas hotkeys", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useRasterStudioSession.getState().close();
  });

  beforeEach(() => {
    useEngine.getState().loadDoc({
      id: "hotkey-doc",
      title: "Hotkey test",
      schemaVersion: ENGINE_SCHEMA_VERSION,
      width: 800,
      height: 600,
      slides: [
        {
          id: "slide-1",
          name: "Slide 1",
          background: "#fff",
          width: 800,
          height: 600,
          elements: [],
          layers: [
            {
              id: "layer-1",
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
    });
  });

  it.each([
    ["rasterBrush", "paint"],
    ["rasterEraser", "erase"],
  ] as const)("undoes a committed %s stroke with Command+Z", (tool, mode) => {
    const st = useEngine.getState();
    st.setTool(tool);
    const image = createImage({
      x: 40,
      y: 40,
      width: 320,
      height: 240,
      fileId: "image-1",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    st.addElement(image);
    st.updateElements(
      [
        {
          id: image.id,
          patch: {
            rasterMask: [
              createRasterStroke(
                [
                  [80, 60],
                  [120, 90],
                ],
                48,
                1,
                {
                  mode,
                  color: "#111827",
                  hardness: 0.7,
                },
              ),
            ],
          },
        },
      ],
      mode === "paint" ? "paint image pixels" : "erase image pixels",
    );

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", metaKey: true }));

    const currentImage = () =>
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find(
          (element): element is ImageElement => element.id === image.id && element.type === "image",
        );
    const undoneImage = currentImage();
    expect(undoneImage?.rasterMask).toBeUndefined();

    handleCanvasHotkey(
      new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        metaKey: true,
        shiftKey: true,
      }),
    );
    expect(currentImage()?.rasterMask).toHaveLength(1);
  });

  it("undoes with Command+Z even when IME emits a Thai letter for KeyZ", () => {
    const st = useEngine.getState();
    const text = createText({ x: 20, y: 20, text: "ก่อนแก้" });
    st.addElement(text);
    st.updateElements([{ id: text.id, patch: { text: "หลังแก้" } }], "edit text");

    // Thai Kedmanee: physical Z key often reports key="ผ" while code stays KeyZ.
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "ผ", code: "KeyZ", metaKey: true }));

    const current = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === text.id);
    expect(current && current.type === "text" ? current.text : null).toBe("ก่อนแก้");
  });

  it("supports select-all / copy / paste / cut via Command shortcuts (code-based)", () => {
    const st = useEngine.getState();
    const a = createText({ x: 10, y: 10, text: "A" });
    const b = createText({ x: 40, y: 40, text: "B" });
    st.addElement(a);
    st.addElement(b);
    st.selectOnly([a.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "a", code: "KeyA", metaKey: true }));
    expect(useEngine.getState().selectedIds.size).toBe(2);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true }));
    expect(useEngine.getState().clipboard?.length).toBe(2);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "v", code: "KeyV", metaKey: true }));
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.filter((el) => !el.isDeleted),
    ).toHaveLength(4);

    const selected = Array.from(useEngine.getState().selectedIds);
    expect(selected.length).toBeGreaterThan(0);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "x", code: "KeyX", metaKey: true }));
    const remaining = useEngine
      .getState()
      .currentSlide()
      ?.elements.filter((el) => !el.isDeleted);
    expect(remaining?.length).toBe(4 - selected.length);
  });

  it("pastes in-app clipboard on Cmd+V, but leaves OS paste free when clipboard is empty", () => {
    const a = createText({ x: 10, y: 10, text: "A" });
    useEngine.getState().addElement(a);
    useEngine.getState().selectOnly([a.id]);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "c", code: "KeyC", metaKey: true }));

    const withClip = new KeyboardEvent("keydown", {
      key: "v",
      code: "KeyV",
      metaKey: true,
      cancelable: true,
    });
    const preventedWithClip = vi.spyOn(withClip, "preventDefault");
    handleCanvasHotkey(withClip);
    expect(preventedWithClip).toHaveBeenCalled();
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.filter((el) => !el.isDeleted),
    ).toHaveLength(2);

    useEngine.setState({ clipboard: null });
    const empty = new KeyboardEvent("keydown", {
      key: "v",
      code: "KeyV",
      metaKey: true,
      cancelable: true,
    });
    const preventedEmpty = vi.spyOn(empty, "preventDefault");
    handleCanvasHotkey(empty);
    expect(preventedEmpty).not.toHaveBeenCalled();
  });

  it("duplicates selection with Command+D", () => {
    const st = useEngine.getState();
    const text = createText({ x: 12, y: 12, text: "Dup" });
    st.addElement(text);
    st.selectOnly([text.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "d", code: "KeyD", metaKey: true }));

    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.filter((el) => !el.isDeleted),
    ).toHaveLength(2);
  });

  it("does not change brush size from the design canvas when Studio is closed", () => {
    const st = useEngine.getState();
    st.setRasterBrushSize(48);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "]", code: "BracketRight" }));
    expect(useEngine.getState().rasterBrushSize).toBe(48);
  });

  it("deletes the image object on Delete even if a leftover pixel Selection exists", () => {
    const st = useEngine.getState();
    const image = createImage({
      x: 40,
      y: 40,
      width: 320,
      height: 240,
      fileId: "image-selection",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    st.addElement(image);
    st.applyRasterSelection(
      image.id,
      createRasterSelectionOperation("replace", {
        kind: "rect",
        x: 0.2,
        y: 0.2,
        width: 0.4,
        height: 0.4,
      }),
      image.width,
      image.height,
    );
    st.selectOnly([image.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "Delete" }));

    const currentImage = () =>
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find(
          (element): element is ImageElement => element.id === image.id && element.type === "image",
        );
    expect(currentImage()?.isDeleted).toBe(true);
  });

  it("duplicates with Command+D even if editorMode is still raster", () => {
    const st = useEngine.getState();
    st.setEditorMode("raster");
    const text = createText({ x: 8, y: 8, text: "Keep" });
    st.addElement(text);
    st.selectOnly([text.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "d", code: "KeyD", metaKey: true }));

    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.filter((el) => !el.isDeleted),
    ).toHaveLength(2);
  });

  it("undoes and redoes a raster Selection without deleting the image", () => {
    const st = useEngine.getState();
    const image = createImage({
      x: 40,
      y: 40,
      width: 320,
      height: 240,
      fileId: "image-selection-history",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    st.addElement(image);
    st.applyRasterSelection(
      image.id,
      createRasterSelectionOperation("replace", {
        kind: "rect",
        x: 0.1,
        y: 0.1,
        width: 0.25,
        height: 0.25,
      }),
      image.width,
      image.height,
    );

    expect(useEngine.getState().activeRasterSelection?.imageId).toBe(image.id);
    useEngine.getState().undo();
    expect(useEngine.getState().activeRasterSelection).toBeNull();
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);

    useEngine.getState().redo();
    expect(useEngine.getState().activeRasterSelection?.imageId).toBe(image.id);
    expect(useEngine.getState().currentSlide()?.elements).toHaveLength(1);
  });

  it("does not open Raster Studio from a main-canvas raster letter key", () => {
    const st = useEngine.getState();
    st.setTool("select");
    const image = createImage({
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      fileId: "hotkey-image",
      naturalWidth: 100,
      naturalHeight: 80,
    });
    st.addElement(image);
    st.selectOnly([image.id]);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "ิ", code: "KeyB" }));

    const studio = useRasterStudioSession.getState();
    expect(studio.open).toBe(false);
    expect(useEngine.getState().tool).toBe("select");
  });

  it("keeps undo but does not delete the image while Raster Studio is open", () => {
    const st = useEngine.getState();
    const image = createImage({
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      fileId: "studio-hotkey-image",
      naturalWidth: 100,
      naturalHeight: 80,
    });
    st.addElement(image);
    st.selectOnly([image.id]);
    useRasterStudioSession.getState().openFromImage(image);
    st.updateElements(
      [
        {
          id: image.id,
          patch: {
            rasterMask: [createRasterStroke([[8, 8]], 12, 1, { mode: "paint", hardness: 1 })],
          },
        },
      ],
      "paint image pixels test",
    );

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "a", code: "KeyA", metaKey: true }));
    expect(useEngine.getState().selectedIds.size).toBe(1);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace" }));
    expect(
      useEngine
        .getState()
        .currentSlide()
        ?.elements.some((el) => el.id === image.id && !el.isDeleted),
    ).toBe(true);

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "z", code: "KeyZ", metaKey: true }));
    const undone = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el): el is ImageElement => el.id === image.id && el.type === "image");
    expect(undone?.rasterMask).toBeUndefined();

    useRasterStudioSession.getState().close();
  });

  it.each([
    ["KeyV", "select"],
    ["KeyA", "directSelect"],
    ["KeyP", "pen"],
    ["KeyT", "text"],
  ] as const)("switches vector tool with %s → %s", (code, tool) => {
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "x", code }));
    expect(useEngine.getState().tool).toBe(tool);
  });
});
