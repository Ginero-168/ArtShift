import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorController } from "@/lib/engine/editorController";
import { createImage } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION, type ImageElement } from "@/lib/engine/types";
import { bakeRevisionPixelSize } from "@/lib/raster/studio/bakeRevision";
import {
  buildRasterStudioCommitPatch,
  buildRasterStudioDiscardPatch,
  buildRasterStudioOpenPayload,
  placementUnchanged,
  snapshotImagePlacement,
} from "@/lib/raster/studio/types";

describe("Raster Studio Smart Object contract", () => {
  it("open payload excludes placement mutation targets from content fields", () => {
    const image = createImage({
      x: 120,
      y: 80,
      width: 400,
      height: 300,
      fileId: "src-1",
      naturalWidth: 800,
      naturalHeight: 600,
    });
    image.angle = 0.25;
    image.opacity = 0.9;
    image.rasterMask = [];
    image.adjustments = { exposure: 10 };

    const payload = buildRasterStudioOpenPayload(image);

    expect(payload.elementId).toBe(image.id);
    expect(payload.fileId).toBe("src-1");
    expect(payload.naturalWidth).toBe(800);
    expect(payload.placement).toEqual({
      x: 120,
      y: 80,
      width: 400,
      height: 300,
      angle: 0.25,
      opacity: 0.9,
      flipX: undefined,
      flipY: undefined,
    });
    expect(payload.adjustments).toEqual({ exposure: 10 });
  });

  it("treats missing and false flip flags as the same placement", () => {
    expect(
      placementUnchanged(
        {
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          angle: 0,
          opacity: 1,
          flipX: undefined,
          flipY: undefined,
        },
        { x: 1, y: 2, width: 3, height: 4, angle: 0, opacity: 1, flipX: false, flipY: false },
      ),
    ).toBe(true);
    expect(
      placementUnchanged(
        { x: 1, y: 2, width: 3, height: 4, angle: 0, opacity: 1, flipX: true },
        { x: 1, y: 2, width: 3, height: 4, angle: 0, opacity: 1, flipX: false },
      ),
    ).toBe(false);
  });

  it("commit patch clears overlays and does not include placement keys", () => {
    const patch = buildRasterStudioCommitPatch({
      elementId: "img-1",
      fileId: "rev-2",
      naturalWidth: 800,
      naturalHeight: 600,
      bakePolicy: "flatten-overlays",
    });

    expect(patch).toEqual({
      fileId: "rev-2",
      naturalWidth: 800,
      naturalHeight: 600,
      crop: null,
      rasterMask: undefined,
      rasterEdits: undefined,
      adjustments: undefined,
      filterBlur: undefined,
    });
    expect(patch).not.toHaveProperty("x");
    expect(patch).not.toHaveProperty("y");
    expect(patch).not.toHaveProperty("width");
    expect(patch).not.toHaveProperty("height");
    expect(patch).not.toHaveProperty("angle");
    expect(patch).not.toHaveProperty("opacity");
  });

  it("commitRasterRevision updates fileId without moving the Smart Object", () => {
    const image = createImage({
      x: 40,
      y: 60,
      width: 320,
      height: 240,
      fileId: "old-file",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    image.angle = 0.1;
    image.opacity = 0.85;
    image.rasterMask = [
      {
        id: "stroke-1",
        points: [[10, 10]],
        size: 20,
        opacity: 1,
        hardness: 1,
        mode: "erase",
      },
    ];

    const updateElements = vi.fn(
      (patches: Array<{ id: string; patch: Record<string, unknown> }>) => {
        const patch = patches[0]?.patch ?? {};
        Object.assign(image, patch);
        if ("rasterMask" in patch && patch.rasterMask === undefined) {
          delete image.rasterMask;
        }
      },
    );

    const controller = createEditorController({
      currentSlide: () => ({ elements: [image] }) as never,
      updateElements,
      applyRasterSelection: vi.fn(),
    });

    const before = {
      x: image.x,
      y: image.y,
      width: image.width,
      height: image.height,
      angle: image.angle,
      opacity: image.opacity,
      flipX: image.flipX,
      flipY: image.flipY,
    };

    expect(
      controller.commitRasterRevision(
        image.id,
        {
          fileId: "new-file",
          naturalWidth: 640,
          naturalHeight: 480,
        },
        "update raster revision",
      ),
    ).toBe(true);

    expect(updateElements).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: image.id,
          patch: expect.objectContaining({
            fileId: "new-file",
            naturalWidth: 640,
            naturalHeight: 480,
            crop: null,
          }),
        }),
      ],
      "update raster revision",
    );

    expect(placementUnchanged(before, image)).toBe(true);
    expect(image.fileId).toBe("new-file");
    expect(image.rasterMask).toBeUndefined();
  });

  it("discard patch restores Open overlays without placement keys", () => {
    const image = createImage({
      x: 12,
      y: 24,
      width: 200,
      height: 100,
      fileId: "src-1",
      naturalWidth: 200,
      naturalHeight: 100,
    });
    image.rasterMask = [
      {
        id: "stroke-open",
        points: [[1, 1]],
        size: 8,
        opacity: 1,
        hardness: 1,
        mode: "paint",
      },
    ];
    const payload = buildRasterStudioOpenPayload(image);
    image.rasterMask = [];
    const patch = buildRasterStudioDiscardPatch(payload);
    expect(patch.rasterMask).toHaveLength(1);
    expect(patch).not.toHaveProperty("x");
    expect(patch).not.toHaveProperty("fileId");
  });
});

