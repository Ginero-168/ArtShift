import { describe, expect, it } from "vitest";
import {
  composeFollowUpDirectorPrompt,
  extractPriorImageGenerationContext,
  isImageFollowUpPrompt,
  resolveFollowUpDimensions,
  snapshotGenerationContext,
} from "@/lib/ai/orchestration/chatContinuity";

describe("chatContinuity", () => {
  it("detects Thai follow-up phrases including 'สร้างมาอีก 3 รูป'", () => {
    expect(isImageFollowUpPrompt("สร้างมาอีก 3 รูป")).toBe(true);
    expect(isImageFollowUpPrompt("ทำอีก 2 แบบ")).toBe(true);
    expect(isImageFollowUpPrompt("อีก 3 รูป")).toBe(true);
    expect(isImageFollowUpPrompt("ขอตัวเลือกเพิ่ม 3 แบบ")).toBe(true);
    expect(isImageFollowUpPrompt("สร้างรูปแมวสัดส่วน 16:9")).toBe(false);
    expect(isImageFollowUpPrompt("สร้างมา 3 รูปแมวบนโซฟา")).toBe(false);
  });

  it("inherits 16:9 from prior generation on 'สร้างมาอีก 3 รูป'", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "สร้างมาอีก 3 รูป",
      prior: {
        userPrompt: "สร้างรูปแมวสัดส่วน 16:9",
        refinedPrompt: "A photoreal cat on a sofa, 16:9 landscape",
        width: 1280,
        height: 720,
        aspectRatio: "16:9",
      },
    });
    expect(dims).toEqual({ width: 1280, height: 720, aspectRatio: "16:9" });
  });

  it("inherits dimensions from conversation history when structured prior is missing", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "สร้างมาอีก 3 รูป",
      conversationHistory: [
        { role: "user", content: "สร้างรูปแมว 16:9 นอนบนโซฟา" },
        { role: "assistant", content: "สร้างรูปแมวแนวนอนเสร็จแล้วครับ" },
      ],
    });
    expect(dims?.aspectRatio).toBe("16:9");
  });

  it("composes a director prompt that carries prior refinedPrompt and ratio", () => {
    const composed = composeFollowUpDirectorPrompt("สร้างมาอีก 3 รูป", {
      userPrompt: "สร้างรูปแมว 16:9",
      refinedPrompt: "Photoreal Scottish Fold cat on a sofa, soft window light, 16:9",
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
      summary: "แมวนอนบนโซฟาแนวนอน",
    });
    expect(composed).toContain("User follow-up request: สร้างมาอีก 3 รูป");
    expect(composed).toContain("LAST IMAGE GENERATION PACKAGE");
    expect(composed).toContain("16:9 (1280×720)");
    expect(composed).toContain("Photoreal Scottish Fold cat on a sofa");
  });

  it("locks Shared Anchors and varies Layer-2 axes on brand follow-ups", () => {
    const composed = composeFollowUpDirectorPrompt("สร้างมาอีก 3 รูป", {
      userPrompt: "ออกแบบป้ายหมวด 60x20cm ใส่โลโก้แบรนด์",
      refinedPrompt: "Flat 2D shelf sign, 3:1, brand logo locked",
      width: 1536,
      height: 512,
      aspectRatio: "16:9",
      refinementMode: "brand-variant",
      sharedAnchors: [
        { id: "logo", label: "โลโก้ / Wordmark", detail: "คงโลโก้ตามบรีฟ" },
        { id: "ratio", label: "สัดส่วน", detail: "60×20 ซม. (3:1)" },
      ],
      variantSelections: [
        {
          axisId: "mood",
          axisTitle: "คาแรคเตอร์",
          optionId: "mood_premium",
          label: "พรีเมียม",
          character: "ลึกลับ · หรู",
          modifier: "คาแรคเตอร์พรีเมียม",
        },
      ],
    });
    expect(composed).toContain("SHARED ANCHORS");
    expect(composed).toContain("คงโลโก้ตามบรีฟ");
    expect(composed).toContain("PRIOR VARIANT AXES");
    expect(composed).toContain("พรีเมียม");
    expect(composed).toContain("Never change text/logo");
  });

  it("extracts structured generationContext from assistant history", () => {
    const prior = extractPriorImageGenerationContext([
      { role: "user", content: "สร้างรูปแมว 16:9" },
      {
        role: "assistant",
        content: "สร้างเสร็จแล้ว",
        generationContext: {
          userPrompt: "สร้างรูปแมว 16:9",
          refinedPrompt: "Cat 16:9 base prompt",
          width: 1280,
          height: 720,
          aspectRatio: "16:9",
        },
      },
      { role: "user", content: "สร้างมาอีก 3 รูป" },
    ]);
    expect(prior?.refinedPrompt).toBe("Cat 16:9 base prompt");
    expect(prior?.aspectRatio).toBe("16:9");
  });

  it("detects short revision follow-ups like 'ปรับเป็นแนวตั้ง'", () => {
    expect(isImageFollowUpPrompt("ปรับเป็นแนวตั้ง")).toBe(true);
    expect(isImageFollowUpPrompt("ทำให้เป็นแนวตั้ง")).toBe(true);
    expect(isImageFollowUpPrompt("ทำเป็นแนวตั้ง")).toBe(true);
    expect(isImageFollowUpPrompt("แนวตั้ง")).toBe(true);
    expect(isImageFollowUpPrompt("portrait")).toBe(true);
    expect(isImageFollowUpPrompt("make it vertical")).toBe(true);
    expect(isImageFollowUpPrompt("ปรับโทน")).toBe(true);
    expect(isImageFollowUpPrompt("ปรับรายละเอียดต่อ")).toBe(true);
    expect(isImageFollowUpPrompt("ตรวจสอบ Layout")).toBe(false);
    expect(isImageFollowUpPrompt("ลบพื้นหลัง")).toBe(false);
  });

  it("swaps custom 29×7cm to 7×29cm on 'ปรับเป็นแนวตั้ง' instead of defaulting to 9:16", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "ปรับเป็นแนวตั้ง",
      prior: {
        userPrompt: "สร้างป้าย shelftalk 29x7 cm โทนชมพู ลด 35%",
        refinedPrompt: "Pink floral bookstore shelftalk, 35% off, 29x7cm",
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
        ratioClamped: true,
        printWidth: 2848,
        printHeight: 688,
      },
    });
    expect(dims?.ratioClamped).toBe(true);
    expect(dims?.height).toBeGreaterThan(dims?.width ?? 0);
    expect((dims?.printHeight ?? 0) / (dims?.printWidth ?? 1)).toBeCloseTo(29 / 7, 2);
    expect(dims?.aspectRatio).not.toBe("9:16");
  });

  it("flips named 16:9 to 9:16 on a vertical follow-up", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "ปรับเป็นแนวตั้ง",
      prior: {
        userPrompt: "สร้างรูปแมวสัดส่วน 16:9",
        refinedPrompt: "A photoreal cat on a sofa, 16:9 landscape",
        width: 1280,
        height: 720,
        aspectRatio: "16:9",
      },
    });
    expect(dims).toEqual({ width: 720, height: 1280, aspectRatio: "9:16" });
  });

  it("flips named 3:1 to 1:3 on 'ปรับเป็นแนวตั้ง' instead of substituting 9:16", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "ปรับเป็นแนวตั้ง",
      prior: {
        userPrompt: "ป้าย Nain ลด 35% พาโนรามา 3:1",
        refinedPrompt: "Pink floral Nain bookstore banner, 35% off, 3:1",
        width: 2048,
        height: 688,
        aspectRatio: "3:1",
      },
    });
    expect(dims?.aspectRatio).toBe("1:3");
    expect(dims?.height).toBeGreaterThan(dims?.width ?? 0);
  });

  it("keeps custom 29×7cm on a variation follow-up that does not change orientation", () => {
    const dims = resolveFollowUpDimensions({
      prompt: "สร้างมาอีก 3 รูป",
      prior: {
        userPrompt: "สร้างป้าย 29x7 cm",
        refinedPrompt: "Shelftalk 29x7cm",
        width: 2048,
        height: 688,
        aspectRatio: "2048x688",
      },
    });
    expect(dims?.ratioClamped).toBe(true);
    expect((dims?.printWidth ?? 0) / (dims?.printHeight ?? 1)).toBeCloseTo(29 / 7, 2);
    expect(dims?.width).toBeGreaterThan(dims?.height ?? 0);
  });

  it("persists 29×7cm on snapshot and swaps stored source after a portrait result", () => {
    const landscape = snapshotGenerationContext({
      userPrompt: "สร้างป้าย shelftalk 29x7 cm",
      refinedPrompt: "Pink floral shelftalk 29x7cm",
      width: 2848,
      height: 688,
      aspectRatio: "2048x688",
      ratioClamped: true,
      printWidth: 2848,
      printHeight: 688,
    });
    expect(landscape.sourceWidth).toBe(29);
    expect(landscape.sourceHeight).toBe(7);
    expect(landscape.sizeUnit).toBe("cm");
    expect(landscape.sizeLabel).toMatch(/29x7/i);

    const portrait = snapshotGenerationContext({
      userPrompt: "สร้างป้าย shelftalk 29x7 cm",
      refinedPrompt: "Pink floral shelftalk 7x29cm",
      width: 688,
      height: 2848,
      aspectRatio: "688x2048",
      ratioClamped: true,
      printWidth: 688,
      printHeight: 2848,
    });
    expect(portrait.sourceWidth).toBe(7);
    expect(portrait.sourceHeight).toBe(29);
    expect(portrait.sizeLabel).toMatch(/7x29/i);
  });
});
