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
import { assertProviderResponse, parseObjectProposals } from "./shared";

const SUPPORTED_TASKS: AiTaskKind[] = [
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "prompt.enhance",
];

type OpenAiResponse = {
  id?: string;
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export class OpenAiAdapter implements AiProviderAdapter {
  readonly id = "openai" as const;

  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini",
  ) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "OpenAI",
      configured: Boolean(this.apiKey),
      state: this.apiKey ? "ready" : "missing-key",
      tasks: SUPPORTED_TASKS,
      models: [
        {
          id: this.defaultModel,
          alias: "openai-direct",
          profile: "economy",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 0.15,
            outputPerMillionTokens: 0.6,
            note: "Default GPT-4o mini estimate; configure when using another model.",
          },
        },
      ],
      message: this.apiKey ? undefined : "OPENAI_API_KEY is not configured.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (!SUPPORTED_TASKS.includes(request.task)) {
      throw new AiRuntimeError("NO_PROVIDER", `OpenAI does not support ${request.task}.`, {
        provider: this.id,
      });
    }
    if (!this.apiKey) {
      throw new AiRuntimeError("PROVIDER_AUTH", "OPENAI_API_KEY is not configured.", {
        provider: this.id,
      });
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createOpenAiBody(request.task, request.input, request.model)),
      signal: request.signal,
    });
    await assertProviderResponse(response, this.id);
    const payload = (await response.json()) as OpenAiResponse;
    const text = extractOpenAiText(payload);
    if (!text) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "OpenAI returned an empty response.", {
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
      model: payload.model ?? request.model,
      requestId: payload.id,
      finishReason: payload.status,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
    };
  }
}

function createOpenAiBody(task: AiTaskKind, unknownInput: unknown, model: string) {
  if (task === "prompt.enhance") {
    const input = unknownInput as AiPromptEnhanceInput;
    return {
      model,
      input: `Rewrite this as one precise, actionable prompt. Preserve intent and return only the rewritten prompt:\n${input.prompt}`,
      max_output_tokens: 512,
    };
  }
  const input = unknownInput as AiVisionInput;
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
    model,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: input.image.dataUrl, detail: "auto" },
        ],
      },
    ],
    max_output_tokens: task === "vision.propose" ? 2_048 : 1_024,
  };
}

function extractOpenAiText(payload: OpenAiResponse): string {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((content) => content.type === "output_text" && typeof content.text === "string")
      .map((content) => content.text)
      .join("\n")
      .trim() ?? ""
  );
}
