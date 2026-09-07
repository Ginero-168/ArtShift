import { describe, expect, it } from "vitest";
import {
  assessImageIntent,
  composeClarifiedImagePrompt,
} from "@/lib/ai/orchestration/intentCompleteness";

describe("image intent completeness", () => {
  it("asks A/B/C/Other instead of generating from a bare subject", () => {
    const result = assessImageIntent({ prompt: "สร้างภาพแมว", analyses: [], hasSelection: false });
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.options.map((option) => option.id)).toEqual(["A", "B", "C", "OTHER"]);
    expect(result.question).toContain("direction");
  });

  it("uses selected-image analysis when producing choices", () => {
    const result = assessImageIntent({
      prompt: "ทำภาพโฆษณา",
      hasSelection: true,
      analyses: [
        {
          caption: "white ceramic coffee mug on a wooden table",
          objects: ["mug"],
          visibleText: "",
        },
      ],
    });
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.question).toContain("แก้ว");
    expect(result.options[0]?.label).not.toBe(result.options[1]?.label);
  });

  it("derives infographic directions from the actual topic instead of generic image presets", () => {
    const result = assessImageIntent({
      prompt: "Infographic ที่เกี่ยวกับถั่ว",
      analyses: [],
      hasSelection: false,
    });
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;

    const labels = result.options
      .filter((option) => option.id !== "OTHER")
      .map((option) => option.label);
    expect(labels.every((label) => label.includes("ถั่ว"))).toBe(true);
    expect(labels.join(" ")).not.toContain("อินโฟกราฟิกเกี่ยวกับInfographic ที่เกี่ยวกับถั่ว");
    expect(labels.join(" ")).not.toContain("Infographic ที่เกี่ยวกับถั่ว แบบภาพถ่ายสตูดิโอ");
    expect(labels[0]).toMatch(/ขั้นตอน|โครงสร้าง|อธิบาย/iu);
    expect(labels[1]).toMatch(/เปรียบเทียบ|ข้อมูล|คุณสมบัติ/iu);
    expect(labels[2]).toMatch(/ตัวละคร|มาสคอต|editorial/iu);

    const otherTopic = assessImageIntent({
      prompt: "Infographic ที่เกี่ยวกับการเกิดฝน",
      analyses: [],
      hasSelection: false,
    });
    expect(otherTopic.kind).toBe("clarification");
    if (otherTopic.kind !== "clarification") return;
    expect(otherTopic.options.map((option) => option.label).join(" ")).toContain("การเกิดฝน");
    expect(otherTopic.options).not.toEqual(result.options);
  });

  it("turns the selected direction into a provider-ready brief without losing the original topic", () => {
    const prompt = composeClarifiedImagePrompt(
      "Infographic ที่เกี่ยวกับถั่ว",
      "ภาพวาดกึ่ง editorial มีตัวละครถั่วช่วยเล่าเนื้อหา เหมาะกับโปสเตอร์",
    );
    expect(prompt).toContain("อินโฟกราฟิก");
    expect(prompt).toContain("ถั่ว");
    expect(prompt).toContain("ภาพวาดกึ่ง editorial");
    expect(prompt).toContain("ตัวละครถั่ว");
    expect(prompt).toContain("โปสเตอร์");
    expect(assessImageIntent({ prompt, analyses: [], hasSelection: false })).toMatchObject({
      kind: "ready",
    });
    const focusedPrompt = composeClarifiedImagePrompt(
      "ขอภาพแมว",
      "แมว แบบโฟกัสหัวข้อหลัก จัดแสงและองค์ประกอบให้เห็นรายละเอียดชัดเจน",
    );
    expect(
      assessImageIntent({ prompt: focusedPrompt, analyses: [], hasSelection: false }),
    ).toMatchObject({
      kind: "ready",
    });
  });
  it("marks a detailed brief ready without unnecessary questions", () => {
    const result = assessImageIntent({
      prompt:
        "สร้างภาพ product photo ของแก้วเซรามิกสีขาวบนโต๊ะไม้ แสงธรรมชาติ อัตราส่วน 1:1 สำหรับ Instagram",
      analyses: [],
      hasSelection: false,
    });
    expect(result.kind).toBe("ready");
  });
});
