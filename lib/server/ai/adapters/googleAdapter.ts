import type {
  AiAssistantChatInput,
  AiAssistantChatOutput,
  AiChatContent,
  AiChatMessage,
  AiPromptEnhanceInput,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
  AiToolCallContent,
  AiVisionInput,
} from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import type {
  AiProviderAdapter,
  AiProviderRequest,
  AiProviderResult,
} from "@/lib/ai-runtime/runtime";
import { assertProviderResponse, parseObjectProposals, splitDataUrl } from "./shared";

const SUPPORTED_TASKS: AiTaskKind[] = [
  "assistant.chat",
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "prompt.enhance",
];

type GeminiPart = {
  text?: string;
  thought?: boolean;
  inlineData?: { mimeType: string; data: string };
  functionCall?: {
    name: string;
    args?: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
    role?: string;
  };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  modelVersion?: string;
  responseId?: string;
  usageMetadata?: {
    promptTokenCount?: number;
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

export class GoogleAiAdapter implements AiProviderAdapter {
  readonly id = "google" as const;

  constructor(
    private readonly apiKey = process.env.GEMINI_API_KEY,
    private readonly defaultModel = process.env.GEMINI_MODEL || "gemini-2.5-flash",
  ) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Google AI",
      configured: Boolean(this.apiKey),
      state: this.apiKey ? "ready" : "missing-key",
      tasks: SUPPORTED_TASKS,
      models: [
        {
          id: this.defaultModel,
          alias: "creative-director",
          profile: "quality",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 0.3,
            outputPerMillionTokens: 2.5,
          },
        },
        {
          id: this.defaultModel,
          alias: "google-direct",
          profile: "economy",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 0.3,
            outputPerMillionTokens: 2.5,
          },
        },
      ],
      message: this.apiKey ? undefined : "GEMINI_API_KEY is not configured.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (!SUPPORTED_TASKS.includes(request.task)) {
      throw new AiRuntimeError("NO_PROVIDER", `Google AI does not support ${request.task}.`, {
        provider: this.id,
      });
    }
    if (!this.apiKey) {
      throw new AiRuntimeError("PROVIDER_AUTH", "GEMINI_API_KEY is not configured.", {
        provider: this.id,
      });
    }
    const model = request.model || this.defaultModel;
    if (!/^[a-z0-9._-]+$/i.test(model)) {
      throw new AiRuntimeError("INVALID_INPUT", "Invalid Gemini model identifier.", {
        provider: this.id,
      });
    }

    if (request.task === "assistant.chat") {
      return (await this.executeChat(
        request as AiProviderRequest<"assistant.chat">,
        model,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }

    const body = createGeminiBody(request.task, request.input);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      },
    );
    await assertProviderResponse(response, this.id);
    const payload = (await response.json()) as GeminiResponse;
    const text =
      payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("")
        .trim() ?? "";
    if (!text) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Gemini returned an empty response.", {
        provider: this.id,
      });
    }
    request.onTextDelta?.(text);
    const output =
      request.task === "vision.propose"
        ? { text, objects: parseObjectProposals(text) }
        : request.task === "prompt.enhance"
          ? { prompt: text }
          : { text };
    return {
      output: output as AiTaskOutput<K>,
      model: payload.modelVersion ?? model,
      requestId: payload.responseId,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
        cachedInputTokens: payload.usageMetadata?.cachedContentTokenCount,
        reasoningTokens: payload.usageMetadata?.thoughtsTokenCount,
        totalTokens: payload.usageMetadata?.totalTokenCount,
      },
    };
  }

  private async executeChat(
    request: AiProviderRequest<"assistant.chat">,
    model: string,
  ): Promise<AiProviderResult<AiAssistantChatOutput>> {
    const input = request.input as AiAssistantChatInput;
    const body = createGeminiChatBody(input, request.options);

    let payload: GeminiResponse;
    if (request.onTextDelta) {
      try {
        payload = await this.streamGenerateContent(
          model,
          body,
          request.signal,
          request.onTextDelta,
        );
      } catch (streamErr) {
        // Fallback to standard request if SSE stream fails or is aborted/unsupported
        if (request.signal?.aborted) throw streamErr;
        payload = await this.standardGenerateContent(model, body, request.signal);
        const fallbackText = extractVisibleText(payload.candidates?.[0]);
        if (fallbackText) {
          request.onTextDelta(fallbackText);
        }
      }
    } else {
      payload = await this.standardGenerateContent(model, body, request.signal);
    }

    const candidate = payload.candidates?.[0];
    if (!candidate) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Gemini returned no candidates.", {
        provider: this.id,
      });
    }

    if (candidate.finishReason === "SAFETY") {
      throw new AiRuntimeError("POLICY_DENIED", "Gemini blocked response due to safety policy.", {
        provider: this.id,
      });
    }

    const text = extractVisibleText(candidate);
    const toolCalls: AiToolCallContent[] = [];
    if (Array.isArray(candidate.content?.parts)) {
      let callIndex = 0;
      for (const part of candidate.content.parts) {
        if (part.functionCall && typeof part.functionCall.name === "string") {
          toolCalls.push({
            type: "tool_call",
            id: `call_${part.functionCall.name}_${callIndex++}_${Date.now()}`,
            name: part.functionCall.name,
            input: part.functionCall.args ?? {},
          });
        }
      }
    }

    let stopReason: AiAssistantChatOutput["stopReason"] = "unknown";
    if (toolCalls.length > 0) {
      stopReason = "tool_use";
    } else if (candidate.finishReason === "STOP") {
      stopReason = "end_turn";
    } else if (candidate.finishReason === "MAX_TOKENS") {
      stopReason = "max_tokens";
    } else {
      stopReason = "unknown";
    }

    const assistantContent: AiChatContent[] = [];
    if (text) assistantContent.push({ type: "text", text });
    for (const tc of toolCalls) assistantContent.push(tc);

    const assistantMessage: AiChatMessage = {
      role: "assistant",
      content: assistantContent.length > 0 ? assistantContent : text,
    };

    return {
      output: {
        text,
        stopReason,
        assistantMessage,
        toolCalls,
      },
      model: payload.modelVersion ?? model,
      requestId: payload.responseId,
      finishReason: candidate.finishReason,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
        cachedInputTokens: payload.usageMetadata?.cachedContentTokenCount,
        reasoningTokens: payload.usageMetadata?.thoughtsTokenCount,
        totalTokens: payload.usageMetadata?.totalTokenCount,
      },
    };
  }

  private async standardGenerateContent(
    model: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<GeminiResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey!,
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    await assertProviderResponse(response, this.id);
    return (await response.json()) as GeminiResponse;
  }

  private async streamGenerateContent(
    model: string,
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onTextDelta: (delta: string) => void,
  ): Promise<GeminiResponse> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey!,
        },
        body: JSON.stringify(body),
        signal,
      },
    );
    await assertProviderResponse(response, this.id);

    if (!response.body) {
      throw new Error("No response body for streaming");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedText = "";
    const accumulatedParts: GeminiPart[] = [];
    let lastCandidate: GeminiCandidate | undefined;
    let lastUsageMetadata: GeminiResponse["usageMetadata"] | undefined;
    let modelVersion: string | undefined;
    let responseId: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const dataStr = trimmed.slice(6).trim();
        if (!dataStr || dataStr === "[DONE]") continue;

        try {
          const chunk = JSON.parse(dataStr) as GeminiResponse;
          if (chunk.modelVersion) modelVersion = chunk.modelVersion;
          if (chunk.responseId) responseId = chunk.responseId;
          if (chunk.usageMetadata) lastUsageMetadata = chunk.usageMetadata;

          const candidate = chunk.candidates?.[0];
          if (candidate) {
            lastCandidate = candidate;
            if (Array.isArray(candidate.content?.parts)) {
              for (const part of candidate.content.parts) {
                accumulatedParts.push(part);
                if (part.text && !part.thought) {
                  accumulatedText += part.text;
                  onTextDelta(part.text);
                }
              }
            }
          }
        } catch {
          // Ignore SSE chunk parse errors
        }
      }
    }

    return {
      candidates: [
        {
          content: { parts: accumulatedParts, role: "model" },
          finishReason: lastCandidate?.finishReason ?? "STOP",
        },
      ],
      modelVersion,
      responseId,
      usageMetadata: lastUsageMetadata,
    };
  }
}

