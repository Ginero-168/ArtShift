import { describe, expect, it } from "vitest";
import { createBuilderBlock } from "@/lib/builder/blocks";
import { getBookMockupGeometry } from "@/lib/engine/bookMockup";
import { createBookMockup, createImage } from "@/lib/engine/factory";
import { addObjectToLayer, createEngineLayer } from "@/lib/engine/layers";
import {
  fitMediaElementToRect,
  getMediaAspectRatio,
  isMediaElement,
  normalizeMediaPatch,
} from "@/lib/engine/mediaLayout";
import type { EngineSlide } from "@/lib/engine/types";

const LANDSCAPE = { width: 1920, height: 1080 };

describe("image-like object geometry", () => {
  it("uses the visible image or crop ratio as the object ratio", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 900,
      height: 900,
      fileId: "photo",
      naturalWidth: 1600,
      naturalHeight: 1000,
    });

    expect(isMediaElement(image)).toBe(true);
    expect(getMediaAspectRatio(image)).toBeCloseTo(1.6, 5);
    expect(
      getMediaAspectRatio({ ...image, crop: { x: 100, y: 0, width: 500, height: 1000 } }),
    ).toBeCloseTo(0.5, 5);
  });

  it("centers an image in its available rectangle without stretching it", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fileId: "cover",
      naturalWidth: 1200,
      naturalHeight: 1800,
    });
    const fitted = fitMediaElementToRect(image, { x: 100, y: 50, width: 800, height: 400 });

    expect(fitted.width / fitted.height).toBeCloseTo(2 / 3, 5);
    expect(fitted.height).toBe(400);
    expect(fitted.x).toBeCloseTo(100 + (800 - fitted.width) / 2, 5);
    expect(fitted.y).toBe(50);
  });

  it("creates every Builder media block with a tight aspect-correct bounding box", () => {
    for (const kind of ["coverImage", "supportingImage", "bookMockup"] as const) {
      const media = createBuilderBlock(kind, LANDSCAPE);
      expect(isMediaElement(media)).toBe(true);
      if (!isMediaElement(media)) continue;
      expect(media.width / media.height).toBeCloseTo(getMediaAspectRatio(media), 4);
    }
  });

  it("keeps a library image aspect-correct when added to a Free layer", () => {
    const layer = createEngineLayer("free");
    const image = createImage({
      x: 100,
      y: 100,
      width: 900,
      height: 500,
      fileId: "cover",
      naturalWidth: 1200,
      naturalHeight: 1800,
    });
    let slide: EngineSlide = {
      id: "slide",
      name: "Slide",
      background: "#fff",
      elements: [],
      layers: [layer],
      ...LANDSCAPE,
    };

    slide = addObjectToLayer(slide, image, layer.id);

    const added = slide.elements.find((element) => element.id === image.id)!;
    expect("mode" in slide.layers[0]).toBe(false);
    expect("placements" in slide.layers[0]).toBe(false);
    expect(added.width / added.height).toBeCloseTo(2 / 3, 4);
  });

  it("uses most of a 3D book bounding box at different camera angles", () => {
    for (const yaw of [-60, 0, 24, 60]) {
      const book = createBookMockup({
        x: 0,
        y: 0,
        width: 600,
        height: 800,
        fileId: "cover",
        naturalWidth: 1200,
        naturalHeight: 1800,
        yaw,
        pitch: -8,
      });
      const fitted = { ...book, ...fitMediaElementToRect(book, book) };
      const geometry = getBookMockupGeometry(fitted);
      const points = geometry.surfaces
        .filter((surface) => surface.visible)
        .flatMap((surface) => surface.quad);
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const visibleWidth = Math.max(...xs) - Math.min(...xs);
      const visibleHeight = Math.max(...ys) - Math.min(...ys);
      const waste = (fitted.width * fitted.height) / (visibleWidth * visibleHeight);

      expect(fitted.width / fitted.height).toBeCloseTo(getMediaAspectRatio(fitted), 4);
      expect(waste).toBeLessThanOrEqual(1.6);
    }
  });
});

describe("normalizeMediaPatch content revisions", () => {
  const artwork = { x: 0, y: 0, width: 1920, height: 1080 };

  it("does not reframe or clamp when natural size changes but the box already matches", () => {
    const image = createImage({
      x: -80,
      y: -40,
      width: 2200,
      height: 1400,
      fileId: "overflow",
      naturalWidth: 2200,
      naturalHeight: 1400,
    });
    const patch = normalizeMediaPatch(
      image,
      { fileId: "baked", naturalWidth: 4400, naturalHeight: 2800, crop: null },
      { artwork },
    );
    expect(patch).not.toHaveProperty("x");
    expect(patch).not.toHaveProperty("y");
    expect(patch).not.toHaveProperty("width");
    expect(patch).not.toHaveProperty("height");
  });

  it("does not reframe when bake rounding slightly changes natural aspect", () => {
    const image = createImage({
      x: 88,
      y: 64,
      width: 333.4,
      height: 250.6,
      fileId: "frac",
      naturalWidth: 333.4,
      naturalHeight: 250.6,
    });
    const patch = normalizeMediaPatch(
      image,
      {
        naturalWidth: Math.round(333.4 * 2),
        naturalHeight: Math.round(250.6 * 2),
        crop: null,
      },
      { artwork },
    );
    expect(patch).not.toHaveProperty("width");
    expect(patch).not.toHaveProperty("height");
  });

  it("still reframes when the source aspect actually changes", () => {
    const image = createImage({
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      fileId: "landscape",
      naturalWidth: 400,
      naturalHeight: 300,
    });
    const patch = normalizeMediaPatch(
      image,
      { naturalWidth: 1000, naturalHeight: 1000 },
      { artwork },
    );
    expect(patch.width).toBeDefined();
    expect(patch.height).toBeDefined();
    expect((patch.width as number) / (patch.height as number)).toBeCloseTo(1, 5);
  });
});
