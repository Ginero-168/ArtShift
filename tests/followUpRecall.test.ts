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
    expect(recall.aspectOverride).toBe("1:3");
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
    expect(parsed.aspectOverride).toBe("1:3");
    expect(JSON.stringify(parsed)).not.toContain("hallucinated-cover");
    expect(JSON.stringify(parsed)).not.toContain("Fake Cover");
  });

  it("overrides Gemini 9:16 with swapped 7x29cm when the last size was custom", () => {
    const parsed = parseFollowUpRecallPayload(
      JSON.stringify({
        summary: "Rebuild vertical as 9:16",
        followUpIntent: "Make it 9:16",
        keepCopy: true,
        keepIngredients: true,
        aspectOverride: "9:16",
      }),
      {
        followUpPrompt: "ปรับเป็นแนวตั้ง",
        lastGeneration: {
          ...lastGeneration,
          userPrompt: "สร้างป้าย shelftalk 29x7 cm โทนชมพู ลด 35%",
          aspectRatio: "2048x688",
        },
      },
    );
    expect(parsed.aspectOverride).toMatch(/7x29/i);
    expect(parsed.aspectOverride).not.toBe("9:16");
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