export function compileGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!isRecord(schema)) {
    return { type: "object" };
  }
  const output: Record<string, unknown> = {};

  if (typeof schema.type === "string") {
    output.type = schema.type.toLowerCase();
  } else if (isRecord(schema.properties)) {
    output.type = "object";
  }

  if (typeof schema.description === "string") {
    output.description = schema.description;
  }

  if (Array.isArray(schema.enum)) {
    output.enum = schema.enum.filter((v) => typeof v === "string");
  }

  if (schema.nullable === true) {
    output.nullable = true;
  }

  const mergedProperties: Record<string, unknown> = {
    ...(isRecord(schema.properties) ? (schema.properties as Record<string, unknown>) : {}),
  };
  const requiredSet = new Set<string>(
    Array.isArray(schema.required)
      ? (schema.required as string[]).filter((k) => typeof k === "string")
      : [],
  );

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      if (isRecord(sub)) {
        if (isRecord(sub.properties)) {
          Object.assign(mergedProperties, sub.properties);
        }
        if (Array.isArray(sub.required)) {
          for (const req of sub.required) {
            if (typeof req === "string") requiredSet.add(req);
          }
        }
      }
    }
  }

  if (output.type === "object" || Object.keys(mergedProperties).length > 0) {
    output.type = "object";
    const compiledProps: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(mergedProperties)) {
      compiledProps[key] = compileGeminiSchema(propSchema);
    }
    output.properties = compiledProps;
    if (requiredSet.size > 0) {
      output.required = Array.from(requiredSet);
    }
  } else if (output.type === "array" && schema.items) {
    output.items = compileGeminiSchema(schema.items);
  }

  return output;
}

