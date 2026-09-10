import { describe, expect, it } from "vitest";
import { deriveGeneratedImageName } from "@/lib/ai/orchestration/imageNaming";

describe("deriveGeneratedImageName", () => {
  it("derives clean Thai image name from Thai generation commands", () => {
    expect(deriveGeneratedImageName("สร้างรูปแมว")).toBe("ภาพแมว");
    expect(deriveGeneratedImageName("วาดรูปหมูบินได้")).toBe("ภาพหมูบินได้");
    expect(deriveGeneratedImageName("ขอรูปทะเลพระอาทิตย์ตก")).toBe("ภาพทะเลพระอาทิตย์ตก");
    expect(deriveGeneratedImageName("สร้างภาพวิวภูเขา")).toBe("ภาพวิวภูเขา");
    expect(deriveGeneratedImageName("ทำรูปกล้วยไม้สีม่วง")).toBe("ภาพกล้วยไม้สีม่วง");
  });

  it("handles prompts that already start with ภาพ or รูป", () => {
    expect(deriveGeneratedImageName("ภาพแมว")).toBe("ภาพแมว");
    expect(deriveGeneratedImageName("รูปแมวส้ม")).toBe("ภาพแมวส้ม");
    expect(deriveGeneratedImageName("รูปภาพแมว")).toBe("ภาพแมว");
  });

  it("handles short brief descriptions", () => {
    expect(deriveGeneratedImageName("แมว")).toBe("ภาพแมว");
    expect(deriveGeneratedImageName("แมวน่ารัก")).toBe("ภาพแมวน่ารัก");
    expect(deriveGeneratedImageName("หมูตัวน้อยสีชมพู")).toBe("ภาพหมูตัวน้อยสีชมพู");
  });

  it("strips variation suffixes cleanly", () => {
    expect(deriveGeneratedImageName("แมวน่ารัก (variation 2)")).toBe("ภาพแมวน่ารัก");
    expect(deriveGeneratedImageName("ภาพวิวทะเล แบบที่ 1")).toBe("ภาพวิวทะเล");
  });

  it("handles English prompts with ภาพ prefix", () => {
    expect(deriveGeneratedImageName("cute cat")).toBe("ภาพ cute cat");
    expect(deriveGeneratedImageName("generate a photo of mountain lake")).toBe("ภาพ mountain lake");
  });

  it("falls back gracefully when empty", () => {
    expect(deriveGeneratedImageName("")).toBe("ภาพใหม่");
    expect(deriveGeneratedImageName(undefined, "สร้างรูปแมว")).toBe("ภาพแมว");
  });
});
