import { describe, expect, it } from "vitest";
import {
  CREATING_MODEL_CATALOG,
  detectRequestedCreatingModel,
  resolveCreatingModel,
} from "@/lib/ai/orchestration/creatingModelCatalog";

describe("Creating model capability catalog", () => {
  it("routes current generation and editing to the actually wired GPT Image 2 model", () => {
    expect(resolveCreatingModel("generate")).toMatchObject({
      ok: true,
      model: { alias: "image-gpt-2", status: "available" },
    });
    expect(resolveCreatingModel("edit")).toMatchObject({
      ok: true,
      model: { alias: "image-gpt-2", status: "available" },
    });
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

  it("detects explicit model preferences from Thai and English prompts", () => {
    expect(detectRequestedCreatingModel("สร้างโปสเตอร์นี้ด้วย Flux")).toBe("flux-2-max");
    expect(detectRequestedCreatingModel("Use Nano Banana Pro for this image")).toBe(
      "nano-banana-pro",
    );
    expect(detectRequestedCreatingModel("สร้างภาพด้วย GPT Image")).toBe("image-gpt-2");
  });

  it("keeps transform models scoped to their real capabilities", () => {
    expect(resolveCreatingModel("vectorize", "recraft-vectorize")).toMatchObject({ ok: true });
    expect(resolveCreatingModel("generate", "recraft-vectorize")).toEqual({
      ok: false,
      reason: "capability-mismatch",
      requestedAlias: "recraft-vectorize",
    });
  });
});
