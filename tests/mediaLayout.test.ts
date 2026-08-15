import { describe, expect, it } from "vitest";
import { createBuilderBlock } from "@/lib/builder/blocks";
import { getBookMockupGeometry } from "@/lib/engine/bookMockup";
import { createBookMockup, createImage } from "@/lib/engine/factory";
import { addObjectToLayer, createEngineLayer, reflowBlockObjects } from "@/lib/engine/layers";
import {
  fitMediaElementToRect,
  getMediaAspectRatio,
  isMediaElement,
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

  it("keeps a Block image aspect-correct after its hex placement reflows", () => {
    const layer = createEngineLayer("block");
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

    slide = addObjectToLayer(slide, image, layer.id, 1);
    slide = reflowBlockObjects(slide, 1);

    const reflowed = slide.elements.find((element) => element.id === image.id)!;
    expect(reflowed.width / reflowed.height).toBeCloseTo(2 / 3, 4);
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
