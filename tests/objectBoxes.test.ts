import { describe, expect, it } from "vitest";
import { mergeVisionWithAlphaComponents } from "@/lib/vision/objectBoxes";

describe("hybrid vision object boxes", () => {
  it("keeps separate alpha components inside one coarse Florence box", () => {
    const objects = mergeVisionWithAlphaComponents(
      [
        {
          label: "product group",
          x_min: 0.1,
          y_min: 0.1,
          x_max: 0.9,
          y_max: 0.9,
        },
      ],
      [
        { x_min: 0.1, y_min: 0.2, x_max: 0.3, y_max: 0.4, area: 100 },
        { x_min: 0.6, y_min: 0.5, x_max: 0.85, y_max: 0.8, area: 160 },
      ],
    );

    expect(objects).toHaveLength(2);
    expect(objects.map((object) => object.label)).toEqual(["product group", "product group"]);
  });

  it("keeps a small accessory such as a straw with its main object", () => {
    const objects = mergeVisionWithAlphaComponents(
      [{ label: "cup", x_min: 0.2, y_min: 0.1, x_max: 0.5, y_max: 0.7 }],
      [
        { x_min: 0.24, y_min: 0.28, x_max: 0.48, y_max: 0.7, area: 1000 },
        { x_min: 0.31, y_min: 0.1, x_max: 0.34, y_max: 0.3, area: 20 },
      ],
    );

    expect(objects).toEqual([{ label: "cup", x_min: 0.24, y_min: 0.1, x_max: 0.48, y_max: 0.7 }]);
  });

  it("attaches a nearby alpha-only accessory to its semantic object", () => {
    const objects = mergeVisionWithAlphaComponents(
      [{ label: "cup", x_min: 0.2, y_min: 0.3, x_max: 0.5, y_max: 0.7 }],
      [
        { x_min: 0.24, y_min: 0.38, x_max: 0.48, y_max: 0.7, area: 1000 },
        { x_min: 0.31, y_min: 0.1, x_max: 0.34, y_max: 0.31, area: 20 },
      ],
    );

    expect(objects).toEqual([{ label: "cup", x_min: 0.24, y_min: 0.1, x_max: 0.48, y_max: 0.7 }]);
  });

  it("removes a duplicate Florence box when alpha geometry already covers it", () => {
    const objects = mergeVisionWithAlphaComponents(
      [
        { label: "cup", x_min: 0.2, y_min: 0.2, x_max: 0.5, y_max: 0.7 },
        { label: "cup", x_min: 0.21, y_min: 0.21, x_max: 0.49, y_max: 0.69 },
      ],
      [{ x_min: 0.24, y_min: 0.25, x_max: 0.48, y_max: 0.68, area: 1000 }],
    );

    expect(objects).toEqual([{ label: "cup", x_min: 0.24, y_min: 0.25, x_max: 0.48, y_max: 0.68 }]);
  });

  it("adds alpha-only objects and preserves Florence-only objects", () => {
    const objects = mergeVisionWithAlphaComponents(
      [{ label: "shirt", x_min: 0.65, y_min: 0.65, x_max: 0.95, y_max: 0.95 }],
      [{ x_min: 0.05, y_min: 0.1, x_max: 0.2, y_max: 0.25, area: 60 }],
    );

    expect(objects).toEqual([
      { label: "object", x_min: 0.05, y_min: 0.1, x_max: 0.2, y_max: 0.25 },
      { label: "shirt", x_min: 0.65, y_min: 0.65, x_max: 0.95, y_max: 0.95 },
    ]);
  });

  it("falls back to Florence boxes when foreground components are unavailable", () => {
    const objects = mergeVisionWithAlphaComponents(
      [{ label: "cap", x_min: 0.2, y_min: 0.3, x_max: 0.4, y_max: 0.5 }],
      [],
    );

    expect(objects).toEqual([{ label: "cap", x_min: 0.2, y_min: 0.3, x_max: 0.4, y_max: 0.5 }]);
  });
});
