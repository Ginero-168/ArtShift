import type { AiProviderId } from "./contracts";

export type AiRuntimeErrorCode =
  | "ABORTED"
  | "BUDGET_EXCEEDED"
  | "INVALID_INPUT"
  | "NO_PROVIDER"
  | "POLICY_DENIED"
  | "PROVIDER_AUTH"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_SCHEMA"
  | "PROVIDER_UNAVAILABLE"
  | "TIMEOUT";

export class AiRuntimeError extends Error {
  readonly code: AiRuntimeErrorCode;
  readonly provider?: AiProviderId;
  readonly retryAfterSeconds?: number;

  constructor(
    code: AiRuntimeErrorCode,
    message: string,
    options: { cause?: unknown; provider?: AiProviderId; retryAfterSeconds?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AiRuntimeError";
    this.code = code;
    this.provider = options.provider;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function normalizeAiError(error: unknown, provider?: AiProviderId): AiRuntimeError {
  if (error instanceof AiRuntimeError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AiRuntimeError("ABORTED", "AI execution was cancelled.", { cause: error, provider });
  }
  const message = error instanceof Error ? error.message : "Unknown AI provider error.";
  return new AiRuntimeError("PROVIDER_UNAVAILABLE", message, { cause: error, provider });
}
