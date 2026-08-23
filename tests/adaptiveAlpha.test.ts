import { describe, expect, it } from "vitest";
import { shouldRefineAlphaAnalysis } from "@/lib/vision/adaptiveAlpha";

const box = (x_min: number, y_min: number, x_max: number, y_max: number) => ({
  x_min,
  y_min,
  x_max,
  y_max,
});

describe("adaptive alpha analysis", () => {
  it("refines when Florence sees more objects than the base alpha pass", () => {
    expect(
      shouldRefineAlphaAnalysis(
        [box(0, 0, 0.2, 0.2), box(0.3, 0.3, 0.5, 0.5)],
        [box(0, 0, 0.5, 0.5)],
      ),
    ).toBe(true);
  });

  it("refines when alpha finds a thin detail", () => {
    expect(shouldRefineAlphaAnalysis([box(0, 0, 0.5, 0.8)], [box(0.2, 0.1, 0.205, 0.3)])).toBe(
      true,
    );
  });

  it("keeps ordinary matching work at the base resolution", () => {
    expect(shouldRefineAlphaAnalysis([box(0, 0, 0.4, 0.5)], [box(0.02, 0.03, 0.38, 0.48)])).toBe(
      false,
    );
  });
});
