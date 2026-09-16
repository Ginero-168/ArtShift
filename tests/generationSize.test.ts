import { describe, expect, it } from "vitest";
import { resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";
import {
  resolveDimensionsFromPixelSize,
  resolveImageGenerationDimensions,
} from "@/lib/ai/imageGeneration";
import {
  aspectRatioFromDimensions,
  normalizeReplicateAspectRatio,
} from "@/lib/server/ai/replicateAspectRatio";

describe("resolveGenerationSizeFromRatio", () => {
  it("preserves arbitrary ratios as custom WIDTHxHEIGHT (not named buckets)", () => {
    expect(resolveGenerationSizeFromRatio(60, 30)).toMatchObject({
      width: 2048,
      height: 1024,
      aspectRatio: "2048x1024",
      ratioClamped: false,
    });
    expect(resolveGenerationSizeFromRatio(5, 2)).toMatchObject({
      width: 2048,
      height: 816,
      aspectRatio: "2048x816",
      ratioClamped: false,
    });
    expect(resolveGenerationSizeFromRatio(50, 40)).toMatchObject({
      width: 2048,
      height: 1632,
      aspectRatio: "2048x1632",
      ratioClamped: false,
    });
  });

  it("keeps 3:1 / 60x20 as native panoramic pixels", () => {
    expect(resolveGenerationSizeFromRatio(60, 20)).toMatchObject({
      width: 2048,
      height: 688,
      aspectRatio: "2048x688",
      ratioClamped: false,
    });
  });

  it("clamps ratios beyond the model 3:1 limit", () => {
    const clamped = resolveGenerationSizeFromRatio(4, 1);
    expect(clamped.ratioClamped).toBe(true);
    expect(clamped.width / clamped.height).toBeLessThanOrEqual(3.01);
  });
});

describe("resolveImageGenerationDimensions (any size)", () => {
  it("maps physical sizes to native custom pixels", () => {
    expect(resolveImageGenerationDimensions("ป้าย 60x30cm")).toMatchObject({
      width: 2048,
      height: 1024,
      aspectRatio: "2048x1024",
    });
    expect(resolveImageGenerationDimensions("ป้าย 60x20cm").aspectRatio).toBe("2048x688");
    expect(resolveImageGenerationDimensions("ภาพ 2:1").aspectRatio).toBe("2048x1024");
    expect(resolveImageGenerationDimensions("ภาพ 5:2").aspectRatio).toBe("2048x816");
  });

  it("still honors standard named ratios", () => {
    expect(resolveImageGenerationDimensions("16:9").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("1:1").aspectRatio).toBe("1:1");
  });
});

describe("resolveDimensionsFromPixelSize", () => {
  it("no longer snaps mid ratios onto 16:9 / 4:3 buckets", () => {
    expect(resolveDimensionsFromPixelSize(1800, 900).aspectRatio).toBe("2048x1024");
    expect(resolveDimensionsFromPixelSize(1920, 1080).aspectRatio).toBe("2048x1152");
  });
});

describe("normalizeReplicateAspectRatio", () => {
  it("passes custom pixels and maps A:B without collapsing to 16:9", () => {
    expect(normalizeReplicateAspectRatio("2048x1024")).toBe("2048x1024");
    expect(normalizeReplicateAspectRatio("2:1")).toBe("2048x1024");
    expect(normalizeReplicateAspectRatio("3:1")).toBe("2048x688");
    expect(normalizeReplicateAspectRatio("16:9")).toBe("16:9");
  });
});

describe("aspectRatioFromDimensions", () => {
  it("emits custom tokens for non-standard sizes", () => {
    expect(aspectRatioFromDimensions(2048, 1024)).toBe("2048x1024");
    expect(aspectRatioFromDimensions(1280, 720)).toBe("16:9");
  });
});
