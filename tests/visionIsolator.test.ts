import { describe, expect, it } from "vitest";
import { alphaCoverageFromRgba, hasUsableForeground } from "@/lib/vision/foreground";

describe("Vision AI Object Isolator & Calculations", () => {
  it("calculates correct pixel crop bounds from normalized bounding boxes", () => {
    const naturalWidth = 1200;
    const naturalHeight = 800;

    const bbox = {
      x_min: 0.25, // 300px
      y_min: 0.2, // 160px
      x_max: 0.75, // 900px
      y_max: 0.8, // 640px
    };

    const sx = Math.max(0, Math.round(bbox.x_min * naturalWidth));
    const sy = Math.max(0, Math.round(bbox.y_min * naturalHeight));
    const sw = Math.min(naturalWidth - sx, Math.round((bbox.x_max - bbox.x_min) * naturalWidth));
    const sh = Math.min(naturalHeight - sy, Math.round((bbox.y_max - bbox.y_min) * naturalHeight));

    expect(sx).toBe(300);
    expect(sy).toBe(160);
    expect(sw).toBe(600);
    expect(sh).toBe(480);
  });

  it("calculates canvas world placement for isolated objects", () => {
    const parentElement = {
      x: 100,
      y: 200,
      width: 400,
      height: 300,
    };

    const obj = {
      label: "cup",
      x_min: 0.5,
      y_min: 0.4,
      x_max: 0.8,
      y_max: 0.9,
    };

    const objWidth = Math.max(20, Math.round(parentElement.width * (obj.x_max - obj.x_min)));
    const objHeight = Math.max(20, Math.round(parentElement.height * (obj.y_max - obj.y_min)));
    const objX = Math.round(parentElement.x + parentElement.width * obj.x_min);
    const objY = Math.round(parentElement.y + parentElement.height * obj.y_min);

    expect(objWidth).toBe(120); // 0.3 * 400
    expect(objHeight).toBe(150); // 0.5 * 300
    expect(objX).toBe(300); // 100 + 400*0.5
    expect(objY).toBe(320); // 200 + 300*0.4
  });

  it("rejects transparent detector crops instead of creating empty rectangles", () => {
    const coverage = alphaCoverageFromRgba(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 255]));

    expect(coverage).toBe(0.5);
    expect(hasUsableForeground(0.005)).toBe(false);
    expect(hasUsableForeground(coverage)).toBe(true);
  });
});
