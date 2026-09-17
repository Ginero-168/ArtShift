import { describe, expect, it } from "vitest";
import { buildImageResultSummary } from "@/lib/ai/imageResultPresentation";

describe("buildImageResultSummary multi-size", () => {
  it("does not claim a failed first ratio in Change/Framing", () => {
    const summary = buildImageResultSummary({
      subject: "ปกซูชิสยองขวัญ",
      count: 2,
      isEdit: true,
      userPrompt: "ปรับให้รูปนี้ เป็น 16:9 , 3:4 และ 9:16 ที",
      outputBriefs: ["ปกซูชิสยองขวัญ 16:9", "ขนาด 3:4", "ขนาด 9:16"],
      succeededAspects: ["3:4", "9:16"],
      failedAspects: ["16:9"],
      width: 1152,
      height: 1536,
      aspectRatio: "3:4",
      modelLabel: "GPT Image 2.5 Sunburst",
      quality: "auto",
    });

    expect(summary.headline).toContain("2 รูป");
    expect(summary.headline).not.toContain("16:9");
    const change = summary.fields.find((field) => field.label === "Change")?.value;
    const framing = summary.fields.find((field) => field.label === "Framing")?.value;
    expect(change).not.toContain("16:9");
    expect(framing).toContain("3:4");
    expect(framing).toContain("9:16");
    expect(framing).toContain("ยังไม่ได้: 16:9");
  });
});
