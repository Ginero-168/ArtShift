import { describe, expect, it, vi } from "vitest";
import {
  CREATIVE_DIRECTOR_SYSTEM,
  prepareCreativeDirection,
} from "@/lib/ai/orchestration/creativeDirector";
import {
  assessGrill,
  formatGrillClarification,
  type GrillContext,
} from "@/lib/ai/orchestration/grill";
import { composeClarifiedImagePrompt } from "@/lib/ai/orchestration/intentCompleteness";

const canvas = { objectCount: 0, selectedCount: 0, width: 1080, height: 1080 };

const vaguePromo = "ทำโฆษณาโปรโมชัน";
const specificPromo = "โปสเตอร์โปรโมชันกาแฟลาเต้ ลด 50% สไตล์มินิมอล พื้นหลังครีม ตัวหนังสือไทย ขนาด 1080x1350";

function grillInput(partial: Partial<GrillContext> & { prompt: string }): GrillContext {
  return { referenceAnalyses: [], ...partial };
}

const imageTaskResult = {
  output: {
    text: "",
    toolCalls: [
      {
        name: "propose_creative_direction",
        input: {
          kind: "image-task",
          outputCount: 1,
          summary: "โปรโมชันเครื่องดื่มโทนพาณิชย์",
          refinedPrompt:
            "Square commercial photograph of a coffee drink as the hero, clean background, space for a Thai offer line",
          specialist: "image_generator",
          capability: "IMAGE_DEFAULT",
          modelAlias: "image-gpt-2",
          knowledgeSkillIds: [],
          reviewCriteria: ["the drink is the clear subject"],
          search: { required: false, queries: [], sources: [] },
        },
      },
    ],
  },
};

const clarificationResult = {
  output: {
    text: "",
    toolCalls: [
      {
        name: "propose_creative_direction",
        input: {
          kind: "clarification",
          question: "อยากได้สไตล์แบบไหน?",
          options: ["มินิมอล", "จัดเต็ม"],
        },
      },
    ],
  },
};

describe("grill trigger judgment", () => {
  it("asks one frontier question with a recommended answer for a vague promo", () => {
    const assessment = assessGrill(grillInput({ prompt: vaguePromo }));
    expect(assessment.action).toBe("ask");
    if (assessment.action !== "ask") return;
    expect(assessment.node).toBe("campaign-subject");
    expect(assessment.round).toBe(1);
    const formatted = formatGrillClarification(assessment.question);
    expect(formatted.question).toContain("โปรโมทอะไรเป็นหลัก");
    expect(formatted.question).toContain("➡️ แนะนำ:");
    expect(formatted.question).toContain(assessment.question.options[0]);
    expect(formatted.options.length).toBeLessThanOrEqual(4);
    expect(formatted.question.length).toBeLessThanOrEqual(1000);
  });

  it("sends a specific brief straight through without grilling", () => {
    const assessment = assessGrill(grillInput({ prompt: specificPromo }));
    expect(assessment).toMatchObject({ action: "proceed", reason: "specific" });
  });

  it("does not grill a simple subject that can take defaults", () => {
    expect(assessGrill(grillInput({ prompt: "สร้างรูปแมว" })).action).toBe("defer");
  });

  it("asks what to depict when the image request has no subject", () => {
    const assessment = assessGrill(grillInput({ prompt: "สร้างรูป" }));
    expect(assessment.action).toBe("ask");
    if (assessment.action !== "ask") return;
    expect(assessment.node).toBe("depict");
    expect(formatGrillClarification(assessment.question).question).toContain("➡️ แนะนำ:");
  });

  it("does not ask for a subject already visible in reference context", () => {
    const assessment = assessGrill(
      grillInput({
        prompt: vaguePromo,
        referenceAnalyses: [
          { caption: "latte in a glass cup", objects: ["coffee"], visibleText: "" },
        ],
      }),
    );
    expect(assessment.action).toBe("ask");
    if (assessment.action !== "ask") return;
    expect(assessment.node).toBe("offer");
    expect(assessment.question.ask).toContain("latte");
  });

  it("proceeds when vision already has both the product and the offer", () => {
    const assessment = assessGrill(
      grillInput({
        prompt: vaguePromo,
        referenceAnalyses: [
          { caption: "latte in a glass cup", objects: ["coffee"], visibleText: "50% OFF" },
        ],
      }),
    );
    expect(assessment).toMatchObject({ action: "proceed", reason: "specific" });
  });

  it("treats a tweak to a settled plan as proceed", () => {
    const assessment = assessGrill(
      grillInput({
        prompt: "ปรับเป็นแนวตั้ง",
        lastGeneration: { userPrompt: "ป้ายเดิม" },
      }),
    );
    expect(assessment).toMatchObject({ action: "proceed", reason: "follow-up" });
  });

  it.each(["ไม่ต้องถาม ทำเลย", "just generate", "ข้าม"])("exits the grill on pushback %s", (reply) => {
    const assessment = assessGrill(grillInput({ prompt: `${vaguePromo} ${reply}` }));
    expect(assessment).toMatchObject({ action: "proceed", reason: "skip" });
  });
});

