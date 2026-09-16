import { describe, expect, it } from "vitest";
import {
  estimatePrintDpi,
  extractPhysicalPrintSizeCm,
  formatPrintUpscaleHint,
  recommendUpscaleMegapixelsForPrint,
} from "@/lib/ai/printUpscaleGuidance";
import { formatImageCompletionReply } from "@/lib/ai/imageCompletionReply";

describe("printUpscaleGuidance", () => {
  it("extracts physical cm sizes from Thai/English prompts", () => {
    expect(extractPhysicalPrintSizeCm("ป้ายขนาด 60x20cm")).toEqual({
      widthCm: 60,
      heightCm: 20,
    });
    expect(extractPhysicalPrintSizeCm("ขนาด 120 x 40 ซม.")).toEqual({
      widthCm: 120,
      heightCm: 40,
    });
    expect(extractPhysicalPrintSizeCm("สร้างแมวน่ารัก")).toBeNull();
  });

  it("estimates ~87 DPI for 2048px across 60cm", () => {
    expect(estimatePrintDpi(2048, 60)).toBe(87);
  });

  it("recommends megapixel targets that preserve aspect via Pruna target mode", () => {
    // 60×20 at 150 DPI needs ~4.2 MP → 8 MP preset
    expect(recommendUpscaleMegapixelsForPrint(60, 20, 150)).toBe(8);
    // 60×20 at 300 DPI needs ~16.7 MP → 32 MP preset
    expect(recommendUpscaleMegapixelsForPrint(60, 20, 300)).toBe(32);
  });

  it("formats an upscale follow-up hint without implying crop", () => {
    const hint = formatPrintUpscaleHint({ widthCm: 60, heightCm: 20 }, 2048);
    expect(hint).toContain("Upscale");
    expect(hint).toContain("3:1");
    expect(hint).toContain("ไม่ต้องครอป");
  });
});

describe("formatImageCompletionReply print note", () => {
  it("appends print/upscale guidance when the prompt includes cm size", () => {
    const text = formatImageCompletionReply("ป้าย Welearn", 1, ["ป้ายหมวด 60x20cm"], false, {
      outputWidthPx: 2048,
      printSizeSource: "ออกแบบป้าย 60x20cm",
    });
    expect(text).toContain("Upscale");
    expect(text).toContain("60×20");
  });

  it("skips print note for edits and non-print prompts", () => {
    const edit = formatImageCompletionReply("ปรับสี", 1, undefined, true, {
      printSizeSource: "60x20cm",
    });
    expect(edit).not.toContain("Upscale");

    const plain = formatImageCompletionReply("แมวน่ารัก", 1);
    expect(plain).not.toContain("Upscale");
  });
});
