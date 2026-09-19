import { describe, expect, it, vi } from "vitest";
import { createImage } from "@/lib/engine/factory";
import { bakeImageElementRevision, bakeRevisionPixelSize } from "@/lib/raster/studio/bakeRevision";

const getImageData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/renderer/canvas", () => ({ renderElement: vi.fn() }));
vi.mock("@/lib/raster/studio/encodeRevision", () => ({
  createBakeSurface: (width: number, height: number) => ({
    canvas: { width, height },
    ctx: {
      scale: vi.fn(),
      getImageData: (...args: number[]) => {
        getImageData(...args);
        return { width, height, data: new Uint8ClampedArray(width * height * 4) };
      },
    },
    offscreen: false,
  }),
  encodeImageDataToPngDataUrl: async () => ({
    dataURL: "data:image/png;base64,ZmFrZQ==",
    encoder: "canvas-png" as const,
  }),
}));

describe("Raster Studio bake pixel size", () => {
  it("is display size × scale, not the source natural size", () => {
    const image = createImage({
      x: 120,
      y: 80,
      width: 480,
      height: 270,
      fileId: "photo",
      naturalWidth: 1920,
      naturalHeight: 1080,
    });
    expect(bakeRevisionPixelSize(image, 2)).toEqual({ width: 960, height: 540 });
    expect(bakeRevisionPixelSize(image, 2)).not.toEqual({
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  });

  it("bakeImageElementRevision returns those dimensions for Save to store as natural size", async () => {
    const image = createImage({
      x: 40,
      y: 60,
      width: 320,
      height: 240,
      fileId: "src",
      naturalWidth: 1600,
      naturalHeight: 1200,
    });

    const baked = await bakeImageElementRevision(image, undefined, 2);
    expect(baked.width).toBe(640);
    expect(baked.height).toBe(480);
    expect(getImageData).toHaveBeenCalledWith(0, 0, 640, 480);
    expect(image.x).toBe(40);
    expect(image.y).toBe(60);
    expect(image.width).toBe(320);
    expect(image.height).toBe(240);
  });
});
