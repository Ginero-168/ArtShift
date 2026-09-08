import { describe, expect, it } from "vitest";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";

describe("literal image conversation", () => {
  it("retains the actual brief, Director question and reply", () => {
    const brief = "Infographic ที่เกี่ยวกับถั่ว";
    const result = composeClarifiedImagePrompt(brief, "สามภาพแยก", "ต้องการกี่ภาพ?");
    expect(result).toBe(`${brief}\n\nDirector question: ต้องการกี่ภาพ?\nUser reply: สามภาพแยก`);
    expect(result).not.toContain("สไตล์ภาพที่เลือก");
    expect(result).not.toContain("การใช้งาน:");
  });
  it("retains every turn beyond two rounds and does not reinterpret free text", () => {
    let result = "สร้างภาพถั่ว";
    for (const reply of ["3 ภาพ", "ไม่เอาตัวหนังสือ", "พื้นโปร่งใส", "ไม่ใช่โปสเตอร์"]) {
      result = composeClarifiedImagePrompt(result, reply, "คำถามจากโมเดล");
    }
    for (const text of ["สร้างภาพถั่ว", "3 ภาพ", "ไม่เอาตัวหนังสือ", "พื้นโปร่งใส", "ไม่ใช่โปสเตอร์"])
      expect(result).toContain(text);
    expect(result.match(/Director question:/g)).toHaveLength(4);
  });
});
