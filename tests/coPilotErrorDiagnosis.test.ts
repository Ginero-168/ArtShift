import { describe, expect, it } from "vitest";
import { diagnoseOrchestratorError } from "@/lib/ai/coPilot";
import { createDirectedImageRun } from "@/lib/ai/orchestration/turnOrchestrator";

describe("CoPilot Error Diagnosis", () => {
  it("diagnoses Spider-Man copyright / safety policy failure with actionable guidance", () => {
    const diagnosis = diagnoseOrchestratorError(
      "Safety filter triggered: prompt contains copyrighted character",
      "สร้างรูป สไปเดอร์แมน",
    );

    expect(diagnosis.shortReason).toContain("สไปเดอร์แมน");
    expect(diagnosis.reply).toContain("ลิขสิทธิ์หรือนโยบายความปลอดภัย");
    expect(diagnosis.reply).toContain("สไปเดอร์แมน");
    expect(diagnosis.reply).toContain("หลีกเลี่ยงการระบุชื่อตัวละคร");
    expect(diagnosis.reply).toContain("ซูเปอร์ฮีโร่ในชุดบอดี้สูทโทนสีแดง-น้ำเงิน");
    expect(diagnosis.suggestions).toEqual(
      expect.arrayContaining(["🦸 สร้างฮีโร่ชุดแดงน้ำเงิน (เลี่ยงลิขสิทธิ์)"]),
    );
  });

  it("diagnoses sensitive/NSFW policy error without character name", () => {
    const diagnosis = diagnoseOrchestratorError(
      "Content policy violation: NSFW content detected",
      "วาดภาพแนววาบหวิว",
    );

    expect(diagnosis.shortReason).toContain("ความปลอดภัย");
    expect(diagnosis.reply).toContain("นโยบายความปลอดภัย");
    expect(diagnosis.suggestions).toContain("🎨 สร้างสไตล์ออริจินัล");
  });

  it("diagnoses missing API key / auth error", () => {
    const diagnosis = diagnoseOrchestratorError(
      "AI provider is not configured for this session. (PROVIDER_AUTH)",
      "สร้างรูปแมว",
    );

    expect(diagnosis.shortReason).toContain("API Token");
    expect(diagnosis.reply).toContain("Settings");
    expect(diagnosis.suggestions).toContain("⚙️ ตรวจสอบการตั้งค่า API Token");
  });

  it("diagnoses rate limit error", () => {
    const diagnosis = diagnoseOrchestratorError(
      "Rate limit exceeded (429)",
      "สร้างรูปแมว",
    );

    expect(diagnosis.shortReason).toContain("Rate limit");
    expect(diagnosis.reply).toContain("เรียกใช้งานถี่เกินไป");
  });
});

describe("turnOrchestrator prompt preservation", () => {
  it("preserves direction.refinedPrompt in task.prompt rather than replacing it with brief", () => {
    const refinedPrompt =
      "A gorgeous Scottish Fold cat with plush orange tabby fur, resting on a sunlit oak floor, warm golden hour window light, shallow depth of field, 8k resolution";

    const run = createDirectedImageRun(
      {
        prompt: "สร้างรูปแมว",
        refs: [],
        analyses: [],
      },
      {
        kind: "image-task",
        summary: "สร้างรูปแมว",
        outputBriefs: ["แมวส้มพักผ่อน"],
        refinedPrompt,
        specialist: "image_generator",
        capability: "IMAGE_DEFAULT",
        modelAlias: "image-general",
        knowledgeSkillIds: [],
        reviewCriteria: ["ภาพต้องเป็นแมว"],
        search: { required: false, queries: [], sources: [] },
        outputCount: 1,
      },
    );

    expect(run.tasks).toHaveLength(1);
    expect(run.tasks[0].prompt).toContain(refinedPrompt);
    expect(run.tasks[0].summary).toBe("แมวส้มพักผ่อน");
  });
});
