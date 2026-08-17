import { describe, expect, it } from "vitest";
import { BUILDER_BLOCKS, createBuilderBlock } from "../lib/builder/blocks";
import { serializeSlideToSVG } from "../lib/engine/exportSVG";
import {
  createEllipse,
  createFrame,
  createHeart,
  createHexagon,
  createRect,
  createStar,
  createVectorPath,
} from "../lib/engine/factory";
import {
  convertShapeToFrame,
  getFramePolaroidCutout,
  getFrameShapeSVGPath,
  isConvertibleShape,
} from "../lib/engine/frameMask";
import { useEngine } from "../lib/engine/store";
import type { FrameElement, FrameMaskShape, ImageElement } from "../lib/engine/types";

describe("Frame Mask Path Engine", () => {
  const shapes: FrameMaskShape[] = [
    "circle",
    "roundedRect",
    "polaroid",
    "arch",
    "heart",
    "star",
    "hexagon",
    "blob",
    "rect",
  ];

  for (const shape of shapes) {
    it(`generates valid SVG path data for shape '${shape}'`, () => {
      const pathData = getFrameShapeSVGPath(shape, 200, 200, 24);
      expect(pathData).toBeDefined();
      expect(pathData.length).toBeGreaterThan(5);
      expect(pathData.startsWith("M")).toBe(true);
    });
  }

  it("calculates polaroid cutout correctly", () => {
    const cutout = getFramePolaroidCutout(200, 250);
    expect(cutout.width).toBeGreaterThan(0);
    expect(cutout.height).toBeGreaterThan(0);
    expect(cutout.x).toBeGreaterThan(0);
    expect(cutout.y).toBeGreaterThan(0);
    expect(cutout.width).toBeLessThan(200);
    expect(cutout.height).toBeLessThan(250);
  });
});

describe("Frame Factory & Block Library", () => {
  it("creates frame with default and custom shapes", () => {
    const frame = createFrame({
      x: 50,
      y: 50,
      width: 150,
      height: 150,
      shape: "circle",
    });
    expect(frame.type).toBe("frame");
    expect(frame.shape).toBe("circle");
    expect(frame.cropZoom).toBe(1);
    expect(frame.cropOffsetX).toBe(0);
    expect(frame.cropOffsetY).toBe(0);
  });

  it("includes Frames category in BUILDER_BLOCKS", () => {
    const frameBlocks = BUILDER_BLOCKS.filter((b) => b.category === "Frames");
    expect(frameBlocks.length).toBe(7);
    const kinds = frameBlocks.map((b) => b.kind);
    expect(kinds).toContain("frameCircle");
    expect(kinds).toContain("framePolaroid");
    expect(kinds).toContain("frameArch");
    expect(kinds).toContain("frameHeart");
    expect(kinds).toContain("frameStar");
    expect(kinds).toContain("frameRounded");
    expect(kinds).toContain("frameHexagon");
  });

  it("instantiates elements for all frame block kinds", () => {
    const kinds = [
      "frameCircle",
      "framePolaroid",
      "frameArch",
      "frameHeart",
      "frameStar",
      "frameRounded",
      "frameHexagon",
    ] as const;

    for (const kind of kinds) {
      const el = createBuilderBlock(kind, { width: 1920, height: 1080 });
      expect(el.type).toBe("frame");
      expect(el.width).toBeGreaterThan(0);
      expect(el.height).toBeGreaterThan(0);
    }
  });
});

