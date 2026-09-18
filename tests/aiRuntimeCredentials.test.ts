import { afterEach, describe, expect, it } from "vitest";
import { createServerAiRuntime } from "@/lib/server/ai/runtime";

describe("end-user AI runtime credentials", () => {
  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.REPLICATE_API_TOKEN;
  });

  it("does not treat process.env keys as BYOK for account-scoped runtimes", async () => {
    process.env.OPENAI_API_KEY = "sk-env-must-not-count";
    process.env.REPLICATE_API_TOKEN = "r8_env_must_not_count";

    const runtime = createServerAiRuntime({ accountId: "account-1" });
    const caps = await runtime.capabilities();
    const openai = caps.providers.find((provider) => provider.id === "openai");
    const replicate = caps.providers.find((provider) => provider.id === "replicate");

    expect(openai?.configured).toBe(false);
    expect(replicate?.configured).toBe(false);
  });

  it("still allows ops/unscoped runtimes to use env keys", async () => {
    process.env.OPENAI_API_KEY = "sk-ops-ok";
    process.env.REPLICATE_API_TOKEN = "r8_ops_ok";

    const runtime = createServerAiRuntime();
    const caps = await runtime.capabilities();
    expect(caps.providers.find((provider) => provider.id === "openai")?.configured).toBe(true);
    expect(caps.providers.find((provider) => provider.id === "replicate")?.configured).toBe(true);
  });
});
