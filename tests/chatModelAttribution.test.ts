import { describe, expect, it } from "vitest";
import {
  appendModelStep,
  catalogModelStep,
  createChatTurnModels,
  DEFAULT_DIRECTOR_MODEL_ID,
  directorModelStep,
  displayModelSteps,
  FLORENCE_2_MODEL_ID,
  florenceModelStep,
  formatImageModelDisclosure,
  formatModelChain,
  formatModelDisclosure,
  formatModelDisplayLabel,
  formatModelTechnicalTitle,
  formatUsingStatus,
  modelStepFromRuntime,
  normalizeRuntimeModelId,
  resolveCatalogModelId,
  uniqueModelSteps,
  upsertModelStep,
  visionModelStep,
} from "@/lib/ai/chatModelAttribution";

describe("chat model attribution", () => {
  it("strips Replicate version hashes and rejects empty values", () => {
    expect(
      normalizeRuntimeModelId(
        "google/gemini-3-flash@e27b7b83f67f5865920667591a2a08a41cdc82906bd29306fe79581ab0646b8b",
      ),
    ).toBe("google/gemini-3-flash");
    expect(normalizeRuntimeModelId("openai/gpt-image-2.5-sunburst")).toBe(
      "openai/gpt-image-2.5-sunburst",
    );
    expect(normalizeRuntimeModelId("  ")).toBeNull();
    expect(normalizeRuntimeModelId(undefined)).toBeNull();
    expect(normalizeRuntimeModelId("x".repeat(200))).toBeNull();
  });

  it("resolves catalog aliases to real model ids and does not invent missing ones", () => {
    expect(resolveCatalogModelId("image-general")).toBe("openai/gpt-image-2.5-sunburst");
    expect(resolveCatalogModelId("image-gpt-2")).toBe("openai/gpt-image-2.5-sunburst");
    expect(resolveCatalogModelId("creative-director")).toBe(DEFAULT_DIRECTOR_MODEL_ID);
    expect(resolveCatalogModelId("nano-banana-pro")).toBeNull();
    expect(resolveCatalogModelId("not-a-real-alias")).toBeNull();
    expect(catalogModelStep("flux-2-max")).toBeNull();
  });

  it("formats in-flight status and completed chains from runtime ids", () => {
    expect(formatUsingStatus([directorModelStep()])).toBe("กำลังใช้ google/gemini-3-flash...");
    expect(
      formatModelChain([
        { id: "openai/gpt-image-2.5-sunburst", role: "image" },
        florenceModelStep(),
      ]),
    ).toBe("openai/gpt-image-2.5-sunburst then Florence-2");
    expect(
      formatModelChain([
        directorModelStep(),
        { id: "openai/gpt-image-2.5-sunburst", role: "image" },
        florenceModelStep(),
      ]),
    ).toBe("google/gemini-3-flash → openai/gpt-image-2.5-sunburst then Florence-2");
    expect(formatUsingStatus([])).toBe("");
    expect(formatModelChain([florenceModelStep()])).toBe("Florence-2");
    expect(formatModelDisclosure(undefined, "openai/gpt-image-2.5-sunburst")).toBe(
      "openai/gpt-image-2.5-sunburst",
    );
    expect(
      formatModelDisclosure(
        [
          directorModelStep(),
          { id: "openai/gpt-image-2.5-sunburst", role: "image" },
          florenceModelStep(),
        ],
        "GPT Image 2",
      ),
    ).toBe("google/gemini-3-flash → openai/gpt-image-2.5-sunburst");
    expect(formatModelDisclosure([florenceModelStep()], "Florence-2")).toBe("");
    expect(
      formatImageModelDisclosure(
        [
          directorModelStep(),
          { id: "openai/gpt-image-2.5-sunburst", role: "image" },
          florenceModelStep(),
        ],
        "google/gemini-3-flash → openai/gpt-image-2.5-sunburst",
      ),
    ).toBe("openai/gpt-image-2.5-sunburst");
    expect(formatImageModelDisclosure([directorModelStep()], "google/gemini-3-flash")).toBe("");
    expect(formatImageModelDisclosure(undefined, "openai/gpt-image-2.5-sunburst")).toBe(
      "openai/gpt-image-2.5-sunburst",
    );
    expect(
      formatUsingStatus([
        directorModelStep(),
        { id: "openai/gpt-image-2.5-sunburst", role: "image" },
        florenceModelStep(),
      ]),
    ).toBe("กำลังใช้ google/gemini-3-flash → openai/gpt-image-2.5-sunburst...");
    expect(
      displayModelSteps([
        directorModelStep(),
        { id: "openai/gpt-image-2.5-sunburst", role: "image" },
        florenceModelStep(),
      ]),
    ).toEqual([
      { id: "google/gemini-3-flash", role: "chat" },
      { id: "openai/gpt-image-2.5-sunburst", role: "image" },
    ]);
    expect(visionModelStep()).toEqual({ id: DEFAULT_DIRECTOR_MODEL_ID, role: "vision" });
    expect(visionModelStep("google/gemini-3-flash")).toEqual({
      id: "google/gemini-3-flash",
      role: "vision",
    });
    expect(visionModelStep(FLORENCE_2_MODEL_ID)).toBeNull();
    expect(formatUsingStatus([visionModelStep()!])).toBe("กำลังใช้ google/gemini-3-flash...");
    expect(formatModelDisclosure([visionModelStep()!, florenceModelStep()])).toBe(
      "google/gemini-3-flash",
    );
    expect(
      displayModelSteps([directorModelStep(), visionModelStep()!, florenceModelStep()]),
    ).toEqual([{ id: "google/gemini-3-flash", role: "vision" }]);
  });

  it("shows a readable model label and keeps the provider id for the tooltip", () => {
    expect(formatModelDisplayLabel("google/gemini-3-flash@hidden")).toBe("Gemini 3 Flash");
    expect(formatModelTechnicalTitle("google/gemini-3-flash@hidden")).toBe("google/gemini-3-flash");
    expect(formatModelDisplayLabel("google/gemini-3-flash → openai/gpt-image-2.5-sunburst")).toBe(
      "Gemini 3 Flash → GPT Image 2.5 Sunburst",
    );
    expect(formatModelDisplayLabel("GPT Image 2")).toBe("GPT Image 2");
    expect(formatModelTechnicalTitle("openai/gpt-image-2.5-sunburst@hidden then Florence-2")).toBe(
      "openai/gpt-image-2.5-sunburst then Florence-2",
    );
  });

  it("upserts the same role to the adapter-reported id instead of stacking expected+actual", () => {
    const expected = upsertModelStep([], catalogModelStep("image-general"));
    const actual = upsertModelStep(
      expected,
      modelStepFromRuntime(
        "openai/gpt-image-2.5-sunburst@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "image",
      ),
    );
    expect(actual).toEqual([{ id: "openai/gpt-image-2.5-sunburst", role: "image" }]);
    const withVision = upsertModelStep(actual, florenceModelStep());
    expect(withVision.map((step) => step.id)).toEqual([
      "openai/gpt-image-2.5-sunburst",
      FLORENCE_2_MODEL_ID,
    ]);
  });

  it("dedupes repeated steps", () => {
    const once = appendModelStep([], directorModelStep());
    expect(appendModelStep(once, directorModelStep())).toEqual(once);
    expect(uniqueModelSteps([...once, ...once])).toEqual(once);
  });

  it("tracks a turn: in-flight Using… then completed usedModels", () => {
    const turn = createChatTurnModels();
    expect(turn.using()).toBe("");
    expect(turn.label()).toBe("");
    expect(turn.attach({ content: "hi" })).toEqual({ content: "hi" });
    turn.remember(directorModelStep());
    expect(turn.using()).toBe("กำลังใช้ google/gemini-3-flash...");
    expect(turn.label()).toBe("google/gemini-3-flash");
    turn.remember(catalogModelStep("image-general"));
    turn.remember(florenceModelStep());
    expect(turn.using()).toBe("กำลังใช้ google/gemini-3-flash → openai/gpt-image-2.5-sunburst...");
    expect(turn.label()).toBe("google/gemini-3-flash → openai/gpt-image-2.5-sunburst");
    const message = turn.attach({ content: "done" });
    expect(message.usedModels?.map((step) => step.id)).toEqual([
      "google/gemini-3-flash",
      "openai/gpt-image-2.5-sunburst",
      FLORENCE_2_MODEL_ID,
    ]);
  });

  it("labels in-flight vision as Gemini API and drops Florence from the sparkle row", () => {
    const turn = createChatTurnModels();
    turn.remember(visionModelStep());
    expect(turn.using()).toBe("กำลังใช้ google/gemini-3-flash...");
    expect(turn.label()).toBe("google/gemini-3-flash");
    turn.remember(visionModelStep(FLORENCE_2_MODEL_ID));
    expect(turn.label()).toBe("google/gemini-3-flash");
    turn.forget("vision");
    expect(turn.label()).toBe("");
    turn.remember(visionModelStep("google/gemini-3-flash"));
    turn.remember(catalogModelStep("image-general"));
    expect(turn.label()).toBe("google/gemini-3-flash → openai/gpt-image-2.5-sunburst");
  });
});
