import { describe, expect, it } from "vitest";
import {
  composeFollowUpDirectorPrompt,
  extractPriorImageGenerationContext,
  isImageFollowUpPrompt,
  resolveFollowUpDimensions,
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
    expect(isImageFollowUpPrompt("make it vertical")).toBe(true);
    expect(isImageFollowUpPrompt("ปรับโทน")).toBe(true);
    expect(isImageFollowUpPrompt("ปรับรายละเอียดต่อ")).toBe(true);
    expect(isImageFollowUpPrompt("ตรวจสอบ Layout")).toBe(false);
    expect(isImageFollowUpPrompt("ลบพื้นหลัง")).toBe(false);
  });

  it("resolves 9:16 when the follow-up explicitly asks for vertical", () => {
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
    expect(dims?.aspectRatio).toBe("9:16");
  });
});
