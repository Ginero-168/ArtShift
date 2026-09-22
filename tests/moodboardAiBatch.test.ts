import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Moodboard AI surface", () => {
  it("exposes Moodboard control on Infinity Canvas with AI batch sizes and no stock action", () => {
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    const control = readFileSync("components/Moodboard/MoodboardControl.tsx", "utf8");
    const client = readFileSync("lib/moodboard/aiBatchClient.ts", "utf8");

    expect(editor).toContain("MoodboardControl");
    expect(editor).toContain("currentSlideIsInfinity");
    expect(control).toContain("AI ×");
    expect(control).toContain("moodboard-batch-count");
    expect(control).toContain("aria-expanded");
    expect(control).toContain("artshift:moodboard:controls-expanded");
    expect(control).toContain("runMoodboardAiBatch");
    expect(editor).toContain('data-moodboard-anchor="true"');
    expect(editor).not.toContain('maxWidth: "min(420px, calc(100% - 24px))"');
    expect(control).not.toContain("runMoodboardStockFill");
    expect(control).not.toContain(">Stock<");
    expect(client).toContain("/api/moodboard/expand");
    expect(client).toContain("/api/moodboard/generate");
    expect(client).toContain("gpt-image-2.5-flare");
    expect(client).toContain("getProcessingPreviewPlacement");
    expect(client).toContain("enqueueProcessingJob");
    expect(client).not.toContain("searchStockPhotos");
    expect(client).not.toContain("flux-schnell");
    const expandRoute = readFileSync("app/api/moodboard/expand/route.ts", "utf8");
    expect(expandRoute).toContain('modelAlias: "creative-director"');
    expect(expandRoute).not.toContain("image.generate");
  });

  it("defaults Moodboard generation to Flare low, not Schnell or Recraft", () => {
    const constants = readFileSync("lib/moodboard/constants.ts", "utf8");
    const generate = readFileSync("app/api/moodboard/generate/route.ts", "utf8");
    const adapter = readFileSync("lib/server/ai/adapters/replicateAdapter.ts", "utf8");
    const manifest = readFileSync("lib/server/ai/modelManifest.ts", "utf8");
    const docs = readFileSync("docs/AI_RUNTIME.md", "utf8");
    const expandPrompt = readFileSync("lib/moodboard/expandPrompt.ts", "utf8");

    expect(constants).toContain("openai/gpt-image-2.5-flare");
    expect(constants).toContain('export const MOODBOARD_IMAGE_QUALITY = "low"');
    expect(constants).toContain("0.012");
    expect(constants).not.toContain("0.047");
    expect(constants).not.toContain("flux-schnell");
    expect(constants).not.toContain("recraft-v3");
    expect(constants).toContain("Gemini Flash");
    expect(expandPrompt).toContain("Gemini Flash");
    expect(expandPrompt).toContain("กรุงเทพฯ");
    expect(generate).toContain("modelAlias: MOODBOARD_REPLICATE_MODEL_ALIAS");
    expect(generate).toContain("quality: MOODBOARD_IMAGE_QUALITY");
    expect(generate).toContain("requireEndUserCloudAi");
    expect(adapter).toContain("openai/gpt-image-2.5-flare");
    expect(adapter).toContain("generateMoodboardFlareImage");
    expect(adapter).toContain("quality: MOODBOARD_IMAGE_QUALITY");
    expect(adapter).not.toContain('quality: "medium"');
    expect(adapter).toContain('aspect_ratio: "1:1"');
    expect(adapter).toContain("number_of_images: 1");
    expect(adapter).not.toContain("flux-schnell");
    expect(manifest).toContain('"gpt-image-2.5-flare"');
    expect(manifest).not.toContain("flux-schnell");
    expect(docs).toContain("Moodboard AI");
    expect(docs).toContain("Gemini Flash");
    expect(docs).toContain("getProcessingPreviewPlacement");
    expect(generate).not.toContain("ideogram");
    expect(generate).not.toContain("flux-pro");
    expect(generate).not.toContain("recraft");
  });

  it("leaves shared stock search available outside Moodboard", () => {
    const stockApi = readFileSync("app/api/stock/route.ts", "utf8");
    const imagePanel = readFileSync("components/AIImagePanel.tsx", "utf8");
    const client = readFileSync("lib/moodboard/aiBatchClient.ts", "utf8");

    expect(stockApi).toContain('source === "unsplash"');
    expect(stockApi).toContain('source === "pexels"');
    expect(imagePanel).toContain("/api/stock");
    expect(client).not.toContain("/api/stock");
  });
});
