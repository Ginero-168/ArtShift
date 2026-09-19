import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  flattenStockQueries,
  isQuantityFirstPack,
  parseMoodboardExpandJson,
  plannedBoardItemCount,
} from "@/lib/moodboard/expandSchema";
import { fillMoodboardFromPack } from "@/lib/moodboard/fill";
import { parseJsonCandidate, safeModelTextPreview } from "@/lib/moodboard/json";

const SAMPLE = {
  keyword: "Bangkok",
  associations: ["tuk-tuk", "Giant Swing", "street food", "temples", "night market"],
  roles: {
    subject: [
      { label: "tuk-tuk", query: "bangkok tuk-tuk street", photoCount: 2 },
      { label: "monk", query: "thai monk saffron robe", photoCount: 1 },
      { label: "vendor", query: "bangkok street food vendor", photoCount: 1 },
      { label: "motorbike taxi", query: "bangkok motorbike taxi", photoCount: 1 },
      { label: "dancer", query: "thai traditional dancer", photoCount: 1 },
    ],
    setting: [
      { label: "Giant Swing", query: "giant swing bangkok", photoCount: 1 },
      { label: "temple", query: "wat arun bangkok", photoCount: 1 },
      { label: "night market", query: "bangkok night market lights", photoCount: 1 },
      { label: "canal", query: "bangkok khlong canal", photoCount: 1 },
      { label: "alley", query: "yaowarat alley night", photoCount: 1 },
    ],
    prop: [
      { label: "plastic stool", query: "thai plastic stool street food", photoCount: 1 },
      { label: "garland", query: "thai flower garland", photoCount: 1 },
      { label: "umbrella", query: "colorful market umbrella thailand", photoCount: 1 },
      { label: "lotus", query: "lotus offering temple", photoCount: 1 },
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
};

describe("moodboard expand JSON shape", () => {
  it("parses vibe associations into the five locked roles", () => {
    const parsed = parseMoodboardExpandJson(JSON.stringify(SAMPLE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.associations).toContain("Giant Swing");
    expect(parsed.pack.roles.subject).toHaveLength(5);
    expect(parsed.pack.roles.setting).toHaveLength(5);
    expect(parsed.pack.roles.prop).toHaveLength(4);
    expect(parsed.pack.roles.mood).toHaveLength(6);
    expect(parsed.pack.roles.color).toHaveLength(5);
    expect(plannedBoardItemCount(parsed.pack)).toBeGreaterThanOrEqual(18);
    expect(isQuantityFirstPack(parsed.pack)).toBe(true);
    expect(flattenStockQueries(parsed.pack).every((query) => query.length > 0)).toBe(true);
  });

  it("accepts fenced model output and rejects empty roles", () => {
    const fenced = parseMoodboardExpandJson(
      `here you go\n\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``,
    );
    expect(fenced.ok).toBe(true);
    expect(parseMoodboardExpandJson({ keyword: "ice" }).ok).toBe(false);
  });

  it("extracts the first JSON object from leading prose", () => {
    const messy = `Sure — here is a Bangkok moodboard pack.\n${JSON.stringify(SAMPLE)}\nLet me know if you want more night-market shots.`;
    const parsed = parseMoodboardExpandJson(messy);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.keyword).toBe("Bangkok");
    expect(parsed.pack.roles.subject[0]?.label).toBe("tuk-tuk");
  });

  it("tolerates trailing commas in role arrays", () => {
    const withCommas = JSON.stringify(SAMPLE)
      .replace(/\}(\s*)\]/g, "},$1]")
      .replace(/\](\s*)\}/g, "],$1}");
    const parsed = parseMoodboardExpandJson(withCommas);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.keyword).toBe("Bangkok");
  });

  it("unwraps the ArtShift kind/text envelope when JSON is inside text", () => {
    const envelope = JSON.stringify({
      kind: "text",
      text: `Here you go:\n\`\`\`json\n${JSON.stringify(SAMPLE)}\n\`\`\``,
    });
    const parsed = parseMoodboardExpandJson(envelope);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.keyword).toBe("Bangkok");
    expect(parsed.pack.roles.setting.some((item) => item.label === "Giant Swing")).toBe(true);
  });

  it("keeps sibling keyword/roles when the chat envelope wraps the pack", () => {
    const envelope = { kind: "text", text: "Expanded Bangkok.", ...SAMPLE };
    const parsed = parseMoodboardExpandJson(envelope);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.associations).toContain("tuk-tuk");
  });

  it("parses a double-encoded JSON string", () => {
    const parsed = parseMoodboardExpandJson(JSON.stringify(JSON.stringify(SAMPLE)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.pack.keyword).toBe("Bangkok");
  });

  it("fills placeholders when stock is missing and never mentions gen-image paths", async () => {
    const parsed = parseMoodboardExpandJson(SAMPLE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const items = await fillMoodboardFromPack(parsed.pack, {
      fetchImpl: async () => new Response(JSON.stringify({ results: [] }), { status: 200 }),
      rng: () => 0.5,
    });
    expect(items.length).toBeGreaterThanOrEqual(18);
    expect(items.some((item) => item.kind === "placeholder")).toBe(true);
    expect(items.every((item) => item.kind !== "image" || item.credit)).toBe(true);

    const fillSrc = readFileSync("lib/moodboard/fill.ts", "utf8");
    const clientSrc = readFileSync("lib/moodboard/expandClient.ts", "utf8");
    const stockSrc = readFileSync("lib/moodboard/stock.ts", "utf8");
    for (const src of [fillSrc, clientSrc, stockSrc]) {
      expect(src).not.toContain("/api/ai/image");
      expect(src).not.toContain("/api/generate");
      expect(src).not.toContain("image.generate");
      expect(src).not.toContain("generateAIImage");
    }
    expect(stockSrc).toContain("/api/stock");
  });

  it("extracts the first balanced object and redacts secrets in previews", () => {
    const extracted = parseJsonCandidate(
      'Note: ignore {"noise":true} after the pack.\n{"keyword":"Bangkok","keep":true} trailing prose',
    );
    expect(extracted).toEqual({ noise: true });

    const preview = safeModelTextPreview(
      "Expanded Bangkok. token=r8_account-token Bearer abc.def more text",
    );
    expect(preview).toContain("Expanded Bangkok.");
    expect(preview).not.toContain("r8_account-token");
    expect(preview).toContain("[redacted]");
    expect(safeModelTextPreview("")).toBe("(empty)");
  });
});
