import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Moodboard AI ×9 surface", () => {
  it("exposes Moodboard control on Infinity Canvas with stock + AI actions", () => {
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    const control = readFileSync("components/Moodboard/MoodboardControl.tsx", "utf8");
    const client = readFileSync("lib/moodboard/aiBatchClient.ts", "utf8");

    expect(editor).toContain("MoodboardControl");
    expect(editor).toContain("currentSlideIsInfinity");
    expect(control).toContain("AI ×9");
    expect(control).toContain("Stock");
    expect(control).toContain("runMoodboardAiBatch");
    expect(control).toContain("runMoodboardStockFill");
    expect(client).toContain("/api/moodboard/expand");
    expect(client).toContain("/api/moodboard/generate");
    expect(client).toContain("flux-schnell");
    expect(client).toContain("addElements(placedElements");
    expect(client).toContain("3×3");
    const expandRoute = readFileSync("app/api/moodboard/expand/route.ts", "utf8");
    expect(expandRoute).toContain('modelAlias: "creative-director"');
    expect(expandRoute).not.toContain("image.generate");
  });

  it("defaults Moodboard generation to cheap Official Schnell, not premium models", () => {
    const constants = readFileSync("lib/moodboard/constants.ts", "utf8");
    const generate = readFileSync("app/api/moodboard/generate/route.ts", "utf8");
    const adapter = readFileSync("lib/server/ai/adapters/replicateAdapter.ts", "utf8");
    const manifest = readFileSync("lib/server/ai/modelManifest.ts", "utf8");
    const docs = readFileSync("docs/AI_RUNTIME.md", "utf8");
    const expandPrompt = readFileSync("lib/moodboard/expandPrompt.ts", "utf8");

    expect(constants).toContain("black-forest-labs/flux-schnell");
    expect(constants).toContain("0.003");
    expect(constants).toContain("0.027");
    expect(constants).toContain("Gemini Flash");
    expect(expandPrompt).toContain("Gemini Flash");
    expect(expandPrompt).toContain("กรุงเทพฯ");
    expect(generate).toContain("modelAlias: MOODBOARD_REPLICATE_MODEL_ALIAS");
    expect(generate).toContain("requireEndUserCloudAi");
    expect(adapter).toContain("black-forest-labs/flux-schnell");
    expect(adapter).toContain("generateFluxSchnellImage");
    expect(manifest).toContain('"flux-schnell"');
    expect(docs).toContain("Moodboard AI ×9");
    expect(docs).toContain("Gemini Flash");
    expect(generate).not.toContain("ideogram");
    expect(generate).not.toContain("gpt-image");
    expect(generate).not.toContain("flux-pro");
  });

  it("keeps the stock keyword path wired separately from Replicate AI", () => {
    const stockApi = readFileSync("app/api/stock/route.ts", "utf8");
    const stockHelper = readFileSync("lib/moodboard/stock.ts", "utf8");
    const client = readFileSync("lib/moodboard/aiBatchClient.ts", "utf8");

    expect(stockApi).toContain('source === "unsplash"');
    expect(stockApi).toContain('source === "pexels"');
    expect(stockHelper).toContain("/api/stock");
    expect(client).toContain("runMoodboardStockFill");
    expect(client).toContain("searchStockPhotos");
  });
});
