import { describe, it, expect } from "vitest";
import {
  isBroadImagePrompt,
  createPromptRefinement,
  buildRefinedPromptString,
} from "../lib/ai/orchestration/promptRefinement";

describe("promptRefinement", () => {
  describe("isBroadImagePrompt", () => {
    it("identifies broad image prompts correctly", () => {
      expect(isBroadImagePrompt("สร้างรูปแมว")).toBe(true);
      expect(isBroadImagePrompt("วาดรูปหมา")).toBe(true);
      expect(isBroadImagePrompt("gen รูปคน")).toBe(true);
      expect(isBroadImagePrompt("generate a cat image")).toBe(true);
      expect(isBroadImagePrompt("ภาพวิว")).toBe(true);
    });

    it("rejects prompts that are already detailed or specific", () => {
      expect(
        isBroadImagePrompt("สร้างรูปแมวสีส้ม ขนฟู นั่งอยู่บนโซฟากำมะหยี่สีเขียว สไตล์ photorealistic 8k")
      ).toBe(false);
      expect(
        isBroadImagePrompt("วาดภาพสุนัขโกลเด้นรีทรีฟเวอร์กำลังวิ่งริมทะเลช่วงพระอาทิตย์ตก แสง cinematic lighting 16:9")
      ).toBe(false);
    });

    it("rejects non-image prompts", () => {
      expect(isBroadImagePrompt("สวัสดี ทำอะไรได้บ้าง")).toBe(false);
      expect(isBroadImagePrompt("เปลี่ยนสีพื้นหลังสไลด์เป็นสีแดง")).toBe(false);
      expect(isBroadImagePrompt("ย้ายกล่องข้อความไปทางขวา 50px")).toBe(false);
    });
  });

  describe("createPromptRefinement", () => {
    it("creates feline structured refinement for cat prompt", () => {
      const refinement = createPromptRefinement("สร้างรูปแมว");
      expect(refinement.originalPrompt).toBe("สร้างรูปแมว");
      expect(refinement.subjectType).toBe("cat");
      expect(refinement.dimensions.length).toBeGreaterThan(3);

      const categoryIds = refinement.dimensions.map((c) => c.id);
      expect(categoryIds).toContain("color");
      expect(categoryIds).toContain("breed");
      expect(categoryIds).toContain("background");
      expect(categoryIds).toContain("camera");
      expect(categoryIds).toContain("style");

      const colorCategory = refinement.dimensions.find((c) => c.id === "color");
      expect(colorCategory?.options.map((o) => o.label)).toContain("ส้ม");
      expect(colorCategory?.options.map((o) => o.label)).toContain("ดำ");
      expect(colorCategory?.options.map((o) => o.label)).toContain("ขาว");
    });

    it("creates dog structured refinement for dog prompt", () => {
      const refinement = createPromptRefinement("วาดรูปหมา");
      expect(refinement.subjectType).toBe("dog");
      const breedCategory = refinement.dimensions.find((c) => c.id === "breed");
      expect(breedCategory?.options.map((o) => o.label)).toContain("โกลเด้น");
    });
  });

  describe("buildRefinedPromptString", () => {
    it("assembles refined prompt string based on selections", () => {
      const refinement = createPromptRefinement("สร้างรูปแมว");
      const selections = {
        color: "orange",
        breed: "persian",
        background: "living-room",
        camera: "eyelevel",
        style: "photorealistic",
      };

      const result = buildRefinedPromptString(refinement, selections);
      expect(result).toContain("สร้างรูปแมว");
      expect(result).toContain("สีส้มสดใส");
      expect(result).toContain("สายพันธุ์เปอร์เซีย");
      expect(result).toContain("ห้องนั่งเล่นอบอุ่น");
      expect(result).toContain("มุมกล้องระดับสายตา (Eye-level)");
      expect(result).toContain("สไตล์ภาพถ่ายสมจริง (Photorealistic)");
    });

    it("handles empty or partial selections gracefully", () => {
      const refinement = createPromptRefinement("สร้างรูปแมว");
      const selections = {
        color: "black",
      };

      const result = buildRefinedPromptString(refinement, selections);
      expect(result).toContain("สร้างรูปแมว");
      expect(result).toContain("สีดำขลับ");
      expect(result).not.toContain("สายพันธุ์");
    });
  });
});