describe("grill multi-turn continuation", () => {
  function subjectRound() {
    const first = assessGrill(grillInput({ prompt: vaguePromo }));
    if (first.action !== "ask") throw new Error("expected the subject question");
    const formatted = formatGrillClarification(first.question);
    return { first, formatted };
  }

  it("asks the offer after the subject is answered, and does not restart the tree", () => {
    const { formatted } = subjectRound();
    const prompt = composeClarifiedImagePrompt(vaguePromo, "กาแฟลาเต้", formatted.question);
    const next = assessGrill(
      grillInput({
        prompt,
        conversationHistory: [
          { role: "user", content: vaguePromo },
          { role: "assistant", content: formatted.question },
        ],
      }),
    );
    expect(next.action).toBe("ask");
    if (next.action !== "ask") return;
    expect(next.node).toBe("offer");
    expect(next.question.ask).toContain("กาแฟลาเต้");
    expect(next.question.ask).not.toContain("โปรโมทอะไรเป็นหลัก");
    expect(formatGrillClarification(next.question).question).toContain("➡️ แนะนำ:");
  });

  it("generates once the frontier is empty", () => {
    const { formatted } = subjectRound();
    const afterSubject = composeClarifiedImagePrompt(vaguePromo, "กาแฟลาเต้", formatted.question);
    const offer = assessGrill(grillInput({ prompt: afterSubject }));
    if (offer.action !== "ask") throw new Error("expected the offer question");
    const offerText = formatGrillClarification(offer.question).question;
    const done = assessGrill(
      grillInput({
        prompt: composeClarifiedImagePrompt(afterSubject, "ลด 50%", offerText),
        conversationHistory: [
          { role: "user", content: vaguePromo },
          { role: "assistant", content: formatted.question },
          { role: "user", content: "กาแฟลาเต้" },
          { role: "assistant", content: offerText },
        ],
      }),
    );
    expect(done).toMatchObject({ action: "proceed", reason: "frontier-clear" });
  });

  it("accepts one reply that settles the remaining frontier", () => {
    const { formatted } = subjectRound();
    const done = assessGrill(
      grillInput({
        prompt: composeClarifiedImagePrompt(vaguePromo, "กาแฟลาเต้ ลด 40%", formatted.question),
      }),
    );
    expect(done).toMatchObject({ action: "proceed", reason: "frontier-clear" });
  });

  it("keeps the same frontier when the reply does not decide it", () => {
    const { formatted } = subjectRound();
    const again = assessGrill(
      grillInput({
        prompt: composeClarifiedImagePrompt(vaguePromo, "อื่น ๆ (พิมพ์เอง)", formatted.question),
      }),
    );
    expect(again.action).toBe("ask");
    if (again.action !== "ask") return;
    expect(again.node).toBe("campaign-subject");
  });

  it("exits mid-tree when the user says to just generate", () => {
    const { formatted } = subjectRound();
    const skipped = assessGrill(
      grillInput({
        prompt: composeClarifiedImagePrompt(vaguePromo, "ไม่ต้องถาม ทำเลย", formatted.question),
      }),
    );
    expect(skipped).toMatchObject({ action: "proceed", reason: "skip" });
  });
});

describe("prepareCreativeDirection grill gate", () => {
  it("returns a grill clarification for a vague promo without calling the model", async () => {
    const execute = vi.fn();
    const result = await prepareCreativeDirection(
      {
        prompt: vaguePromo,
        canvasSummary: canvas,
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.question).toContain("➡️ แนะนำ:");
    expect(result.options.length).toBeGreaterThan(0);
  });

  it("still runs an image-task for a specific brief", async () => {
    const execute = vi.fn().mockResolvedValue(imageTaskResult);
    const result = await prepareCreativeDirection(
      {
        prompt: specificPromo,
        canvasSummary: canvas,
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );
    expect(execute).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(execute.mock.calls[0]?.[1]);
    expect(payload).toContain("action: PROCEED");
    expect(payload).toContain("reason: specific");
    expect(result.kind).toBe("image-task");
  });

  it("continues the tree on the next turn instead of generating early", async () => {
    const first = assessGrill(grillInput({ prompt: vaguePromo }));
    if (first.action !== "ask") throw new Error("expected the subject question");
    const question = formatGrillClarification(first.question).question;
    const execute = vi.fn().mockResolvedValue(imageTaskResult);
    const result = await prepareCreativeDirection(
      {
        prompt: composeClarifiedImagePrompt(vaguePromo, "กาแฟลาเต้", question),
        conversationHistory: [
          { role: "user", content: vaguePromo },
          { role: "assistant", content: question },
        ],
        canvasSummary: canvas,
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.kind).toBe("clarification");
    if (result.kind !== "clarification") return;
    expect(result.question).toContain("ข้อเสนอ");
    expect(result.question).toContain("➡️ แนะนำ:");
  });

  it("skips further questions when the user says to generate", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(clarificationResult)
      .mockResolvedValueOnce(imageTaskResult);
    const result = await prepareCreativeDirection(
      {
        prompt: "ทำโฆษณาโปรโมชัน ไม่ต้องถาม ทำเลย",
        canvasSummary: canvas,
        referenceAnalyses: [],
        availableCapabilities: ["IMAGE_DEFAULT"],
        cloudConsent: true,
      },
      { execute },
    );
    expect(execute).toHaveBeenCalledTimes(2);
    const retry = JSON.stringify(execute.mock.calls[1]?.[1]);
    expect(retry).toContain("GRILL ASSESSMENT remains PROCEED");
    expect(result.kind).toBe("image-task");
  });

  it("teaches the orchestrator the grill protocol", () => {
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("GRILL-ME PROTOCOL");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("➡️ แนะนำ:");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("ไม่ต้องถาม");
    expect(CREATIVE_DIRECTOR_SYSTEM).toContain("just generate");
  });
});
