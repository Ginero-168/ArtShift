import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyImageFollowUpPrompt,
  composeFollowUpDirectorPrompt,
  DIRECTOR_CONVERSATION_HISTORY_LIMIT,
  isSizeAdjustFollowUpPrompt,
  resolveFollowUpImageRefs,
  serializeConversationHistoryForDirector,
  snapshotIngredients,
  toContinuityHistory,
} from "@/lib/ai/orchestration/chatContinuity";
import { isExpandAspectPrompt } from "@/lib/ai/orchestration/imageExpand";
import { createDirectedImageRun } from "@/lib/ai/orchestration/turnOrchestrator";
import { createImage } from "@/lib/engine/factory";

function photo(id: string, fileId: string, name: string) {
  return {
    ...createImage({
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      fileId,
      naturalWidth: 200,
      naturalHeight: 200,
      name,
    }),
    id,
  };
}

const nainPackage = {
  userPrompt: "ป้ายโปรโมชัน Nain โทนชมพูดอกไม้ ลด 35% พาโนรามา 3:1",
  refinedPrompt: "Pink floral Nain bookstore campaign banner, 35% off, book covers, 3:1",
  summary: "ป้ายลด 35% โทนชมพู",
  width: 2048,
  height: 688,
  aspectRatio: "3:1",
  outputElementId: "gen-output-1",
  outputFileId: "gen-file-1",
  ingredients: [
    { objectId: "cover-a", fileId: "cover-a-file", displayName: "Cover A" },
    { objectId: "cover-b", fileId: "cover-b-file", displayName: "Cover B" },
  ],
  campaignNotes: "Nain ลดโค้งสุดท้ายก่อนหมดลิขสิทธิ์ 35%",
};

