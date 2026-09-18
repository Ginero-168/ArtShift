import { describe, expect, it, vi } from "vitest";
import { createEditorController } from "@/lib/engine/editorController";
import { createImage } from "@/lib/engine/factory";
import {
  buildRasterStudioCommitPatch,
  buildRasterStudioOpenPayload,
  placementUnchanged,
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
});
