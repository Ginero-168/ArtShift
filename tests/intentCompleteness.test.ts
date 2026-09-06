import { describe, expect, it } from "vitest";
import { assessImageIntent } from "@/lib/ai/orchestration/intentCompleteness";

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
