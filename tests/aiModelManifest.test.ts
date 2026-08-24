import { describe, expect, it } from "vitest";
import { createAiRouteTable } from "@/lib/server/ai/modelManifest";

describe("AI model manifest", () => {
  it("pins Replicate wrappers behind stable ArtShift aliases", () => {
    const routes = createAiRouteTable({
      REPLICATE_GPT4O_MINI_VERSION: "a".repeat(64),
      REPLICATE_GEMINI_3_FLASH_VERSION: "b".repeat(64),
    });

    expect(routes["vision.describe"]?.economy?.[0]).toMatchObject({
      provider: "replicate",
      model: `openai/gpt-4o-mini@${"a".repeat(64)}`,
      alias: "vision-economy",
    });
    expect(routes["vision.propose"]?.quality?.[0]).toMatchObject({
      provider: "replicate",
      model: `google/gemini-3-flash@${"b".repeat(64)}`,
      alias: "vision-quality",
    });
  });

  it("does not route local Remove BG, Extract or raster selection through cloud providers", () => {
    const serialized = JSON.stringify(createAiRouteTable({}));
    expect(serialized).not.toMatch(/remove.?bg|extract.?objects|pixel.?mask|raster.?selection/i);
    expect(serialized).not.toContain("https://");
  });

  it("maps UI image presets to allowlisted server aliases", () => {
    const aliases = createAiRouteTable({})["image.generate"]?.economy?.map(
      (target) => target.alias,
    );
    expect(aliases).toEqual([
      "image-primary",
      "image-realism",
      "image-anime",
      "image-3d",
      "image-fast",
    ]);
  });
});