function extractVisibleText(candidate: GeminiCandidate | undefined): string {
  if (!candidate?.content?.parts) return "";
  return candidate.content.parts
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

function createGeminiChatBody(
  input: AiAssistantChatInput,
  options?: import("@/lib/ai-runtime/contracts").AiExecutionOptions,
): Record<string, unknown> {
  const toolCallNames = new Map<string, string>();
  for (const msg of input.messages) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool_call") {
          toolCallNames.set(part.id, part.name);
        }
      }
    }
  }

  const contents: GeminiContent[] = [];
  for (const msg of input.messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts: GeminiPart[] = [];

    if (typeof msg.content === "string") {
      if (msg.content.trim()) {
        parts.push({ text: msg.content });
      }
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") {
          if (block.text) parts.push({ text: block.text });
        } else if (block.type === "tool_call") {
          parts.push({
            functionCall: {
              name: block.name,
              args: block.input ?? {},
            },
          });
        } else if (block.type === "tool_result") {
          const fnName = toolCallNames.get(block.toolCallId) || "tool_result";
          parts.push({
            functionResponse: {
              name: fnName,
              response: {
                output: block.content,
                isError: block.isError === true,
              },
            },
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  let thinkingBudget: number | undefined;
  if (options?.reasoning) {
    const { mode, budgetTokens } = options.reasoning;
    if (mode === "off") {
      thinkingBudget = 0;
    } else if (mode === "fixed") {
      thinkingBudget = budgetTokens ?? 2048;
    } else if (mode === "dynamic") {
      thinkingBudget = -1;
    }
  } else {
    thinkingBudget = -1;
  }

  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: Math.min(65_536, Math.max(1, input.maxTokens ?? 8_192)),
    ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
  };

  const body: Record<string, unknown> = {
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Hello" }] }],
    generationConfig,
  };

  if (input.system) {
    body.systemInstruction = {
      parts: [{ text: input.system }],
    };
  }

  if (Array.isArray(input.tools) && input.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: input.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: compileGeminiSchema(tool.inputSchema),
        })),
      },
    ];
  }

  return body;
}

function createGeminiBody<K extends AiTaskKind>(task: K, unknownInput: AiTaskOutput<K> | unknown) {
  if (task === "prompt.enhance") {
    const input = unknownInput as AiPromptEnhanceInput;
    return {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Rewrite this as one precise, actionable prompt. Preserve intent and return only the rewritten prompt:\n${input.prompt}`,
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
    };
  }
  const input = unknownInput as AiVisionInput;
  const image = splitDataUrl(input.image.dataUrl);
  const prompt =
    task === "vision.propose"
      ? [
          input.prompt ?? "Find every distinct foreground object.",
          'Return JSON only: {"objects":[{"label":"string","confidence":0.0,"box":{"x":0.0,"y":0.0,"width":0.0,"height":0.0}}]}.',
          "Use normalized 0..1 coordinates and include thin attached parts in the owner box.",
        ].join("\n")
      : task === "vision.ocr"
        ? (input.prompt ?? "Transcribe all visible text accurately in reading order.")
        : (input.prompt ?? "Describe this image precisely, including layout and relationships.");
  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inlineData: { mimeType: image.mimeType, data: image.base64 } }],
      },
    ],
    generationConfig: {
      temperature: task === "vision.propose" ? 0 : 0.2,
      maxOutputTokens: task === "vision.propose" ? 2_048 : 1_024,
      ...(task === "vision.propose" ? { responseMimeType: "application/json" } : {}),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
