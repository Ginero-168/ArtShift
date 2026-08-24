import { bench, describe } from "vitest";
import { RoutedAiRuntime } from "@/lib/ai-runtime/runtime";
import { MockAiProviderAdapter } from "@/lib/server/ai/adapters/mockAdapter";

const runtime = new RoutedAiRuntime({
  adapters: [new MockAiProviderAdapter(() => ({ output: { text: "A benchmark description" } }))],
  routes: { "vision.describe": { economy: [{ provider: "mock", model: "mock" }] } },
});
const input = { image: { dataUrl: "data:image/png;base64,AAAA" } };

describe("AI Runtime overhead", () => {
  bench("uncached normalized execution", async () => {
    await runtime.execute("vision.describe", input, { cloudConsent: true, cache: false });
  });

  bench("SHA-256 result cache lookup", async () => {
    await runtime.execute("vision.describe", input, { cloudConsent: true, cache: true });
  });
});
