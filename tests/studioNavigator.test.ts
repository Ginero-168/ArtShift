import { describe, expect, it } from "vitest";
import { cloneSamplePoint } from "@/lib/raster/clonePreview";
import {
  imageSpaceViewRect,
  navigatorThumbSize,
  panByImageDelta,
  panToCenterImagePoint,
  thumbToImagePoint,
} from "@/lib/raster/studio/navigatorView";

describe("Studio navigator view math", () => {
  it("fits a wide image into the thumbnail box", () => {
    const thumb = navigatorThumbSize(1600, 800);
    expect(thumb.width).toBeLessThanOrEqual(168);
    expect(thumb.height).toBeLessThanOrEqual(120);
    expect(thumb.width / thumb.height).toBeCloseTo(2, 2);
  });

  it("maps the pasteboard window into image space at fit zoom", () => {
    const rect = imageSpaceViewRect(800, 600, 400, 300, 1, { x: 0, y: 0 });
    expect(rect.x).toBeCloseTo(-200);
    expect(rect.y).toBeCloseTo(-150);
    expect(rect.width).toBeCloseTo(800);
    expect(rect.height).toBeCloseTo(600);
  });

  it("pans so a clicked point is centered", () => {
    const pan = panToCenterImagePoint(100, 50, 400, 200, 2);
    expect(pan.x).toBeCloseTo((200 - 100) * 2);
    expect(pan.y).toBeCloseTo((100 - 50) * 2);
  });

  it("drags the viewport rect in image space", () => {
    const next = panByImageDelta({ x: 10, y: 4 }, 5, 2, 2);
    expect(next.x).toBeCloseTo(0);
    expect(next.y).toBeCloseTo(0);
  });

  it("converts thumbnail clicks into image coordinates", () => {
    const point = thumbToImagePoint(40, 20, 80, 40, 400, 200);
    expect(point.x).toBeCloseTo(200);
    expect(point.y).toBeCloseTo(100);
  });
});

describe("clone sample point", () => {
  it("uses the source until a destination stroke starts", () => {
    expect(cloneSamplePoint([10, 20], null, [80, 90])).toEqual([10, 20]);
  });

  it("keeps the source-to-destination offset while dragging", () => {
    expect(cloneSamplePoint([10, 20], [30, 40], [50, 70])).toEqual([30, 50]);
  });
});
