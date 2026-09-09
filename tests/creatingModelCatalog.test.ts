import { describe, expect, it } from "vitest";
import {
  CREATING_MODEL_CATALOG,
  detectRequestedCreatingModel,
  isQualitySupportedByAlias,
  resolveCreatingModel,
} from "@/lib/ai/orchestration/creatingModelCatalog";

describe("Creating model capability catalog", () => {
  it("routes current generation and editing to image-general (GPT Image 2)", () => {
    // Default is now image-general (was image-gpt-2)
    expect(resolveCreatingModel("generate")).toMatchObject({
      ok: true,
      model: { alias: "image-general", status: "available" },
    });
    expect(resolveCreatingModel("edit")).toMatchObject({
      ok: true,
      model: { alias: "image-general", status: "available" },
    });
  });

  it("keeps legacy image-gpt-2 alias available for migration compatibility", () => {
    expect(resolveCreatingModel("generate", "image-gpt-2")).toMatchObject({
      ok: true,
      model: { alias: "image-gpt-2", modelId: "openai/gpt-image-2" },
    });
  });

  it("keeps Flare and Sunburst unavailable until feature flags are set", () => {
    for (const alias of ["image-fast", "image-precision"]) {
      const entry = CREATING_MODEL_CATALOG.find((model) => model.alias === alias);
      expect(entry).toMatchObject({ status: "unavailable" });
      expect(resolveCreatingModel("generate", alias)).toMatchObject({
        ok: false,
        reason: "model-unavailable",
      });
    }
  });

  it("keeps unavailable aspirational models out of live routing", () => {
    for (const alias of [
      "nano-banana-pro",
      "flux-2-max",
      "flux-1.1-pro",
      "ideogram",
      "recraft-v3",
    ]) {
      const entry = CREATING_MODEL_CATALOG.find((model) => model.alias === alias);
      expect(entry).toMatchObject({ status: "unavailable" });
      expect(resolveCreatingModel("generate", alias)).toMatchObject({
        ok: false,
        reason: "model-unavailable",
      });
    }
  });

  it("does not silently substitute a user-requested unsupported model", () => {
    expect(resolveCreatingModel("generate", "flux-2-max")).toEqual({
      ok: false,
      reason: "model-unavailable",
      requestedAlias: "flux-2-max",
    });
    expect(resolveCreatingModel("generate", "unknown-model")).toEqual({
      ok: false,
      reason: "model-unknown",
      requestedAlias: "unknown-model",
    });
  });

  it("rejects raw model slug (arbitrary URL injection attempt)", () => {
    expect(resolveCreatingModel("generate", "openai/gpt-image-2")).toEqual({
      ok: false,
      reason: "model-unknown",
      requestedAlias: "openai/gpt-image-2",
    });
  });

  it("rejects xhigh quality on image-general (GPT Image 2 not supported)", () => {
    expect(resolveCreatingModel("generate", "image-general", "xhigh")).toMatchObject({
      ok: false,
      reason: "quality-unsupported",
    });
  });

  it("rejects max quality on image-general", () => {
    expect(resolveCreatingModel("generate", "image-general", "max")).toMatchObject({
      ok: false,
      reason: "quality-unsupported",
    });
  });

  it("accepts high quality on image-general", () => {
    expect(resolveCreatingModel("generate", "image-general", "high")).toMatchObject({ ok: true });
  });

  it("isQualitySupportedByAlias: xhigh rejected for image-general, accepted for image-fast", () => {
    expect(isQualitySupportedByAlias("image-general", "xhigh")).toBe(false);
    expect(isQualitySupportedByAlias("image-fast", "xhigh")).toBe(true);
    expect(isQualitySupportedByAlias("image-precision", "max")).toBe(true);
  });

  it("detects explicit model preferences from Thai and English prompts", () => {
    expect(detectRequestedCreatingModel("สร้างโปสเตอร์นี้ด้วย Flux")).toBe("flux-2-max");
    expect(detectRequestedCreatingModel("Use Nano Banana Pro for this image")).toBe(
      "nano-banana-pro",
    );
    // GPT Image mention now maps to image-general (not image-gpt-2)
    expect(detectRequestedCreatingModel("สร้างภาพด้วย GPT Image")).toBe("image-general");
  });

  it("keeps transform models scoped to their real capabilities", () => {
    expect(resolveCreatingModel("vectorize", "recraft-vectorize")).toMatchObject({ ok: true });
    expect(resolveCreatingModel("generate", "recraft-vectorize")).toEqual({
      ok: false,
      reason: "capability-mismatch",
      requestedAlias: "recraft-vectorize",
    });
  });

  it("Flare catalog entry points to correct model slug", () => {
    const entry = CREATING_MODEL_CATALOG.find((e) => e.alias === "image-fast");
    expect(entry?.modelId).toBe("openai/gpt-image-2.5-flare");
  });

  it("Sunburst catalog entry points to correct model slug", () => {
    const entry = CREATING_MODEL_CATALOG.find((e) => e.alias === "image-precision");
    expect(entry?.modelId).toBe("openai/gpt-image-2.5-sunburst");
  });
});
