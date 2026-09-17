import { describe, expect, it } from "vitest";
import { resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";
import {
  extractDimensionSpecsFromText,
  extractRequestedSizeSpecsFromText,
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

describe("extractDimensionSpecsFromText", () => {
  it("extracts every WxH size in order for multi-size campaigns", () => {
    const specs = extractDimensionSpecsFromText(
      "Endcap 53x20 cm, Shelftalk 29x7 cm, 1040x1040 px, 1240x348 px, 1844x880 px",
    );
    expect(specs.map((s) => `${s.sourceWidth}x${s.sourceHeight}`)).toEqual([
      "53x20",
      "29x7",
      "1040x1040",
      "1240x348",
      "1844x880",
    ]);
    expect(specs[2]?.aspectRatio).toBe("2048x2048");
    expect(specs[0]?.aspectRatio).not.toBe("1:1");
    expect(specs[2]?.width / specs[2]!.height).toBe(1);
  });
});

describe("extractRequestedSizeSpecsFromText", () => {
  it("extracts named aspect ratios listed in one Thai resize ask", () => {
    const specs = extractRequestedSizeSpecsFromText(
      "ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที",
    );
    expect(specs.map((s) => s.aspectRatio)).toEqual(["16:9", "3:4", "9:16"]);
  });
});

describe("resolveDimensionsFromPixelSize", () => {
  it("no longer snaps mid ratios onto 16:9 / 4:3 buckets", () => {
    expect(resolveDimensionsFromPixelSize(1800, 900).aspectRatio).toBe("2048x1024");
    expect(resolveDimensionsFromPixelSize(1920, 1080).aspectRatio).toBe("2048x1152");
  });
});

describe("normalizeReplicateAspectRatio", () => {
  it("snaps custom pixels / A:B onto Replicate-allowed tokens", () => {
    expect(normalizeReplicateAspectRatio("2048x1024")).toBe("2048x1152");
    expect(normalizeReplicateAspectRatio("2:1")).toBe("2048x1152");
    expect(normalizeReplicateAspectRatio("3:1")).toBe("2048x1152");
    expect(normalizeReplicateAspectRatio("16:9")).toBe("16:9");
  });
});

describe("aspectRatioFromDimensions", () => {
  it("emits Replicate-allowed tokens for non-standard sizes", () => {
    expect(aspectRatioFromDimensions(2048, 1024)).toBe("2048x1152");
    expect(["16:9", "2048x1152", "3840x2160"]).toContain(
      aspectRatioFromDimensions(1280, 720),
    );
  });
});
