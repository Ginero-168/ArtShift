export const AI_TASK_KINDS = [
  "assistant.chat",
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "prompt.enhance",
  "image.generate",
] as const;

export type AiTaskKind = (typeof AI_TASK_KINDS)[number];
export type AiExecutionProfile = "local" | "economy" | "quality";
export type AiProviderId =
  | "anthropic"
  | "google"
  | "openai"
  | "replicate"
  | "pollinations"
  | "mock";

export type AiTextContent = { type: "text"; text: string };
export type AiToolCallContent = {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
};
export type AiToolResultContent = {
  type: "tool_result";
  toolCallId: string;
  content: string;
  isError?: boolean;
};
export type AiChatContent = AiTextContent | AiToolCallContent | AiToolResultContent;

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string | AiChatContent[];
};

export type AiToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AiAssistantChatInput = {
  messages: AiChatMessage[];
  system?: string;
  tools?: AiToolDefinition[];
  maxTokens?: number;
};

export type AiAssistantChatOutput = {
  text: string;
  stopReason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | "unknown";
  assistantMessage: AiChatMessage;
  toolCalls: AiToolCallContent[];
};

export type AiImageInput = {
  dataUrl: string;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
};

export type AiVisionInput = {
  image: AiImageInput;
  prompt?: string;
  language?: string;
};

export type AiObjectProposal = {
  label: string;
  confidence?: number;
  /** Normalized coordinates in the inclusive 0..1 range. */
  box: { x: number; y: number; width: number; height: number };
};

export type AiVisionTextOutput = {
  text: string;
};

export type AiVisionProposalOutput = {
  text: string;
  objects: AiObjectProposal[];
};

export type AiPromptEnhanceInput = {
  prompt: string;
  purpose?: "image" | "design" | "general";
};

export type AiPromptEnhanceOutput = {
  prompt: string;
};

export type AiImageGenerateInput = {
  prompt: string;
  width: number;
  height: number;
  enhance?: boolean;
  seed?: number;
};

export type AiImageGenerateOutput = {
  dataUrl: string;
  prompt: string;
  width: number;
  height: number;
  seed: number;
};

export type AiTaskInputMap = {
  "assistant.chat": AiAssistantChatInput;
  "vision.describe": AiVisionInput;
  "vision.propose": AiVisionInput;
  "vision.ocr": AiVisionInput;
  "prompt.enhance": AiPromptEnhanceInput;
  "image.generate": AiImageGenerateInput;
};

export type AiTaskOutputMap = {
  "assistant.chat": AiAssistantChatOutput;
  "vision.describe": AiVisionTextOutput;
  "vision.propose": AiVisionProposalOutput;
  "vision.ocr": AiVisionTextOutput;
  "prompt.enhance": AiPromptEnhanceOutput;
  "image.generate": AiImageGenerateOutput;
};

export type AiTaskInput<K extends AiTaskKind> = AiTaskInputMap[K];
export type AiTaskOutput<K extends AiTaskKind> = AiTaskOutputMap[K];

export type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  providerSeconds?: number;
  estimatedUsd?: number;
};

export type AiExecutionMetadata = {
  task: AiTaskKind;
  provider: AiProviderId;
  model: string;
  modelAlias?: string;
  requestId?: string;
  finishReason?: string;
  durationMs: number;
  usage: AiUsage;
  cached: boolean;
  warnings: string[];
};

export type AiExecution<T> = {
  output: T;
  metadata: AiExecutionMetadata;
};

export type AiExecutionOptions = {
  profile?: AiExecutionProfile;
  provider?: AiProviderId;
  modelAlias?: string;
  /** Required for cloud-opt-in tasks. A user action should set this explicitly. */
  cloudConsent?: boolean;
  /** Disabled by default so a paid fallback is never hidden from the user. */
  allowFallback?: boolean;
  timeoutMs?: number;
  maxCostUsd?: number;
  cache?: boolean;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
};

export type AiProviderStatus = {
  id: AiProviderId;
  label: string;
  configured: boolean;
  state: "ready" | "missing-key" | "disabled" | "degraded";
  tasks: AiTaskKind[];
  models: Array<{
    id: string;
    alias?: string;
    profile: AiExecutionProfile;
    pricing?: AiModelPricing;
  }>;
  message?: string;
};

export type AiCapabilities = {
  tasks: Record<AiTaskKind, { locality: AiTaskLocality; providers: AiProviderId[] }>;
  providers: AiProviderStatus[];
  localOnlyFeatures: string[];
};

export type AiTaskLocality = "local-only" | "cloud-opt-in" | "cloud-required";

export type AiModelPricing = {
  currency: "USD";
  inputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  perRunUsd?: number;
  note?: string;
};

export interface AiRuntime {
  execute<K extends AiTaskKind>(
    task: K,
    input: AiTaskInput<K>,
    options?: AiExecutionOptions,
  ): Promise<AiExecution<AiTaskOutput<K>>>;

  capabilities(): Promise<AiCapabilities>;
}
