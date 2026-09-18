import { describe, expect, it } from "vitest";
import { analyzeImageDynamic } from "@/lib/ai/briefAnalyzer";

describe("Dynamic Image Layout Analyzer (briefAnalyzer)", () => {
  it("computes dynamic aspect ratios and layout partitions instead of static mocks", async () => {
    // 16:9 ratio test
    const wideData = await analyzeImageDynamic(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      1600,
      900,
    );
    expect(wideData.aspectRatio.width).toBe(1000);
    expect(wideData.backgroundPartitions.length).toBeGreaterThanOrEqual(1);

    // Verify no hardcoded sushi mock text exists
    const allTexts = [
      ...wideData.backgroundPartitions.map((p) => p.name),
      ...wideData.focalObjects.map((o) => o.name),
      ...wideData.focalObjects.map((o) => o.text || ""),
      ...wideData.texts.map((t) => t.text),
    ].join(" ");

    expect(allTexts).not.toContain("จุดเด่น / ราคา");
    expect(allTexts).not.toContain("สโลแกน / ข้อความ");
    expect(allTexts).not.toContain("ชิ้นละ 10 บาท");
    expect(allTexts).not.toContain("อุ่นใจ ใกล้บ้าน");
  });

  it("produces different divider positions and aspect ratios for portrait vs landscape", async () => {
    const portraitData = await analyzeImageDynamic(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAACCAYAAACF9TxKAAAAEUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      600,
      1000,
    );
    const landscapeData = await analyzeImageDynamic(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      1200,
      600,
    );

    expect(portraitData.aspectRatio.height).not.toBe(landscapeData.aspectRatio.height);
    expect(portraitData.dividers[0].start[1]).not.toBe(landscapeData.dividers[0].start[1]);
  });
});
