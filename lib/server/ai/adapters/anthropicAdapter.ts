import Anthropic from "@anthropic-ai/sdk";
import type {
  AiAssistantChatInput,
  AiAssistantChatOutput,
  AiChatContent,
  AiChatMessage,
  AiPromptEnhanceInput,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
} from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import type {
  AiProviderAdapter,
  AiProviderRequest,
  AiProviderResult,
} from "@/lib/ai-runtime/runtime";

const SUPPORTED_TASKS: AiTaskKind[] = ["assistant.chat", "prompt.enhance"];

export class AnthropicAiAdapter implements AiProviderAdapter {
  readonly id = "anthropic" as const;

  constructor(
    private readonly apiKey = process.env.ANTHROPIC_API_KEY,
    private readonly defaultModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  ) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Anthropic",
      configured: Boolean(this.apiKey),
      state: this.apiKey ? "ready" : "missing-key",
      tasks: SUPPORTED_TASKS,
      models: [
        {
          id: this.defaultModel,
          alias: "chat-primary",
          profile: "quality",
          pricing: { currency: "USD", note: "Resolved from runtime usage and deployment pricing." },
        },
      ],
      message: this.apiKey ? undefined : "ANTHROPIC_API_KEY is not configured.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (!this.apiKey) {
      throw new AiRuntimeError("PROVIDER_AUTH", "ANTHROPIC_API_KEY is not configured.", {
        provider: this.id,
      });
    }
    if (request.task === "assistant.chat") {
      return (await this.executeChat(
        request as AiProviderRequest<"assistant.chat">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    if (request.task === "prompt.enhance") {
      return (await this.enhancePrompt(
        request as AiProviderRequest<"prompt.enhance">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    throw new AiRuntimeError("NO_PROVIDER", `Anthropic does not support ${request.task}.`, {
      provider: this.id,
    });
  }

  private async executeChat(
    request: AiProviderRequest<"assistant.chat">,
  ): Promise<AiProviderResult<AiAssistantChatOutput>> {
    const input = request.input as AiAssistantChatInput;
    const client = new Anthropic({ apiKey: this.apiKey });
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model || this.defaultModel,
      max_tokens: Math.min(16_384, Math.max(1, input.maxTokens ?? 8_192)),
      system: input.system,
      messages: input.messages.map(toAnthropicMessage),
      tools: input.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
    };

    try {
      let response: Anthropic.Message;
      if (request.onTextDelta) {
        const stream = client.messages.stream(params, { signal: request.signal });
        stream.on("text", request.onTextDelta);
        response = await stream.finalMessage();
      } else {
        response = await client.messages.create(params, { signal: request.signal });
      }
      const content = response.content.flatMap(fromAnthropicBlock);
      const toolCalls = content.filter((block) => block.type === "tool_call");
      const text = content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      const assistantMessage: AiChatMessage = { role: "assistant", content };
      return {
        output: {
          text,
          stopReason: normalizeStopReason(response.stop_reason),
          assistantMessage,
          toolCalls,
        },
        model: response.model,
        requestId: response.id,
        finishReason: response.stop_reason ?? undefined,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }

  private async enhancePrompt(
    request: AiProviderRequest<"prompt.enhance">,
  ): Promise<AiProviderResult<AiTaskOutput<"prompt.enhance">>> {
    const input = request.input as AiPromptEnhanceInput;
    const client = new Anthropic({ apiKey: this.apiKey });
    try {
      const response = await client.messages.create(
        {
          model: request.model || this.defaultModel,
          max_tokens: 256,
          system:
            input.purpose === "image"
              ? "Rewrite the request as one precise English image-generation prompt. Preserve subjects, quantities, relationships, style and constraints. Return only the prompt."
              : "Rewrite the request to be precise and actionable while preserving intent. Return only the rewritten prompt.",
          messages: [{ role: "user", content: input.prompt }],
        },
        { signal: request.signal },
      );
      const prompt = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (!prompt) {
        throw new AiRuntimeError("PROVIDER_SCHEMA", "Anthropic returned an empty prompt.", {
          provider: this.id,
        });
      }
      return {
        output: { prompt },
        model: response.model,
        requestId: response.id,
        finishReason: response.stop_reason ?? undefined,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cachedInputTokens: response.usage.cache_read_input_tokens ?? undefined,
          cacheWriteTokens: response.usage.cache_creation_input_tokens ?? undefined,
        },
      };
    } catch (error) {
      throw normalizeAnthropicError(error);
    }
  }
}

function toAnthropicMessage(message: AiChatMessage): Anthropic.MessageParam {
  if (typeof message.content === "string") {
    return { role: message.role, content: message.content };
  }
  return {
    role: message.role,
    content: message.content.map((block): Anthropic.ContentBlockParam => {
      if (block.type === "text") return { type: "text", text: block.text };
      if (block.type === "tool_call") {
        return { type: "tool_use", id: block.id, name: block.name, input: block.input };
      }
      return {
        type: "tool_result",
        tool_use_id: block.toolCallId,
        content: block.content,
        is_error: block.isError,
      };
    }),
  };
}

function fromAnthropicBlock(block: Anthropic.ContentBlock): AiChatContent[] {
  if (block.type === "text") return [{ type: "text", text: block.text }];
  if (block.type === "tool_use") {
    return [
      {
        type: "tool_call",
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      },
    ];
  }
  return [];
}

function normalizeStopReason(
  reason: Anthropic.Message["stop_reason"],
): AiAssistantChatOutput["stopReason"] {
  if (
    reason === "end_turn" ||
    reason === "tool_use" ||
    reason === "max_tokens" ||
    reason === "stop_sequence"
  ) {
    return reason;
  }
  return "unknown";
}

function normalizeAnthropicError(error: unknown): AiRuntimeError {
  if (error instanceof AiRuntimeError) return error;
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: unknown }).status)
      : undefined;
  const message = error instanceof Error ? error.message : "Anthropic request failed.";
  if (status === 401 || status === 403) {
    return new AiRuntimeError("PROVIDER_AUTH", message, { cause: error, provider: "anthropic" });
  }
  if (status === 429) {
    return new AiRuntimeError("PROVIDER_RATE_LIMIT", message, {
      cause: error,
      provider: "anthropic",
    });
  }
  return new AiRuntimeError("PROVIDER_UNAVAILABLE", message, {
    cause: error,
    provider: "anthropic",
  });
}
