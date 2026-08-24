import { describe, expect, it } from "vitest";
import type {
  AiProviderId,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
} from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import {
  type AiProviderAdapter,
  type AiProviderRequest,
  type AiProviderResult,
  RoutedAiRuntime,
} from "@/lib/ai-runtime/runtime";
import { InMemoryAiUsageLedger } from "@/lib/ai-runtime/usage";
import { MockAiProviderAdapter } from "@/lib/server/ai/adapters/mockAdapter";

const visionInput = {
  image: { dataUrl: "data:image/png;base64,AAAA" },
};

describe("RoutedAiRuntime", () => {
  it("requires explicit cloud consent for cloud-opt-in vision tasks", async () => {
    const runtime = createRuntime();
    await expect(runtime.execute("vision.describe", visionInput)).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
  });

  it("normalizes metadata, usage and cached executions at the interface", async () => {
    const adapter = new MockAiProviderAdapter(() => ({
      output: { text: "A precise description" },
      usage: { inputTokens: 100, outputTokens: 20 },
      model: "mock-version-1",
      requestId: "request-1",
    }));
    const runtime = createRuntime(adapter);

    const first = await runtime.execute("vision.describe", visionInput, { cloudConsent: true });
    const second = await runtime.execute("vision.describe", visionInput, { cloudConsent: true });

    expect(first.output.text).toBe("A precise description");
    expect(first.metadata).toMatchObject({
      provider: "mock",
      model: "mock-version-1",
      requestId: "request-1",
      cached: false,
      usage: { inputTokens: 100, outputTokens: 20 },
    });
    expect(second.metadata.cached).toBe(true);
    expect(adapter.requests).toHaveLength(1);
  });

  it("does not use a fallback unless the caller explicitly permits it", async () => {
    const unavailable = new TestAdapter("replicate", false, "unavailable");
    const available = new TestAdapter("mock", true, "fallback result");
    const runtime = new RoutedAiRuntime({
      adapters: [unavailable, available],
      routes: {
        "vision.describe": {
          economy: [
            { provider: "replicate", model: "primary" },
            { provider: "mock", model: "fallback" },
          ],
        },
      },
    });

    await expect(
      runtime.execute("vision.describe", visionInput, { cloudConsent: true }),
    ).rejects.toMatchObject({ code: "PROVIDER_AUTH" });

    const result = await runtime.execute("vision.describe", visionInput, {
      cloudConsent: true,
      allowFallback: true,
    });
    expect(result.output.text).toBe("fallback result");
  });

  it("stops before execution when the monthly budget is exhausted", async () => {
    const ledger = new InMemoryAiUsageLedger();
    ledger.record({
      at: Date.now(),
      task: "vision.describe",
      provider: "mock",
      model: "mock",
      durationMs: 1,
      usage: { estimatedUsd: 1 },
      cached: false,
      ok: true,
    });
    const runtime = new RoutedAiRuntime({
      adapters: [new MockAiProviderAdapter(() => ({ output: { text: "unused" } }))],
      routes: { "vision.describe": { economy: [{ provider: "mock", model: "mock" }] } },
      ledger,
      monthlyBudgetUsd: 1,
    });

    await expect(
      runtime.execute("vision.describe", visionInput, { cloudConsent: true }),
    ).rejects.toBeInstanceOf(AiRuntimeError);
    await expect(
      runtime.execute("vision.describe", visionInput, { cloudConsent: true }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("enforces a per-command cost ceiling before a provider request", async () => {
    const adapter = new MockAiProviderAdapter(() => ({ output: { text: "unused" } }));
    const runtime = new RoutedAiRuntime({
      adapters: [adapter],
      routes: {
        "vision.describe": {
          economy: [{ provider: "mock", model: "mock", expectedMaxUsd: 0.1 }],
        },
      },
    });

    await expect(
      runtime.execute("vision.describe", visionInput, {
        cloudConsent: true,
        maxCostUsd: 0.05,
      }),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(adapter.requests).toHaveLength(0);
  });

  it("preserves TIMEOUT instead of reporting a timeout as a user cancellation", async () => {
    const adapter = new MockAiProviderAdapter(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => reject(request.signal.reason), {
            once: true,
          });
        }),
    );
    const runtime = createRuntime(adapter);

    await expect(
      runtime.execute("vision.describe", visionInput, {
        cloudConsent: true,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

function createRuntime(
  adapter = new MockAiProviderAdapter(() => ({ output: { text: "description" } })),
) {
  return new RoutedAiRuntime({
    adapters: [adapter],
    routes: { "vision.describe": { economy: [{ provider: "mock", model: "mock-model" }] } },
  });
}

class TestAdapter implements AiProviderAdapter {
  constructor(
    readonly id: AiProviderId,
    private readonly configured: boolean,
    private readonly text: string,
  ) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: this.id,
      configured: this.configured,
      state: this.configured ? "ready" : "missing-key",
      tasks: ["vision.describe"],
      models: [{ id: this.id, profile: "economy" }],
    };
  }

  async execute<K extends AiTaskKind>(
    _request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    return { output: { text: this.text } as AiTaskOutput<K> };
  }
}