describe("image follow-up memory", () => {
  it("classifies 'ปรับเป็นแนวตั้ง' as a revision follow-up", () => {
    expect(classifyImageFollowUpPrompt("ปรับเป็นแนวตั้ง")).toBe("revision");
    expect(classifyImageFollowUpPrompt("สร้างมาอีก 3 รูป")).toBe("variation");
  });

  it("follow-up without attachments still gets prior ingredients + last output", () => {
    const elements = [
      photo("cover-a", "cover-a-file", "Cover A"),
      photo("cover-b", "cover-b-file", "Cover B"),
      photo("gen-output-1", "gen-file-1", "Generated banner"),
    ];

    const bound = resolveFollowUpImageRefs({
      elements,
      prior: nainPackage,
      userRefs: [],
      maxRefs: 4,
    });

    expect(bound.carriedForward).toBe(true);
    expect(bound.usedOutput).toBe(true);
    expect(bound.usedIngredients).toBe(true);
    expect(bound.refs.map((ref) => ref.objectId)).toEqual(["gen-output-1", "cover-a", "cover-b"]);
    expect(bound.refs[0]?.fileId).toBe("gen-file-1");
  });

  it("does not invent ingredients that were not in the prior package", () => {
    const elements = [
      photo("cover-a", "cover-a-file", "Cover A"),
      photo("unrelated", "unrelated-file", "Random photo"),
      photo("gen-output-1", "gen-file-1", "Generated banner"),
    ];
    const bound = resolveFollowUpImageRefs({
      elements,
      prior: nainPackage,
      userRefs: [],
    });
    expect(bound.refs.map((ref) => ref.objectId)).toEqual(["gen-output-1", "cover-a"]);
    expect(bound.refs.some((ref) => ref.objectId === "unrelated")).toBe(false);
  });

  it("keeps user attachments instead of auto-injecting the last package", () => {
    const elements = [
      photo("cover-a", "cover-a-file", "Cover A"),
      photo("new-ref", "new-file", "New ref"),
      photo("gen-output-1", "gen-file-1", "Generated banner"),
    ];
    const userRefs = snapshotIngredients([
      { objectId: "new-ref", fileId: "new-file", displayName: "New ref" },
    ]);
    const bound = resolveFollowUpImageRefs({
      elements,
      prior: nainPackage,
      userRefs: [
        {
          objectId: "new-ref",
          elementVersion: 1,
          fileId: "new-file",
          displayName: "New ref",
          sourceWidth: 200,
          sourceHeight: 200,
          width: 200,
          height: 200,
          angle: 0,
        },
      ],
    });
    expect(bound.carriedForward).toBe(false);
    expect(bound.refs.map((ref) => ref.objectId)).toEqual(["new-ref"]);
    expect(userRefs[0]?.objectId).toBe("new-ref");
  });

  it("composes a revision director prompt with package, ingredients, and recall", () => {
    const composed = composeFollowUpDirectorPrompt("ปรับเป็นแนวตั้ง", nainPackage, {
      kind: "revision",
      recall: {
        summary: "แคมเปญ Nain ชมพู ลด 35% จากปกหนังสือที่แนบไว้ ต้องคง copy และโทน",
        followUpIntent: "Rebuild the same campaign as a 1:3 vertical banner",
        agreedConstraints: ["คงข้อความลด 35%", "โทนชมพูดอกไม้"],
        priorExactSize: "3:1",
        resolvedExactSize: "1:3",
        aspectOverride: "1:3",
      },
    });
    expect(composed).toContain("ปรับเป็นแนวตั้ง");
    expect(composed).toContain("LAST IMAGE GENERATION PACKAGE");
    expect(composed).toContain("Cover A");
    expect(composed).toContain("cover-a");
    expect(composed).toContain("gen-output-1");
    expect(composed).toContain("SMART RECALL");
    expect(composed).toContain("Resolved generation size (authoritative): 1:3");
    expect(composed).toContain("This is a REVISION");
    expect(composed).toContain("Never invent extra reference photos");
    expect(composed).not.toContain("Random extra book");
  });

  it("serializes recent chat with the last generation package instead of truncating to 12", () => {
    const messages = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `turn ${index} pink floral Nain campaign 35% off`,
      ...(index === 21
        ? {
            generationContext: nainPackage,
          }
        : {}),
    }));
    const history = toContinuityHistory(messages);
    const serialized = serializeConversationHistoryForDirector(history, {
      currentPrompt: "ปรับเป็นแนวตั้ง",
    });
    expect(serialized.length).toBe(DIRECTOR_CONVERSATION_HISTORY_LIMIT);
    expect(serialized.some((row) => row.content.includes("LAST IMAGE GENERATION PACKAGE"))).toBe(
      true,
    );
    expect(serialized.some((row) => row.content.includes("Cover A"))).toBe(true);
  });
});