describe("Raster Studio Save through the real engine store", () => {
  beforeEach(() => {
    useEngine.getState().loadDoc({
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

  function commitThroughStore(image: ImageElement, baked: { width: number; height: number }) {
    useEngine.getState().addElement(image);
    const placed = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === image.id) as ImageElement | undefined;
    if (!placed) throw new Error("image missing after addElement");
    const before = snapshotImagePlacement(placed);
    const controller = createEditorController({
      currentSlide: () => useEngine.getState().currentSlide(),
      updateElements: useEngine.getState().updateElements,
      applyRasterSelection: useEngine.getState().applyRasterSelection,
    });
    expect(
      controller.commitRasterRevision(
        placed.id,
        {
          fileId: "baked-revision",
          naturalWidth: baked.width,
          naturalHeight: baked.height,
        },
        "update raster revision",
      ),
    ).toBe(true);
    const after = useEngine
      .getState()
      .currentSlide()
      ?.elements.find((el) => el.id === placed.id) as ImageElement | undefined;
    return { before, after };
  }

  it("keeps the placed box when Save writes bake@2x as the new natural size", () => {
    // Production handleSave: bakeImageElementRevision(image, cache, 2) then
    // commitRasterRevision({ naturalWidth: baked.width, naturalHeight: baked.height }).
    // Typical photo: large source pixels, smaller placed Smart Object.
    const image = createImage({
      x: 120,
      y: 80,
      width: 480,
      height: 270,
      fileId: "photo-src",
      naturalWidth: 1920,
      naturalHeight: 1080,
    });
    image.opacity = 0.85;
    image.angle = 0.15;
    const baked = bakeRevisionPixelSize(image, 2);
    expect(baked).toEqual({ width: 960, height: 540 });

    const { before, after } = commitThroughStore(image, baked);
    expect(after).toBeDefined();
    expect(before).toEqual({
      x: 120,
      y: 80,
      width: 480,
      height: 270,
      angle: 0.15,
      opacity: 0.85,
      flipX: undefined,
      flipY: undefined,
    });
    expect(placementUnchanged(before, after!)).toBe(true);
    expect(after!.width).toBe(480);
    expect(after!.height).toBe(270);
    expect(after!.naturalWidth).toBe(960);
    expect(after!.naturalHeight).toBe(540);
    expect(after!.fileId).toBe("baked-revision");
  });

  it("keeps placement when bake only changes natural pixel size (same aspect)", () => {
    const image = createImage({
      x: 40,
      y: 60,
      width: 320,
      height: 240,
      fileId: "old-file",
      naturalWidth: 320,
      naturalHeight: 240,
    });
    const { before, after } = commitThroughStore(image, { width: 640, height: 480 });
    expect(after).toBeDefined();
    expect(placementUnchanged(before, after!)).toBe(true);
    expect(after!.fileId).toBe("baked-revision");
    expect(after!.naturalWidth).toBe(640);
    expect(after!.crop).toBeNull();
  });

  it("does not clamp or rescale an overflowing Smart Object on Save", () => {
    const image = createImage({
      x: -80,
      y: -40,
      width: 2200,
      height: 1400,
      fileId: "overflow-src",
      naturalWidth: 2200,
      naturalHeight: 1400,
    });
    const { before, after } = commitThroughStore(image, { width: 4400, height: 2800 });
    expect(after).toBeDefined();
    expect(placementUnchanged(before, after!)).toBe(true);
  });

  it("keeps the placed box when crop is cleared and natural size matches the bake", () => {
    const image = createImage({
      x: 200,
      y: 120,
      width: 400,
      height: 300,
      fileId: "cropped-src",
      naturalWidth: 1600,
      naturalHeight: 1000,
    });
    image.crop = { x: 100, y: 0, width: 800, height: 600 };
    const { before, after } = commitThroughStore(image, { width: 800, height: 600 });
    expect(after).toBeDefined();
    expect(placementUnchanged(before, after!)).toBe(true);
    expect(after!.crop).toBeNull();
  });

  it("keeps placement when bake rounding slightly changes natural aspect", () => {
    const image = createImage({
      x: 88,
      y: 64,
      width: 333.4,
      height: 250.6,
      fileId: "frac-src",
      naturalWidth: 333.4,
      naturalHeight: 250.6,
    });
    const { before, after } = commitThroughStore(image, {
      width: Math.round(333.4 * 2),
      height: Math.round(250.6 * 2),
    });
    expect(after).toBeDefined();
    expect(placementUnchanged(before, after!)).toBe(true);
  });
});
