import { describe, expect, it } from "vitest";
import {
  aspectRatioFromDimensions,
  normalizeReplicateAspectRatio,
  PANORAMIC_ASPECT,
  SKYSCRAPER_ASPECT,
} from "@/lib/server/ai/replicateAspectRatio";
import { resolveDimensionsFromPixelSize } from "@/lib/ai/imageGeneration";

describe("normalizeReplicateAspectRatio", () => {
  it("passes custom WIDTHxHEIGHT through without collapsing to 16:9", () => {
    expect(normalizeReplicateAspectRatio("2048x688")).toBe("2048x688");
    expect(normalizeReplicateAspectRatio("688x2048")).toBe("688x2048");
  });

  it("maps named 3:1 / 1:3 onto native panoramic pixel sizes", () => {
    expect(normalizeReplicateAspectRatio("3:1")).toBe(PANORAMIC_ASPECT);
    expect(normalizeReplicateAspectRatio("1:3")).toBe(SKYSCRAPER_ASPECT);
    expect(normalizeReplicateAspectRatio("21:9")).toBe(PANORAMIC_ASPECT);
  });

  it("keeps standard named ratios", () => {
    expect(normalizeReplicateAspectRatio("16:9")).toBe("16:9");
    expect(normalizeReplicateAspectRatio("1:1")).toBe("1:1");
    expect(normalizeReplicateAspectRatio("9:16")).toBe("9:16");
  });
});

describe("aspectRatioFromDimensions", () => {
  it("emits custom pixel aspect for ultra-wide / ultra-tall", () => {
    expect(aspectRatioFromDimensions(2048, 688)).toBe("2048x688");
    expect(aspectRatioFromDimensions(688, 2048)).toBe("688x2048");
  });

  it("keeps 16:9 for true landscape video ratio", () => {
    expect(aspectRatioFromDimensions(1280, 720)).toBe("16:9");
  });
});

describe("resolveDimensionsFromPixelSize panoramic", () => {
  it("maps ~3:1 source pixels onto native panoramic generation size", () => {
    expect(resolveDimensionsFromPixelSize(1800, 600)).toEqual({
      width: 2048,
      height: 688,
      aspectRatio: "2048x688",
    });
  });
});
