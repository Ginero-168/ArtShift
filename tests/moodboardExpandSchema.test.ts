import { describe, expect, it } from "vitest";
import { MOODBOARD_AI_BATCH_COUNT } from "@/lib/moodboard/constants";
import { parseMoodboardExpandJson } from "@/lib/moodboard/expandSchema";

describe("moodboard expand schema", () => {
  it("parses exactly 9 distinct idea prompts", () => {
    const prompts = Array.from({ length: 9 }, (_, i) => ({
      index: i + 1,
      subject: `subject ${i + 1}`,
      setting: `setting ${i + 1}`,
      prop: `prop ${i + 1}`,
      mood: `mood ${i + 1}`,
      colorStyle: `color ${i + 1}`,
      prompt: `Unique moodboard frame number ${i + 1} with different facets.`,
    }));

    const parsed = parseMoodboardExpandJson({
      keyword: "Bangkok night",
      prompts,
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.prompts).toHaveLength(MOODBOARD_AI_BATCH_COUNT);
    expect(new Set(parsed.pack.prompts.map((p) => p.prompt)).size).toBe(9);
    expect(parsed.pack.prompts[0]?.prompt).not.toBe(parsed.pack.prompts[1]?.prompt);
  });

  it("rejects empty prompts and fills to 9 from a short list", () => {
    const parsed = parseMoodboardExpandJson({
      keyword: "ice",
      prompts: [{ index: 1, prompt: "Crushed ice in a matcha glass" }],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.prompts).toHaveLength(9);
    expect(parsed.pack.prompts.every((p) => p.prompt.trim().length > 0)).toBe(true);
  });

  it("synthesizes 9 prompts from legacy role buckets", () => {
    const parsed = parseMoodboardExpandJson({
      keyword: "Bangkok",
      associations: ["tuk-tuk", "night market", "saffron"],
      roles: {
        subject: [{ label: "tuk-tuk" }],
        setting: [{ label: "night market" }],
        prop: [{ label: "plastic stool" }],
        mood: [{ label: "humid night" }],
        color: [{ label: "saffron", hex: "#e2a100" }],
      },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.prompts).toHaveLength(9);
    expect(parsed.pack.prompts.some((p) => /tuk-tuk|night market|saffron/i.test(p.prompt))).toBe(
      true,
    );
  });

  it("does not treat nine identical user-keyword copies as unique when duplicates drop", () => {
    const parsed = parseMoodboardExpandJson({
      keyword: "coffee",
      prompts: Array.from({ length: 9 }, () => ({
        index: 1,
        prompt: "coffee",
      })),
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    // Duplicate identical prompts are skipped; filler restores 9 distinct strings.
    expect(parsed.pack.prompts).toHaveLength(9);
    expect(new Set(parsed.pack.prompts.map((p) => p.prompt.toLowerCase())).size).toBe(9);
  });

  it("fills and slices to the requested 16 or 25", () => {
    const sixteen = parseMoodboardExpandJson(
      {
        keyword: "ice",
        prompts: [{ index: 1, prompt: "Crushed ice in a matcha glass" }],
      },
      16,
    );
    expect(sixteen.ok).toBe(true);
    if (!sixteen.ok) return;
    expect(sixteen.pack.prompts).toHaveLength(16);

    const tooMany = Array.from({ length: 25 }, (_, i) => ({
      index: i + 1,
      prompt: `Frame ${i + 1} only`,
    }));
    const nine = parseMoodboardExpandJson({ keyword: "ice", prompts: tooMany }, 9);
    expect(nine.ok).toBe(true);
    if (!nine.ok) return;
    expect(nine.pack.prompts).toHaveLength(9);

    const twentyFive = parseMoodboardExpandJson({ keyword: "ice", prompts: tooMany }, 25);
    expect(twentyFive.ok).toBe(true);
    if (!twentyFive.ok) return;
    expect(twentyFive.pack.prompts).toHaveLength(25);
  });
});
