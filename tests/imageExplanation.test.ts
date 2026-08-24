import { describe, expect, it } from "vitest";
import {
  buildDetailedImageExplanation,
  summarizeRegionLabels,
} from "@/lib/vision/imageExplanation";

describe("image explanation", () => {
  it("combines a detailed caption, deduplicated regions, and OCR for chat", () => {
    const explanation = buildDetailedImageExplanation({
      caption: "Three decorated cups are arranged on a wooden table.",
      regionLabels: ["blue cup", "Blue cup", "red straw", "pink cup"],
      ocrText: "DORAEMON",
    });

    expect(explanation).toContain("คำอธิบายภาพโดยละเอียด");
    expect(explanation).toContain("Three decorated cups are arranged on a wooden table.");
    expect(explanation).toContain("• blue cup × 2");
    expect(explanation).toContain("• red straw");
    expect(explanation).toContain("ข้อความที่อ่านได้จากภาพ\nDORAEMON");
    expect(explanation).toContain("ภาพไม่ถูกส่งออกจาก Browser");
  });

  it("drops empty model values and limits noisy region output", () => {
    expect(summarizeRegionLabels(["", "  ", "undefined", "cup"])).toEqual([
      { label: "cup", count: 1 },
    ]);

    const labels = Array.from({ length: 30 }, (_, index) => `object ${index}`);
    const explanation = buildDetailedImageExplanation({
      caption: "A collage",
      regionLabels: labels,
    });
    expect((explanation.match(/^• /gm) ?? []).length).toBe(24);
  });
});
