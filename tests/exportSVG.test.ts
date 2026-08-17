import { describe, expect, it } from "vitest";
import { serializeSlideToSVG } from "@/lib/engine/exportSVG";
import {
  createArrow,
  createImage,
  createRect,
  createText,
  createVectorPath,
} from "@/lib/engine/factory";
import { createEngineLayer } from "@/lib/engine/layers";
import type { EngineSlide } from "@/lib/engine/types";

describe("editable SVG export", () => {
  it("keeps text and vector paths as native SVG objects", () => {
    const rect = createRect({ x: 20, y: 30, width: 200, height: 100 });
    rect.fillType = "linear";
    rect.gradientColors = ["#000000", "#ffffff"];
    const text = createText({ x: 40, y: 50, width: 160, height: 60, text: "หนังสือ" });
    const path = createVectorPath(
      [
        { x: 300, y: 40 },
        { x: 440, y: 100 },
        { x: 320, y: 180 },
      ],
      true,
    );
    const layer = createEngineLayer("free");
    layer.objectIds = [rect.id, text.id, path.id];
    const slide: EngineSlide = {
      id: "slide",
      name: "Vector export",
      background: "#ffffff",
      width: 600,
      height: 400,
      elements: [rect, text, path],
      layers: [layer],
    };

    const svg = serializeSlideToSVG(slide);
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain("<text");
    expect(svg).toContain("หนังสือ");
    expect(svg).toContain("<path");
    expect(svg).toContain('viewBox="0 0 600 400"');
  });

  it("preserves image masks, adjustments, blur and editable arrowheads", () => {
    const image = createImage({
      x: 20,
      y: 20,
      width: 200,
      height: 120,
      fileId: "missing-test-image",
      naturalWidth: 1000,
      naturalHeight: 600,
    });
    image.mask = { shape: "ellipse" };
    image.adjustments = { exposure: 20, saturation: -15 };
    image.filterBlur = 4;
    const arrow = createArrow([100, 180], [320, 220]);
    arrow.startArrowhead = "circle";
    arrow.endArrowhead = "triangle";
    const layer = createEngineLayer("free");
    layer.objectIds = [image.id, arrow.id];
    const slide: EngineSlide = {
      id: "slide-effects",
      name: "Effects",
      background: "#ffffff",
      width: 600,
      height: 400,
      elements: [image, arrow],
      layers: [layer],
    };

    const svg = serializeSlideToSVG(slide);
    expect(svg).toContain("<clipPath");
    expect(svg).toContain("<feGaussianBlur");
    expect(svg).toContain("data-artshift-adjustments");
    expect(svg).toContain("<circle");
    expect(svg).toContain("<polygon");
  });
});
