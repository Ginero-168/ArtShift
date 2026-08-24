import type {
  AiCapabilities,
  AiExecution,
  AiExecutionOptions,
  AiRuntime,
  AiTaskInput,
  AiTaskKind,
  AiTaskOutput,
} from "./contracts";
import { AiRuntimeError } from "./errors";

export class BrowserAiRuntime implements AiRuntime {
  constructor(private readonly baseUrl = "/api/ai") {}

  async execute<K extends AiTaskKind>(
    task: K,
    input: AiTaskInput<K>,
    options: AiExecutionOptions = {},
  ): Promise<AiExecution<AiTaskOutput<K>>> {
    const response = await fetch(`${this.baseUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input, options: serializableOptions(options) }),
      signal: options.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      execution?: AiExecution<AiTaskOutput<K>>;
      error?: { code?: string; message?: string };
    };
    if (!response.ok || !payload.execution) {
      throw new AiRuntimeError(
        (payload.error?.code as ConstructorParameters<typeof AiRuntimeError>[0]) ||
          "PROVIDER_UNAVAILABLE",
        payload.error?.message || `AI runtime failed with status ${response.status}.`,
      );
    }
    return payload.execution;
  }

  async capabilities(): Promise<AiCapabilities> {
    const response = await fetch(`${this.baseUrl}/status`, { cache: "no-store" });
    if (!response.ok) {
      throw new AiRuntimeError(
        "PROVIDER_UNAVAILABLE",
        `AI status failed with status ${response.status}.`,
      );
    }
    const payload = (await response.json()) as { capabilities: AiCapabilities };
    return payload.capabilities;
  }
}

export const browserAiRuntime = new BrowserAiRuntime();

function serializableOptions(options: AiExecutionOptions) {
  return {
    profile: options.profile,
    provider: options.provider,
    modelAlias: options.modelAlias,
    cloudConsent: options.cloudConsent,
    allowFallback: options.allowFallback,
    timeoutMs: options.timeoutMs,
    maxCostUsd: options.maxCostUsd,
    cache: options.cache,
  };
}