describe("AICoPilotBar follow-up wiring", () => {
  it("recalls with Gemini 3 Flash then binds prior refs on short follow-ups", () => {
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
    expect(barSource).toContain("Memory Recall");
    expect(barSource).toContain("FOLLOW_UP_RECALL_STATUS_MESSAGE");
    expect(barSource).toContain("await recallFollowUpContext");
    expect(barSource).toContain("recall: followUpRecall");
    expect(barSource.indexOf("await recallFollowUpContext")).toBeLessThan(
      barSource.indexOf("await prepareRemoteCreativeDirection"),
    );
    expect(barSource.indexOf("await prepareRemoteCreativeDirection")).toBeLessThan(
      barSource.indexOf("createDirectedImageRun(contextDecision.input, direction)"),
    );
    expect(barSource).toContain("resolveFollowUpImageRefs");
    expect(barSource).toContain("serializeConversationHistoryForDirector");
    expect(barSource).toContain("isFollowUpTurn");
    expect(barSource).toContain("lastGeneration: priorGeneration");
    expect(barSource).toContain("insertedRefs: userAttachedRefs");
    expect(barSource).toContain("priorGeneration,");
    expect(barSource).toMatch(/createDirectedImageTask\(\s*\{[\s\S]*?prompt: promptToSend/);
    expect(barSource).toContain("conversationHistory: historyForContinuity");
    expect(barSource).not.toContain("florenceModelStep");
    expect(barSource).not.toContain("skip director");
    expect(barSource).not.toMatch(/from\s+["']@\/lib\/ai\/orchestration\/imageExpand["']/);
    expect(barSource).not.toMatch(/isExpandAspectPrompt\s*\(/);
    expect(barSource).not.toMatch(/await\s+expandImageToAspectRatio\s*\(/);
    expect(barSource).toContain("holdGeminiStepVisible");
    const recallCall = barSource.indexOf("await recallFollowUpContext");
    const directorCall = barSource.indexOf("await prepareRemoteCreativeDirection");
    const imageRunCall = barSource.indexOf(
      "createDirectedImageRun(contextDecision.input, direction)",
    );
    const holdAfterRecall = barSource.indexOf("await holdGeminiStepVisible", recallCall);
    const holdAfterDirector = barSource.indexOf("await holdGeminiStepVisible", directorCall);
    expect(recallCall).toBeGreaterThan(-1);
    expect(holdAfterRecall).toBeGreaterThan(recallCall);
    expect(holdAfterRecall).toBeLessThan(directorCall);
    expect(holdAfterDirector).toBeGreaterThan(directorCall);
    expect(holdAfterDirector).toBeLessThan(imageRunCall);
  });
});

describe("coPilot follow-up wiring", () => {
  it("runs Gemini recall before Creative Director on short image follow-ups", () => {
    const coPilotSource = readFileSync("lib/ai/coPilot.ts", "utf8");
    expect(coPilotSource).toContain("await recallFollowUpContext");
    expect(coPilotSource).toContain("insertedRefs:");
    expect(coPilotSource).toContain("recall: followUpRecall");
    expect(coPilotSource.indexOf("await recallFollowUpContext")).toBeLessThan(
      coPilotSource.indexOf("await prepareRemoteCreativeDirection"),
    );
  });
});

describe("special-size asks stay on the Gemini 3-step path", () => {
  it("treats 29x7cm resize as recall+Director work, not an expand-now skip", () => {
    const special = "@Photo ปรับไซส์เป็น 29x7cm";
    expect(isExpandAspectPrompt(special)).toBe(false);
    expect(isSizeAdjustFollowUpPrompt(special)).toBe(true);
    expect(classifyImageFollowUpPrompt(special)).toBe("revision");

    const run = createDirectedImageRun(
      { prompt: special, refs: [], analyses: [] },
      {
        kind: "image-task",
        outputCount: 1,
        requestedOutputCount: 5,
        summary: "Director invented five 29x7 variants",
        refinedPrompt: "Rebuild the last campaign at 29x7cm",
        specialist: "image_editor",
        capability: "IMAGE_EDIT",
        modelAlias: "image-gpt-2",
        knowledgeSkillIds: [],
        reviewCriteria: ["Keep campaign copy"],
        search: { required: false, queries: [], sources: [] },
        outputBriefs: ["1", "2", "3", "4", "5"],
      },
    );
    expect(run.requestedOutputCount).toBe(1);
    expect(run.tasks[0]?.requestedDimensions?.ratioClamped).toBe(true);
    expect(run.tasks[0]?.requestedDimensions?.sizeLabel).toBe("29x7cm");
    expect(
      (run.tasks[0]?.requestedDimensions?.printWidth ?? 0) /
        (run.tasks[0]?.requestedDimensions?.printHeight ?? 1),
    ).toBeCloseTo(29 / 7, 2);
  });
});

describe("size follow-up still outpaints after planning", () => {
  it("image task runner expands ratio-clamped prints after generate, not in the chat bar", () => {
    const runnerSource = readFileSync("lib/ai/orchestration/imageTaskRunner.ts", "utf8");
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
    expect(runnerSource).toContain("expandImageToAspectRatio");
    expect(runnerSource.indexOf("generateAIImage")).toBeLessThan(
      runnerSource.indexOf("expandImageToAspectRatio"),
    );
    expect(runnerSource).toContain("ratioClamped");
    expect(barSource).not.toMatch(/from\s+["']@\/lib\/ai\/orchestration\/imageExpand["']/);
    expect(barSource).not.toMatch(/await\s+expandImageToAspectRatio\s*\(/);
    expect(barSource).toContain("Memory Recall → Director → image");
  });
});
