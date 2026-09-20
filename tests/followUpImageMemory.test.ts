import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyImageFollowUpPrompt,
  composeFollowUpDirectorPrompt,
  DIRECTOR_CONVERSATION_HISTORY_LIMIT,
  resolveFollowUpImageRefs,
  serializeConversationHistoryForDirector,
  snapshotIngredients,
  toContinuityHistory,
} from "@/lib/ai/orchestration/chatContinuity";
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
        followUpIntent: "Rebuild the same campaign as a 9:16 vertical poster",
        agreedConstraints: ["คงข้อความลด 35%", "โทนชมพูดอกไม้"],
      },
    });
    expect(composed).toContain("ปรับเป็นแนวตั้ง");
    expect(composed).toContain("LAST IMAGE GENERATION PACKAGE");
    expect(composed).toContain("Cover A");
    expect(composed).toContain("cover-a");
    expect(composed).toContain("gen-output-1");
    expect(composed).toContain("SMART RECALL");
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
    expect(barSource).toContain("recallFollowUpContext");
    expect(barSource).toContain("resolveFollowUpImageRefs");
    expect(barSource).toContain("serializeConversationHistoryForDirector");
    expect(barSource).toContain("isFollowUpTurn");
    expect(barSource).not.toContain("florenceModelStep");
  });
});
