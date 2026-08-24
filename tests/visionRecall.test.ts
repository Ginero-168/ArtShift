import { describe, expect, it } from "vitest";
import { mergeVisionDetections, shouldRunVisionRecall } from "@/lib/vision/visionRecall";

const box = (label: string, x_min: number, y_min: number, x_max: number, y_max: number) => ({
  label,
  x_min,
  y_min,
  x_max,
  y_max,
});

describe("Florence recall pass", () => {
  it("runs when foreground geometry contains more objects", () => {
    expect(
      shouldRunVisionRecall(
        [box("cup", 0.1, 0.1, 0.3, 0.3)],
        [box("object", 0.1, 0.1, 0.3, 0.3), box("object", 0.6, 0.6, 0.8, 0.8)],
      ),
    ).toBe(true);
  });

  it("does not pay for recall when Florence and alpha counts agree", () => {
    expect(
      shouldRunVisionRecall(
        [box("cup", 0.1, 0.1, 0.3, 0.3), box("shirt", 0.5, 0.5, 0.9, 0.9)],
        [box("object", 0.1, 0.1, 0.3, 0.3), box("object", 0.5, 0.5, 0.9, 0.9)],
      ),
    ).toBe(false);
  });

  it("deduplicates matching OD and dense boxes", () => {
    expect(
      mergeVisionDetections(
        [box("cup", 0.1, 0.1, 0.3, 0.3)],
        [box("mug", 0.105, 0.105, 0.295, 0.295)],
      ),
    ).toEqual([box("cup", 0.1, 0.1, 0.3, 0.3)]);
  });

  it("keeps a small object inside a coarse group box", () => {
    expect(
      mergeVisionDetections(
        [box("product group", 0.05, 0.05, 0.95, 0.95)],
        [box("cap", 0.2, 0.2, 0.3, 0.3)],
      ),
    ).toHaveLength(2);
  });
});
