import { describe, expect, it } from "vitest";
import { createRasterStroke } from "@/lib/raster/mask";
import { interpolateRasterStrokeStamps, rasterStrokeSpacing } from "@/lib/raster/strokeDraw";

describe("raster stroke stamps", () => {
  it("spaces soft brushes more densely than hard pencils", () => {
    expect(rasterStrokeSpacing(40, 1)).toBeGreaterThan(rasterStrokeSpacing(40, 0.2));
  });

  it("interpolates gappy pointer samples into a continuous stamp path", () => {
    const stroke = createRasterStroke(
      [
        [0, 0],
        [40, 0],
      ],
      20,
      1,
      { mode: "paint", hardness: 0.4 },
    );
    const stamps = interpolateRasterStrokeStamps(stroke);
    expect(stamps.length).toBeGreaterThan(2);
    expect(stamps[0]).toEqual({ x: 0, y: 0, pressure: 1 });
    expect(stamps.at(-1)).toEqual({ x: 40, y: 0, pressure: 1 });
  });
});
