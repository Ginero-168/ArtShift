import { describe, expect, it } from "vitest";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";

const runIntegration = process.env.RUN_AI_PROVIDER_INTEGRATION === "1";

describe.runIf(runIntegration)("paid AI provider integration", () => {
  it("runs the economy Vision alias through the normalized contract", async () => {
    const result = await getServerAiRuntime().execute(
      "vision.describe",
      {
        image: {
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZVtQAAAAASUVORK5CYII=",
        },
        prompt: "Describe this test pixel in one short sentence.",
      },
      {
        profile: "economy",
        cloudConsent: true,
        allowFallback: false,
        maxCostUsd: 0.05,
        timeoutMs: 90_000,
        cache: false,
      },
    );
    expect(result.output.text.length).toBeGreaterThan(0);
    expect(result.metadata.provider).toBe("replicate");
    expect(result.metadata.model).toContain("openai/gpt-4o-mini");
  }, 120_000);
});
