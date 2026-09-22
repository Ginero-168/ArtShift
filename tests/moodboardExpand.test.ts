import { describe, expect, it } from "vitest";
import { MOODBOARD_IMAGE_COUNT } from "@/lib/moodboard/constants";
import {
  parseMoodboardExpandJson,
  selectMoodboardImagePrompts,
  synthesizeExpandPack,
} from "@/lib/moodboard/expandSchema";
import { looksTruncatedJson, parseJsonCandidate, safeModelTextPreview } from "@/lib/moodboard/json";

const SAMPLE = {
  keyword: "Bangkok",
  associations: ["tuk-tuk", "Giant Swing", "street food", "temples", "night market"],
  roles: {
    subject: [
      { label: "tuk-tuk", query: "bangkok tuk-tuk street" },
      { label: "monk", query: "thai monk saffron robe" },
      { label: "vendor", query: "bangkok street food vendor" },
      { label: "motorbike taxi", query: "bangkok motorbike taxi" },
      { label: "dancer", query: "thai traditional dancer" },
    ],
    setting: [
      { label: "Giant Swing", query: "giant swing bangkok" },
      { label: "temple", query: "wat arun bangkok" },
      { label: "night market", query: "bangkok night market lights" },
      { label: "canal", query: "bangkok khlong canal" },
      { label: "alley", query: "yaowarat alley night" },
    ],
    prop: [
      { label: "plastic stool", query: "thai plastic stool street food" },
      { label: "garland", query: "thai flower garland" },
      { label: "umbrella", query: "colorful market umbrella thailand" },
      { label: "lotus", query: "lotus offering temple" },
    ],
    mood: [
      { label: "humid night" },
      { label: "golden hour" },
      { label: "neon haze" },
      { label: "incense" },
      { label: "crowded" },
      { label: "late snack" },
    ],
    color: [
      { label: "saffron", hex: "#e2a100" },
      { label: "temple gold", hex: "#d4af37" },
      { label: "night teal", hex: "#0f766e" },
      { label: "chili red", hex: "#dc2626" },
      { label: "ivory", hex: "#f8f1e3" },
    ],
  },
  imagePrompts: [
    {
      label: "tuk-tuk neon",
      role: "subject",
      prompt: "Bangkok tuk-tuk under neon rain, upright photo",
    },
    { label: "Giant Swing dusk", role: "setting", prompt: "Giant Swing at dusk with saffron sky" },
    { label: "plastic stool", role: "prop", prompt: "Thai plastic stool at street food stall" },
    { label: "humid night", role: "mood", prompt: "Humid neon Bangkok night alley atmosphere" },
    {
      label: "saffron robe",
      role: "color",
      prompt: "Close-up saffron robe texture in temple light",
    },
    { label: "night market", role: "setting", prompt: "Crowded Bangkok night market food stalls" },
    { label: "lotus offering", role: "prop", prompt: "Lotus flower offering on temple steps" },
    {
      label: "motorbike taxi",
      role: "subject",
      prompt: "Motorbike taxi weaving through Bangkok traffic",
    },
    {
      label: "canal ferry",
      role: "setting",
      prompt: "Khlong canal ferry under tangled power lines",
    },
  ],
};

describe("moodboard expand → 9 image prompts contract", () => {
  it("parses vibe associations and exactly 9 image prompts", () => {
    const parsed = parseMoodboardExpandJson(JSON.stringify(SAMPLE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.associations).toContain("Giant Swing");
    expect(parsed.pack.roles.subject).toHaveLength(5);
    expect(parsed.pack.imagePrompts).toHaveLength(MOODBOARD_IMAGE_COUNT);
    expect(new Set(parsed.pack.imagePrompts.map((item) => item.prompt)).size).toBe(
      MOODBOARD_IMAGE_COUNT,
    );
  });

  it("accepts fenced model output and rejects keyword-only objects", () => {
    const fenced = parseMoodboardExpandJson(
      `here you go\n\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``,
    );
    expect(fenced.ok).toBe(true);
    expect(parseMoodboardExpandJson({ keyword: "ice" }).ok).toBe(false);
  });

  it("synthesizes exactly 9 prompts when imagePrompts are missing", () => {
    const withoutPrompts = { ...SAMPLE, imagePrompts: undefined };
    const parsed = parseMoodboardExpandJson(JSON.stringify(withoutPrompts));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.imagePrompts).toHaveLength(MOODBOARD_IMAGE_COUNT);
    expect(parsed.pack.imagePrompts.every((item) => item.prompt.length > 10)).toBe(true);
  });

  it("repairs truncated associations and still yields 9 prompts", () => {
    const truncated =
      '{"keyword":"Bangkok","associations":["saffron robes","tangled power lines","pink taxis","jasmine garlands","gold leaf","plastic stools","neon signs","river ferries","incense smoke","humidity","chili flakes",';
    const parsed = parseMoodboardExpandJson(truncated);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.keyword).toBe("Bangkok");
    expect(parsed.pack.imagePrompts).toHaveLength(MOODBOARD_IMAGE_COUNT);
  });

  it("selectMoodboardImagePrompts always returns exactly 9 distinct prompts", () => {
    const pack = synthesizeExpandPack("ice", ["matcha glass ice", "snowman", "North Pole"]);
    expect(pack.imagePrompts).toHaveLength(MOODBOARD_IMAGE_COUNT);
    const selected = selectMoodboardImagePrompts(pack);
    expect(selected).toHaveLength(MOODBOARD_IMAGE_COUNT);
    expect(new Set(selected.map((item) => item.prompt.toLowerCase())).size).toBe(
      MOODBOARD_IMAGE_COUNT,
    );
  });

  it("redacts secrets in model text previews", () => {
    expect(safeModelTextPreview("token r8_abc123DEF and more text here")).toContain("[redacted]");
    expect(looksTruncatedJson('{"keyword":"x","imagePrompts":[')).toBe(true);
    expect(parseJsonCandidate(`\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``)).toMatchObject({
      keyword: "Bangkok",
    });
  });
});
