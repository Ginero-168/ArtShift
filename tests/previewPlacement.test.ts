import { describe, expect, it } from "vitest";
import { placeImagePreview } from "@/lib/ai/orchestration/previewPlacement";

describe("image hover preview placement", () => {
  it("uses a compact 75px square preview container", () => {
    const square = placeImagePreview(
      { left: 32, top: 600, right: 132, bottom: 632, width: 100, height: 32 },
      { width: 2048, height: 2048 },
      { width: 800, height: 900 },
    );
    expect(square).toMatchObject({ width: 75, height: 75 });

    const landscape = placeImagePreview(
      { left: 32, top: 600, right: 132, bottom: 632, width: 100, height: 32 },
      { width: 1600, height: 900 },
      { width: 800, height: 900 },
    );
    expect(landscape).toMatchObject({ width: 75, height: 75 });
  });

  it("prefers top-start and keeps the preview within the viewport", () => {
    expect(
      placeImagePreview(
        { left: 32, top: 600, right: 132, bottom: 632, width: 100, height: 32 },
        { width: 360, height: 360 },
        { width: 800, height: 900 },
      ),
    ).toMatchObject({ placement: "top-start", left: 32, top: 517 });
  });

  it("keeps fixed coordinates inside a panned visual viewport", () => {
    const result = placeImagePreview(
      { left: 520, top: 460, right: 620, bottom: 492, width: 100, height: 32 },
      { width: 240, height: 180 },
      { left: 400, top: 300, width: 500, height: 400 },
    );

    expect(result.left).toBeGreaterThanOrEqual(412);
    expect(result.top).toBeGreaterThanOrEqual(312);
    expect(result.left + result.width).toBeLessThanOrEqual(888);
    expect(result.top + result.height).toBeLessThanOrEqual(688);
  });

  it("flips and clamps on a narrow viewport", () => {
    const result = placeImagePreview(
      { left: 2, top: 8, right: 102, bottom: 40, width: 100, height: 32 },
      { width: 500, height: 500 },
      { width: 320, height: 220 },
    );
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.top).toBeGreaterThanOrEqual(12);
    expect(result.left + result.width).toBeLessThanOrEqual(308);
    expect(result.top + result.height).toBeLessThanOrEqual(208);
    expect(result.placement).toBe("bottom-start");
  });
});
