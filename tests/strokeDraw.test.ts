import { describe, expect, it } from "vitest";
import { createRasterStroke } from "@/lib/raster/mask";
import {
  drawRasterStroke,
  interpolateRasterStrokeStamps,
  rasterStampFillColor,
  rasterStrokeSpacing,
} from "@/lib/raster/strokeDraw";

function mockStrokeContext() {
  const colorStops: Array<[number, string]> = [];
  const calls: string[] = [];
  let strokeStyle = "#000000";
  let fillStyle: string | CanvasGradient = "#000000";
  const ctx = {
    canvas: { width: 240, height: 160 },
    beginPath: () => calls.push("beginPath"),
    arc: () => calls.push("arc"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push(`stroke:${strokeStyle}`),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    createRadialGradient: () => ({
      addColorStop: (offset: number, color: string) => {
        colorStops.push([offset, color]);
      },
    }),
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string | CanvasGradient) {
      fillStyle = value;
    },
    lineCap: "butt",
    lineJoin: "miter",
    lineWidth: 1,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, colorStops, calls };
}

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

  it("fades soft stamps to the same RGB at zero alpha, never CSS transparent", () => {
    expect(rasterStampFillColor("#4b6fa3", 0)).toBe("rgba(75, 111, 163, 0)");
    expect(rasterStampFillColor("#4b6fa3", 1)).toBe("rgba(75, 111, 163, 1)");
    expect(rasterStampFillColor("transparent", 0)).toBe("rgba(17, 24, 39, 0)");
    expect(rasterStampFillColor(undefined, 1)).toBe("rgba(17, 24, 39, 1)");

    const { ctx, colorStops, calls } = mockStrokeContext();
    drawRasterStroke(
      ctx,
      createRasterStroke(
        [
          [20, 20],
          [28, 20],
        ],
        24,
        1,
        { mode: "paint", color: "#4b6fa3", hardness: 0.7 },
      ),
      "#4b6fa3",
    );

    expect(colorStops.length).toBeGreaterThan(0);
    expect(colorStops.some(([, color]) => color === "transparent")).toBe(false);
    expect(colorStops.at(-1)?.[0]).toBe(1);
    expect(colorStops.at(-1)?.[1]).toBe("rgba(75, 111, 163, 0)");
    expect(calls.some((call) => call.startsWith("stroke:"))).toBe(false);
    expect(calls).toContain("fill");
  });

  it("paints a hard stroke as one round-cap path in the brush color", () => {
    const { ctx, calls } = mockStrokeContext();
    drawRasterStroke(
      ctx,
      createRasterStroke(
        [
          [10, 10],
          [80, 12],
          [120, 40],
        ],
        32,
        1,
        { mode: "paint", color: "#64748b", hardness: 1 },
      ),
      "#64748b",
    );

    expect(calls.filter((call) => call.startsWith("stroke:"))).toEqual([
      "stroke:rgba(100, 116, 139, 1)",
    ]);
    expect(calls.filter((call) => call === "arc").length).toBe(0);
    expect(ctx.lineCap).toBe("round");
    expect(ctx.lineJoin).toBe("round");
    expect(ctx.lineWidth).toBe(32);
    expect(ctx.strokeStyle).toBe("rgba(100, 116, 139, 1)");
  });
});
