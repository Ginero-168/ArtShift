import { describe, expect, it } from "vitest";
import {
  labelAlphaComponents,
  mergeVisionWithAlphaComponents,
  shouldPreserveAlphaForProposal,
} from "@/lib/vision/objectBoxes";

describe("hybrid vision object boxes", () => {
  it("keeps Fast geometry while adding labels from coarse Florence boxes", () => {
    const objects = labelAlphaComponents(
      [
        { x_min: 0.1, y_min: 0.1, x_max: 0.25, y_max: 0.3, area: 100 },
        { x_min: 0.55, y_min: 0.12, x_max: 0.75, y_max: 0.32, area: 120 },
      ],
      [{ label: "product group", x_min: 0.05, y_min: 0.05, x_max: 0.9, y_max: 0.4 }],
    );

    expect(objects).toEqual([
      { label: "product group", x_min: 0.1, y_min: 0.1, x_max: 0.25, y_max: 0.3 },
      { label: "product group", x_min: 0.55, y_min: 0.12, x_max: 0.75, y_max: 0.32 },
    ]);
  });

  it("does not invent a Florence-sized merged rectangle", () => {
    const objects = labelAlphaComponents(
      [
        { x_min: 0.1, y_min: 0.1, x_max: 0.2, y_max: 0.2, area: 40 },
        { x_min: 0.7, y_min: 0.7, x_max: 0.8, y_max: 0.8, area: 40 },
      ],
      [{ label: "objects", x_min: 0.05, y_min: 0.05, x_max: 0.85, y_max: 0.85 }],
    );

    expect(objects).toHaveLength(2);
    expect(objects.every((object) => object.x_max > object.x_min)).toBe(true);
    expect(objects.every((object) => object.y_max > object.y_min)).toBe(true);
    expect(objects[0].x_max).toBeCloseTo(0.2);
    expect(objects[1].x_min).toBeCloseTo(0.7);
  });

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

  it("uses separate Florence instances to split one touching alpha blob", () => {
    const objects = mergeVisionWithAlphaComponents(
      [
        { label: "blue bag", x_min: 0.1, y_min: 0.2, x_max: 0.46, y_max: 0.85 },
        { label: "green bag", x_min: 0.5, y_min: 0.2, x_max: 0.9, y_max: 0.85 },
      ],
      [{ x_min: 0.1, y_min: 0.2, x_max: 0.9, y_max: 0.85, area: 5000 }],
    );

    expect(objects).toEqual([
      { label: "blue bag", x_min: 0.1, y_min: 0.2, x_max: 0.46, y_max: 0.85 },
      { label: "green bag", x_min: 0.5, y_min: 0.2, x_max: 0.9, y_max: 0.85 },
    ]);
  });

  it("preserves alpha details only for proposals that still match alpha geometry", () => {
    const mergedAlpha = [{ x_min: 0.1, y_min: 0.2, x_max: 0.9, y_max: 0.85, area: 5000 }];

    expect(
      shouldPreserveAlphaForProposal(
        { label: "merged foreground", x_min: 0.1, y_min: 0.2, x_max: 0.9, y_max: 0.85 },
        mergedAlpha,
      ),
    ).toBe(true);
    expect(
      shouldPreserveAlphaForProposal(
        { label: "blue bag", x_min: 0.1, y_min: 0.2, x_max: 0.46, y_max: 0.85 },
        mergedAlpha,
      ),
    ).toBe(false);
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
    const alphaComponents = [
      { x_min: 0.24, y_min: 0.38, x_max: 0.48, y_max: 0.7, area: 1000 },
      { x_min: 0.31, y_min: 0.1, x_max: 0.34, y_max: 0.31, area: 20 },
    ];
    const objects = mergeVisionWithAlphaComponents(
      [{ label: "cup", x_min: 0.2, y_min: 0.3, x_max: 0.5, y_max: 0.7 }],
      alphaComponents,
    );

    expect(objects).toEqual([{ label: "cup", x_min: 0.24, y_min: 0.1, x_max: 0.48, y_max: 0.7 }]);
    expect(shouldPreserveAlphaForProposal(objects[0], alphaComponents)).toBe(true);
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
