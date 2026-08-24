import type {
  AiPromptEnhanceInput,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
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
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "prompt.enhance",
];

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
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
      models: [{ id: this.defaultModel, alias: "google-direct", profile: "economy" }],
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
