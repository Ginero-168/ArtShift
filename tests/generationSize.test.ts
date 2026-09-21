import { describe, expect, it } from "vitest";
import { resolveGenerationSizeFromRatio } from "@/lib/ai/generationSize";
import {
  extractDimensionSpecsFromText,
  extractRequestedSizeSpecsFromText,
  hasNumericOrNamedSizeInText,
  requestedSizeSpecKey,
  resolveDimensionsFromPixelSize,
  resolveImageGenerationDimensions,
  uniqueRequestedSizeSpecs,
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

  it("clamps generation to 3:1 but keeps a true print canvas for expand+stitch", () => {
    const clamped = resolveGenerationSizeFromRatio(29, 7);
    expect(clamped.ratioClamped).toBe(true);
    expect(clamped.width / clamped.height).toBeLessThanOrEqual(3.01);
    expect(clamped.printWidth / clamped.printHeight).toBeCloseTo(29 / 7, 2);
    expect(clamped.printWidth / clamped.printHeight).toBeGreaterThan(3.05);

    const tall = resolveGenerationSizeFromRatio(7, 29);
    expect(tall.ratioClamped).toBe(true);
    expect(tall.height / tall.width).toBeLessThanOrEqual(3.01);
    expect(tall.printHeight / tall.printWidth).toBeCloseTo(29 / 7, 2);
    expect(tall.printHeight / tall.printWidth).toBeGreaterThan(3.05);
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

  it("keeps a true 29x7 print canvas when generation clamps to 3:1", () => {
    const dims = resolveImageGenerationDimensions("Shelftalk 29x7 cm");
    expect(dims.ratioClamped).toBe(true);
    expect(dims.width / dims.height).toBeLessThanOrEqual(3.01);
    expect(dims.printWidth! / dims.printHeight!).toBeCloseTo(29 / 7, 2);
  });

  it("keeps a true 7x29 print canvas when generation clamps to 1:3", () => {
    const dims = resolveImageGenerationDimensions("ป้ายแนวตั้ง 7x29 cm");
    expect(dims.ratioClamped).toBe(true);
    expect(dims.height / dims.width).toBeLessThanOrEqual(3.01);
    expect(dims.printHeight! / dims.printWidth!).toBeCloseTo(29 / 7, 2);
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
    expect(specs[1]?.unit).toBe("cm");
    expect(specs[1]?.label).toBe("29x7cm");
    expect(specs[2]?.unit).toBe("px");
  });
});

describe("hasNumericOrNamedSizeInText", () => {
  it("ignores orientation-only follow-ups so they can invert a remembered size", () => {
    expect(hasNumericOrNamedSizeInText("ปรับเป็นแนวตั้ง")).toBe(false);
    expect(hasNumericOrNamedSizeInText("ทำเป็นแนวตั้ง")).toBe(false);
    expect(hasNumericOrNamedSizeInText("portrait")).toBe(false);
    expect(hasNumericOrNamedSizeInText("make it vertical")).toBe(false);
    expect(hasNumericOrNamedSizeInText("29x7 cm")).toBe(true);
    expect(hasNumericOrNamedSizeInText("16:9")).toBe(true);
    expect(hasNumericOrNamedSizeInText("สัดส่วน 1:1")).toBe(true);
    expect(hasNumericOrNamedSizeInText("อัตราส่วน 9:16")).toBe(true);
    expect(hasNumericOrNamedSizeInText("aspect 16:9")).toBe(true);
    expect(hasNumericOrNamedSizeInText("1/1")).toBe(true);
  });
});

describe("extractRequestedSizeSpecsFromText", () => {
  it("extracts named aspect ratios listed in one Thai resize ask", () => {
    const specs = extractRequestedSizeSpecsFromText("ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที");
    expect(specs.map((s) => s.aspectRatio)).toEqual(["16:9", "3:4", "9:16"]);
  });

  it("keeps two Thai cm sizes distinct even when both clamp toward 3:1", () => {
    const specs = extractRequestedSizeSpecsFromText("ปรับไซส์เป็น 29x7cm และ 60x20cm");
    expect(specs.map((s) => `${s.sourceWidth}x${s.sourceHeight}${s.unit ?? ""}`)).toEqual([
      "29x7cm",
      "60x20cm",
    ]);
    expect(specs).toHaveLength(2);
  });

  it("extracts bare WxH pairs joined by และ", () => {
    const specs = extractRequestedSizeSpecsFromText("29x7 และ 29x10");
    expect(specs.map((s) => `${s.sourceWidth}x${s.sourceHeight}`)).toEqual(["29x7", "29x10"]);
  });

  it("extracts Thai and English aspect phrases including slash form", () => {
    expect(extractRequestedSizeSpecsFromText("สัดส่วน 1:1").map((s) => s.aspectRatio)).toEqual([
      "1:1",
    ]);
    expect(extractRequestedSizeSpecsFromText("อัตราส่วน 9:16").map((s) => s.aspectRatio)).toEqual([
      "9:16",
    ]);
    expect(extractRequestedSizeSpecsFromText("aspect 16:9").map((s) => s.aspectRatio)).toEqual([
      "16:9",
    ]);
    expect(extractRequestedSizeSpecsFromText("1/1").map((s) => s.aspectRatio)).toEqual(["1:1"]);
    expect(
      extractRequestedSizeSpecsFromText(
        "สร้างรูปแมว สีส้มสดใส สายพันธุ์มันช์กิน ขาสั้นน่ารัก ฉากคาเฟ่มินิมอล โทนอบอุ่น มุมกล้อง Action Shot ถ่ายทอดความร่าเริงขณะเคลื่อนไหว Rim light ขอบแสงตัดตัวแบบจากพื้นหลัง ดราม่า สัดส่วน 1:1",
      ).map((s) => s.aspectRatio),
    ).toEqual(["1:1"]);
  });
});

describe("uniqueRequestedSizeSpecs", () => {
  it("does not collapse 29x7cm and 60x20cm just because generation pixels match", () => {
    const specs = extractRequestedSizeSpecsFromText("29x7cm และ 60x20cm");
    expect(specs[0]?.aspectRatio).toBe(specs[1]?.aspectRatio);
    expect(requestedSizeSpecKey(specs[0]!)).not.toBe(requestedSizeSpecKey(specs[1]!));
    expect(uniqueRequestedSizeSpecs(specs)).toHaveLength(2);
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
    expect(["16:9", "2048x1152", "3840x2160"]).toContain(aspectRatioFromDimensions(1280, 720));
  });
});
