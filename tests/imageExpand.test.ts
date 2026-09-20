import { describe, expect, it } from "vitest";
import {
  buildSideOutpaintPrompt,
  expandAxisForRatio,
  isExpandAspectPrompt,
  legalSidePanelSize,
  parseExpandRatioFromText,
  planExpandToRatio,
  planOutpaintPanelGeometry,
  ratioExceedsModelMax,
} from "@/lib/ai/orchestration/imageExpand";

describe("image expand (any ratio beyond 3:1)", () => {
  it("flags only ratios beyond the 3:1 model cap (both orientations)", () => {
    expect(ratioExceedsModelMax(29, 7)).toBe(true);
    expect(ratioExceedsModelMax(7, 29)).toBe(true);
    expect(ratioExceedsModelMax(4, 1)).toBe(true);
    expect(ratioExceedsModelMax(1, 4)).toBe(true);
    expect(ratioExceedsModelMax(60, 20)).toBe(false);
    expect(ratioExceedsModelMax(20, 60)).toBe(false);
    expect(ratioExceedsModelMax(3, 1)).toBe(false);
    expect(ratioExceedsModelMax(1, 3)).toBe(false);
    expect(ratioExceedsModelMax(16, 9)).toBe(false);
  });

  it("picks horizontal vs vertical expand axis from the print ratio", () => {
    expect(expandAxisForRatio(29, 7)).toBe("horizontal");
    expect(expandAxisForRatio(7, 29)).toBe("vertical");
    expect(expandAxisForRatio(60, 20)).toBeNull();
    expect(expandAxisForRatio(20, 60)).toBeNull();
  });

  it("detects expand prompts only when target exceeds 3:1", () => {
    expect(isExpandAspectPrompt("ขยายเป็น 29x7 cm")).toBe(true);
    expect(isExpandAspectPrompt("expand to 29×7")).toBe(true);
    expect(isExpandAspectPrompt("ขยายเป็น 7x29 cm")).toBe(true);
    expect(isExpandAspectPrompt("ขยายเป็น 4:1")).toBe(true);
    expect(isExpandAspectPrompt("ขยายเป็น 60x20 cm")).toBe(false);
    expect(isExpandAspectPrompt("ขยายเป็น 3:1")).toBe(false);
    expect(isExpandAspectPrompt("สร้างป้าย 29x7 cm")).toBe(false);
    expect(isExpandAspectPrompt("ขยายภาพให้ใหญ่ขึ้น")).toBe(false);
    // Special-size resize is not "jump to ต่อภาพ" — Gemini must plan first.
    expect(isExpandAspectPrompt("ปรับไซส์เป็น 29x7cm")).toBe(false);
    expect(isExpandAspectPrompt("@Photo ปรับไซส์เป็น 29x7cm")).toBe(false);
    expect(isExpandAspectPrompt("ปรับไซส์เป็น 29x7cm และ 60x20cm")).toBe(false);
    expect(isExpandAspectPrompt("ต่อภาพเป็น 29x7 cm")).toBe(true);
  });

  it("parses expand ratio from cm / colon text", () => {
    expect(parseExpandRatioFromText("ขยายเป็น 29x7 cm")).toEqual({
      ratioWidth: 29,
      ratioHeight: 7,
    });
    expect(parseExpandRatioFromText("ขยายเป็น 7x29 cm")).toEqual({
      ratioWidth: 7,
      ratioHeight: 29,
    });
    expect(parseExpandRatioFromText("expand to 4:1")).toEqual({
      ratioWidth: 4,
      ratioHeight: 1,
    });
  });

  it("plans horizontal side gaps for 29:7", () => {
    const layout = planExpandToRatio(2048, 688, 29, 7);
    expect(layout.axis).toBe("horizontal");
    expect(layout.targetWidth / layout.targetHeight).toBeCloseTo(29 / 7, 2);
    expect(layout.leftGap).toBeGreaterThan(40);
    expect(layout.rightGap).toBeGreaterThan(40);
    expect(layout.topGap).toBe(0);
    expect(layout.bottomGap).toBe(0);
    expect(layout.center.height).toBe(layout.targetHeight);
    expect(layout.leftGap + layout.center.width + layout.rightGap).toBe(layout.targetWidth);
  });

  it("plans vertical top/bottom gaps for 7:29", () => {
    const layout = planExpandToRatio(688, 2048, 7, 29);
    expect(layout.axis).toBe("vertical");
    expect(layout.targetHeight / layout.targetWidth).toBeCloseTo(29 / 7, 2);
    expect(layout.topGap).toBeGreaterThan(40);
    expect(layout.bottomGap).toBeGreaterThan(40);
    expect(layout.leftGap).toBe(0);
    expect(layout.rightGap).toBe(0);
    expect(layout.center.width).toBe(layout.targetWidth);
    expect(layout.topGap + layout.center.height + layout.bottomGap).toBe(layout.targetHeight);
  });

  it("boosts thin side panels to a legal generation size", () => {
    const panel = legalSidePanelSize(200, 688);
    expect(panel.width * panel.height).toBeGreaterThanOrEqual(655_360);
    expect(
      Math.max(panel.width, panel.height) / Math.min(panel.width, panel.height),
    ).toBeLessThanOrEqual(3.01);
  });

  it("plans outpaint geometry with fill + wide seed within 3:1 (both axes)", () => {
    const horizontal = planOutpaintPanelGeometry({
      gapSize: 400,
      crossEdge: 688,
      sourceAlong: 2048,
      axis: "horizontal",
    });
    expect(horizontal.fillSize + horizontal.seedSize).toBe(horizontal.width);
    expect(horizontal.seedSize).toBeGreaterThan(horizontal.fillSize * 0.8);

    const vertical = planOutpaintPanelGeometry({
      gapSize: 400,
      crossEdge: 688,
      sourceAlong: 2048,
      axis: "vertical",
    });
    expect(vertical.fillSize + vertical.seedSize).toBe(vertical.height);
    expect(vertical.seedSize).toBeGreaterThan(vertical.fillSize * 0.8);
    expect(
      Math.max(vertical.width, vertical.height) / Math.min(vertical.width, vertical.height),
    ).toBeLessThanOrEqual(3.01);
  });

  it("uses a subject-free outpaint prompt for every edge", () => {
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const prompt = buildSideOutpaintPrompt(side);
      expect(prompt).toMatch(/Do NOT add people/i);
      expect(prompt).toMatch(/Do NOT duplicate/i);
    }
  });
});
