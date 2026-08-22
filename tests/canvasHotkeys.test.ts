import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleCanvasHotkey } from "@/components/Canvas/useCanvasHotkeys";
import { createImage } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type ImageElement } from "@/lib/engine/types";
import { createRasterStroke } from "@/lib/raster/mask";
import { createRasterSelectionOperation } from "@/lib/raster/selection";

describe("Canvas hotkeys", () => {
  afterEach(() => vi.restoreAllMocks());

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
              name: "Free layer",
              mode: "free",
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

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "z", metaKey: true }));

    const currentImage = () =>
      useEngine
        .getState()
        .currentSlide()
        ?.elements.find(
          (element): element is ImageElement => element.id === image.id && element.type === "image",
        );
    const undoneImage = currentImage();
    expect(undoneImage?.rasterMask).toBeUndefined();

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true }));
    expect(currentImage()?.rasterMask).toHaveLength(1);
  });

  it("adjusts raster brush sizes with Adobe-style bracket shortcuts", () => {
    const st = useEngine.getState();

    st.setTool("rasterBrush");
    st.setRasterBrushSize(48);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "]", code: "BracketRight" }));
    expect(useEngine.getState().rasterBrushSize).toBe(49);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "[", code: "BracketLeft" }));
    expect(useEngine.getState().rasterBrushSize).toBe(48);

    st.setTool("rasterQuickSelection");
    st.setRasterQuickSelectionSize(96);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "]", code: "BracketRight" }));
    expect(useEngine.getState().rasterQuickSelectionSize).toBe(97);
    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "[", code: "BracketLeft" }));
    expect(useEngine.getState().rasterQuickSelectionSize).toBe(96);
  });

  it("deletes pixels inside an active raster Selection instead of deleting the image", () => {
    const st = useEngine.getState();
    st.setTool("rasterMove");
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
    expect(currentImage()?.isDeleted).toBe(false);
    expect(currentImage()?.rasterMask).toHaveLength(1);
    expect(currentImage()?.rasterMask?.[0].mode).toBe("erase");
    expect(currentImage()?.rasterMask?.[0].selection?.operations).toHaveLength(1);
    expect(currentImage()?.rasterMask?.[0].selection?.operations[0].shape).toMatchObject({
      kind: "rect",
      x: 0.2,
    });
  });

  it("deselects raster pixel selections with Command/Ctrl+D", () => {
    const st = useEngine.getState();
    st.setEditorMode("raster");
    st.applyRasterSelection(
      "image-a",
      createRasterSelectionOperation("replace", {
        kind: "rect",
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      }),
      100,
      100,
    );

    handleCanvasHotkey(new KeyboardEvent("keydown", { key: "d", metaKey: true }));

    expect(useEngine.getState().rasterSelections).toEqual({});
  });
});
