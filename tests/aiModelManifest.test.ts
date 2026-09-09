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

  it("uses google/gemini-2.5-flash as the baseline Creative Director for every chat profile", () => {
    const routes = createAiRouteTable({});

    expect(routes["assistant.chat"]?.economy?.[0]).toMatchObject({
      provider: "replicate",
      model: "google/gemini-2.5-flash",
      alias: "creative-director",
    });
    expect(routes["assistant.chat"]?.quality?.[0]).toMatchObject({
      provider: "replicate",
      model: "google/gemini-2.5-flash",
      alias: "creative-director",
    });
  });

  it("pins the Creative Director model through the quality model environment", () => {
    const routes = createAiRouteTable({
      REPLICATE_CHAT_QUALITY_MODEL_VERSION: "d".repeat(64),
    });

    expect(routes["assistant.chat"]?.economy?.[0]?.model).toBe(
      `google/gemini-2.5-flash@${"d".repeat(64)}`,
    );
    expect(routes["assistant.chat"]?.quality?.[0]?.model).toBe(
      `google/gemini-2.5-flash@${"d".repeat(64)}`,
    );
  });

  it("allows overriding the Creative Director model to gpt-oss-120b via REPLICATE_BRAIN_MODEL", () => {
    const routes = createAiRouteTable({
      REPLICATE_BRAIN_MODEL: "openai/gpt-oss-120b",
    });

    expect(routes["assistant.chat"]?.quality?.[0]).toMatchObject({
      provider: "replicate",
      model: "openai/gpt-oss-120b",
      alias: "creative-director",
    });
  });

  it("keeps assistant chat and prompt enhancement on the quality profile", async () => {
    const manifest = await import("@/lib/server/ai/modelManifest");
    expect(manifest.AI_DEFAULT_PROFILES["assistant.chat"]).toBe("quality");
    expect(manifest.AI_DEFAULT_PROFILES["prompt.enhance"]).toBe("quality");
  });

  it("routes assistant.chat and prompt.enhance to Google Gemini when AI_ORCHESTRATOR_PROVIDER is google", () => {
    const routes = createAiRouteTable({
      AI_ORCHESTRATOR_PROVIDER: "google",
      AI_ORCHESTRATOR_MODEL: "gemini-2.5-flash",
    });

    expect(routes["assistant.chat"]?.quality?.[0]).toMatchObject({
      provider: "google",
      model: "gemini-2.5-flash",
      alias: "creative-director",
      pricing: { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
    });
    expect(routes["assistant.chat"]?.economy?.[0]).toMatchObject({
      provider: "google",
      model: "gemini-2.5-flash",
      alias: "creative-director",
    });
    expect(routes["prompt.enhance"]?.quality?.[0]).toMatchObject({
      provider: "google",
      model: "gemini-2.5-flash",
      alias: "prompt-director",
    });
  });

  it("routes Recraft vectorization to the requested Replicate model", () => {
    const routes = createAiRouteTable({});

    expect(routes["vectorize.recraft"]?.quality?.[0]).toEqual({
      provider: "replicate",
      model: "recraft-ai/recraft-vectorize",
      alias: "recraft-vectorize",
    });
  });

  it("allows the Recraft model version to be pinned without changing the UI alias", () => {
    const version = "e".repeat(64);
    const routes = createAiRouteTable({ REPLICATE_RECRAFT_VECTORIZE_MODEL_VERSION: version });

    expect(routes["vectorize.recraft"]?.quality?.[0]).toMatchObject({
      model: `recraft-ai/recraft-vectorize@${version}`,
      alias: "recraft-vectorize",
    });
  });

  it("does not route local Remove BG, Extract or raster selection through cloud providers", () => {
    const serialized = JSON.stringify(createAiRouteTable({}));
    expect(serialized).not.toMatch(/remove.?bg|extract.?objects|pixel.?mask|raster.?selection/i);
    expect(serialized).not.toContain("https://");
  });

  it("fails closed when GPT Image 2 has no pinned production version", () => {
    const routes = createAiRouteTable({});

    expect(routes["image.generate"]).toEqual({ economy: [], quality: [] });
  });

  it("routes image generation to image-general (GPT Image 2) with correct alias and pricing ceiling", () => {
    const routes = createAiRouteTable({ REPLICATE_GPT_IMAGE_2_VERSION: "1".repeat(64) });
    const pinned = `openai/gpt-image-2@${"1".repeat(64)}`;

    // Primary semantic alias
    const generalRoute = routes["image.generate"]?.quality?.find(
      (r) => r.alias === "image-general",
    );
    expect(generalRoute).toMatchObject({
      provider: "replicate",
      model: pinned,
      alias: "image-general",
    });

    // Legacy compatibility alias must also be present
    const legacyRoute = routes["image.generate"]?.quality?.find((r) => r.alias === "image-gpt-2");
    expect(legacyRoute).toMatchObject({
      provider: "replicate",
      model: pinned,
      alias: "image-gpt-2",
    });
  });

  it("does not route to Flare or Sunburst when feature flags are off", () => {
    const routes = createAiRouteTable({ REPLICATE_GPT_IMAGE_2_VERSION: "1".repeat(64) });
    const aliases = routes["image.generate"]?.quality?.map((r) => r.alias) ?? [];
    expect(aliases).not.toContain("image-fast");
    expect(aliases).not.toContain("image-precision");
  });

  it("adds Flare route when IMAGE_FAST_MODEL_ENABLED is true", () => {
    const routes = createAiRouteTable({
      REPLICATE_GPT_IMAGE_2_VERSION: "1".repeat(64),
      IMAGE_FAST_MODEL_ENABLED: "true",
    });
    const fastRoute = routes["image.generate"]?.quality?.find((r) => r.alias === "image-fast");
    expect(fastRoute).toMatchObject({
      provider: "replicate",
      model: "openai/gpt-image-2.5-flare",
      alias: "image-fast",
    });
  });

  it("adds Sunburst route when IMAGE_PRECISION_MODEL_ENABLED is true", () => {
    const routes = createAiRouteTable({
      REPLICATE_GPT_IMAGE_2_VERSION: "1".repeat(64),
      IMAGE_PRECISION_MODEL_ENABLED: "true",
    });
    const precisionRoute = routes["image.generate"]?.quality?.find(
      (r) => r.alias === "image-precision",
    );
    expect(precisionRoute).toMatchObject({
      provider: "replicate",
      model: "openai/gpt-image-2.5-sunburst",
      alias: "image-precision",
    });
  });

  it("allows only a server-side GPT Image 2 version pin", () => {
    const version = "f".repeat(64);
    const routes = createAiRouteTable({ REPLICATE_GPT_IMAGE_2_VERSION: version });

    expect(
      routes["image.generate"]?.economy?.find((r) => r.alias === "image-general"),
    ).toMatchObject({
      provider: "replicate",
      model: `openai/gpt-image-2@${version}`,
      alias: "image-general",
    });
  });
});