describe("Frame Store Actions & SVG Serialization", () => {
  it("updates frame shape, image, and detaches image cleanly", () => {
    const store = useEngine.getState();
    const frame = createFrame({
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      shape: "circle",
    });

    store.addElement(frame);
    expect(useEngine.getState().doc.slides[0].elements.some((e) => e.id === frame.id)).toBe(true);

    // Set image
    store.setFrameImage(frame.id, "data:image/png;base64,mock");
    let currentFrame = useEngine
      .getState()
      .doc.slides[0].elements.find((e) => e.id === frame.id) as FrameElement;
    expect(currentFrame.imageFileId).toBe("data:image/png;base64,mock");

    // Set shape
    store.setFrameShape(frame.id, "heart");
    currentFrame = useEngine
      .getState()
      .doc.slides[0].elements.find((e) => e.id === frame.id) as FrameElement;
    expect(currentFrame.shape).toBe("heart");

    // SVG export
    const currentSlide = useEngine.getState().doc.slides[0];
    const svg = serializeSlideToSVG(currentSlide);
    expect(svg).toContain(`clipPath id="frame-${frame.id}"`);

    // Detach image
    store.detachFrameImage(frame.id);
    const updatedSlide = useEngine.getState().doc.slides[0];
    const updatedFrame = updatedSlide.elements.find((e) => e.id === frame.id) as FrameElement;
    expect(updatedFrame.imageFileId).toBeUndefined();

    // Check that a new ImageElement was created with positive dimensions
    const createdImage = updatedSlide.elements.find(
      (e): e is ImageElement =>
        e.type === "image" && (e as ImageElement).fileId === "data:image/png;base64,mock",
    );
    expect(createdImage).toBeDefined();
    expect(createdImage?.width).toBeGreaterThan(0);
    expect(createdImage?.height).toBeGreaterThan(0);
  });

  it("handles frame placement and image snapping in both Block and Free layers", () => {
    const store = useEngine.getState();
    const slide = store.doc.slides[0];

    // Create a Block frame
    const frameBlock = createBuilderBlock("frameCircle", {
      width: slide.width,
      height: slide.height,
    });
    store.addElement(frameBlock);

    const afterAdd = useEngine.getState().doc.slides[0];
    const placed = afterAdd.elements.find((e) => e.id === frameBlock.id) as FrameElement;
    expect(placed).toBeDefined();
    expect(placed.type).toBe("frame");
    expect(placed.shape).toBe("circle");

    // Snap image to frame
    store.setFrameImage(placed.id, "data:image/png;base64,test-snap");
    const currentFrame = useEngine
      .getState()
      .doc.slides[0].elements.find((e) => e.id === placed.id) as FrameElement;
    expect(currentFrame.imageFileId).toBe("data:image/png;base64,test-snap");
  });

  it("selects frame easily from interior hit testing and supports cropRotation", async () => {
    const { hitTestElement } = await import("../lib/engine/hitTest");
    const frame = createFrame({
      x: 100,
      y: 100,
      width: 300,
      height: 300,
      shape: "roundedRect",
      cropRotation: 45,
    });

    // Point squarely in the middle of the frame
    const centerPoint = { x: 250, y: 250 };
    expect(hitTestElement(centerPoint, frame)).toBe(true);

    // Point outside
    const outsidePoint = { x: 50, y: 50 };
    expect(hitTestElement(outsidePoint, frame)).toBe(false);

    expect(frame.cropRotation).toBe(45);
  });

  it("supports feather edge blur and preserves original aspect ratio", () => {
    const frame = createFrame({
      x: 50,
      y: 50,
      width: 250,
      height: 250,
      shape: "circle",
      feather: 15,
      imageFileId: "data:image/png;base64,feather-test",
    });

    expect(frame.feather).toBe(15);
    expect(frame.width).toBe(250);
    expect(frame.height).toBe(250);

    const store = useEngine.getState();
    store.addElement(frame);
    const slide = useEngine.getState().doc.slides[0];
    const svg = serializeSlideToSVG(slide);
    expect(svg).toContain("filter id=");
    expect(svg).toContain("feGaussianBlur");
  });

  it("converts basic shapes (Rect, Circle, Star, Hexagon, Heart, Custom Path) to Frames", () => {
    const rect = {
      ...createRect({ x: 100, y: 100, width: 200, height: 150 }),
      cornerRadius: 16,
    };
    expect(isConvertibleShape(rect)).toBe(true);
    const rectFrame = convertShapeToFrame(rect);
    expect(rectFrame.type).toBe("frame");
    expect(rectFrame.shape).toBe("roundedRect");
    expect(rectFrame.cornerRadius).toBe(16);
    expect(rectFrame.width).toBe(200);
    expect(rectFrame.height).toBe(150);

    const ellipse = createEllipse({ x: 50, y: 50, width: 120, height: 120 });
    const circleFrame = convertShapeToFrame(ellipse);
    expect(circleFrame.shape).toBe("circle");

    const star = createStar({ x: 0, y: 0, width: 100, height: 100 });
    const starFrame = convertShapeToFrame(star);
    expect(starFrame.shape).toBe("star");

    const hexagon = createHexagon({ x: 0, y: 0, width: 100, height: 100 });
    const hexFrame = convertShapeToFrame(hexagon);
    expect(hexFrame.shape).toBe("hexagon");

    const heart = createHeart({ x: 0, y: 0, width: 100, height: 100 });
    const heartFrame = convertShapeToFrame(heart);
    expect(heartFrame.shape).toBe("heart");

    const path = createVectorPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
    const pathFrame = convertShapeToFrame(path);
    expect(pathFrame.shape).toBe("customPath");
    expect(pathFrame.customPathNodes?.length).toBe(3);
  });

  it("converts an existing shape element directly in the engine store", () => {
    const store = useEngine.getState();
    const rect = {
      ...createRect({ x: 40, y: 40, width: 180, height: 180 }),
      cornerRadius: 8,
    };
    store.addElement(rect);

    const frame = store.convertShapeToFrame(rect.id);
    expect(frame).toBeDefined();
    expect(frame?.id).toBe(rect.id);
    expect(frame?.type).toBe("frame");
    expect(frame?.shape).toBe("roundedRect");
    expect(frame?.cornerRadius).toBe(8);

    const slide = useEngine
      .getState()
      .doc.slides.find((s) => s.id === useEngine.getState().currentSlideId);
    const convertedOnSlide = slide?.elements.find((el) => el.id === rect.id);
    expect(convertedOnSlide?.type).toBe("frame");
  });
});
