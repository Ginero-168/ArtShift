import { describe, expect, it } from "vitest";
import {
  buildLocalFollowUpRecall,
  parseFollowUpRecallPayload,
} from "@/lib/ai/orchestration/followUpRecall";

const lastGeneration = {
  userPrompt: "ป้าย Nain โทนชมพู ลด 35% จากปกหนังสือ",
  refinedPrompt: "Pink floral Nain 35% off campaign with attached book covers",
  summary: "ป้ายลด 35%",
  width: 2048,
  height: 688,
  aspectRatio: "3:1",
  outputElementId: "out-1",
  outputFileId: "file-out-1",
  ingredients: [
    { objectId: "cover-a", fileId: "file-a", displayName: "Cover A" },
    { objectId: "cover-b", fileId: "file-b", displayName: "Cover B" },
  ],
  campaignNotes: "คง copy ลด 35% และโลโก้ Nain",
};

describe("follow-up recall", () => {
  it("builds a local fallback from chat + structured package without inventing ingredients", () => {
    const recall = buildLocalFollowUpRecall({
      followUpPrompt: "ปรับเป็นแนวตั้ง",
      conversationHistory: [
        { role: "user", content: "ทำป้ายโปรโมชัน Nain โทนชมพูดอกไม้ ลด 35%" },
        { role: "assistant", content: "สร้างป้ายแนวนอนแล้วครับ" },
      ],
      lastGeneration,
    });
    expect(recall.source).toBe("local-fallback");
    expect(recall.summary).toContain("Nain");
    expect(recall.summary).toContain("Cover A");
    expect(recall.followUpIntent).toContain("ปรับเป็นแนวตั้ง");
    expect(recall.keepIngredients).toBe(true);
    expect(recall.summary).not.toContain("Cover C");
  });

  it("parses Gemini JSON but ignores invented ingredient ids from the model", () => {
    const raw = JSON.stringify({
      summary: "Keep the pink Nain 35% campaign and rebuild vertical.",
      agreedConstraints: ["35% off", "pink floral"],
      styleNotes: "bright pink",
      campaignNotes: "Nain copyright ending sale",
      followUpIntent: "Make the last banner 9:16",
      keepCopy: true,
      keepIngredients: true,
      ingredients: [{ objectId: "hallucinated-cover", displayName: "Fake Cover" }],
    });
    const parsed = parseFollowUpRecallPayload(raw, {
      followUpPrompt: "ปรับเป็นแนวตั้ง",
      lastGeneration,
    });
    expect(parsed.source).toBe("cloud-api");
    expect(parsed.summary).toContain("pink Nain");
    expect(parsed.followUpIntent).toContain("9:16");
    expect(JSON.stringify(parsed)).not.toContain("hallucinated-cover");
    expect(JSON.stringify(parsed)).not.toContain("Fake Cover");
  });

  it("falls back locally when Gemini returns non-JSON", () => {
    const parsed = parseFollowUpRecallPayload("sorry I cannot help", {
      followUpPrompt: "make it vertical",
      lastGeneration,
    });
    expect(parsed.source).toBe("local-fallback");
    expect(parsed.summary).toContain("Cover A");
  });
});
