import type {
  AiImageGenerateInput,
  AiImageGenerateOutput,
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
import {
  formatOpenAiImageSize,
  OPENAI_GPT_IMAGE_25_SUNBURST_MODEL,
  parseOpenAiImageSize,
} from "@/lib/server/ai/openaiImageSize";
import { assertProviderResponse, parseObjectProposals, splitDataUrl } from "./shared";

const SUPPORTED_TASKS: AiTaskKind[] = [
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "prompt.enhance",
  "image.generate",
];

const ALLOWED_IMAGE_MODELS = new Set([
  OPENAI_GPT_IMAGE_25_SUNBURST_MODEL,
  "gpt-image-2.5-sunburst-2026-09-08",
  "gpt-image-2.5-flare",
  "gpt-image-2",
]);

type OpenAiResponse = {
  id?: string;
  model?: string;
  status?: string;
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

type OpenAiImagesResponse = {
  created?: number;
  data?: Array<{ b64_json?: string; revised_prompt?: string; url?: string }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export class OpenAiAdapter implements AiProviderAdapter {
  readonly id = "openai" as const;

  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini",
  ) {}

  async status(): Promise<AiProviderStatus> {
    const configured = Boolean(this.apiKey);
    return {
      id: this.id,
      label: "OpenAI",
      configured,
      state: configured ? "ready" : "missing-key",
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
        {
          id: OPENAI_GPT_IMAGE_25_SUNBURST_MODEL,
          alias: "image-general",
          profile: "quality",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 8,
            outputPerMillionTokens: 30,
            note: "GPT Image 2.5 token estimate from OpenAI pricing.",
          },
        },
      ],
      message: configured ? undefined : "OPENAI_API_KEY is not configured.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (request.task === "image.generate") {
      return (await this.generateImage(
        request as AiProviderRequest<"image.generate">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
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

  private async generateImage(
    request: AiProviderRequest<"image.generate">,
  ): Promise<AiProviderResult<AiImageGenerateOutput>> {
    if (!this.apiKey) {
      throw new AiRuntimeError("PROVIDER_AUTH", "OPENAI_API_KEY is not configured.", {
        provider: this.id,
      });
    }
    const input = request.input as AiImageGenerateInput;
    const model = normalizeImageModel(request.model);
    const size = formatOpenAiImageSize(input.width, input.height);
    const quality = input.quality ?? "medium";
    const background = input.background ?? "opaque";
    const outputFormat = background === "transparent" ? "png" : "jpeg";

    const response =
      input.inputImages?.length && input.inputImages.length > 0
        ? await this.postImageEdits(input, model, size, quality, background, outputFormat, request.signal)
        : await this.postImageGenerations(
            input,
            model,
            size,
            quality,
            background,
            outputFormat,
            request.signal,
          );

    await assertProviderResponse(response, this.id);
    const payload = (await response.json()) as OpenAiImagesResponse;
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "OpenAI returned no generated image.", {
        provider: this.id,
      });
    }
    const mime = outputFormat === "png" ? "image/png" : "image/jpeg";
    const dataUrl = `data:${mime};base64,${b64}`;
    const { width, height } = parseOpenAiImageSize(size);
    return {
      output: {
        dataUrl,
        prompt: input.prompt,
        width,
        height,
        seed: input.seed ?? 0,
      },
      model,
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
      },
      warnings:
        input.seed !== undefined
          ? [
              `${model} does not expose deterministic seed control; the seed parameter was not sent upstream.`,
            ]
          : [],
    };
  }

  private async postImageGenerations(
    input: AiImageGenerateInput,
    model: string,
    size: string,
    quality: string,
    background: string,
    outputFormat: string,
    signal: AbortSignal,
  ): Promise<Response> {
    return fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: input.prompt,
        size,
        quality,
        background,
        output_format: outputFormat,
        n: 1,
      }),
      signal,
    });
  }

  private async postImageEdits(
    input: AiImageGenerateInput,
    model: string,
    size: string,
    quality: string,
    background: string,
    outputFormat: string,
    signal: AbortSignal,
  ): Promise<Response> {
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", input.prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("background", background);
    form.append("output_format", outputFormat);
    for (const [index, image] of (input.inputImages ?? []).entries()) {
      const { mimeType, base64 } = splitDataUrl(image.dataUrl);
      const bytes = Buffer.from(base64, "base64");
      const blob = new Blob([bytes], { type: mimeType });
      form.append("image[]", blob, `reference-${index}.${mimeType.split("/")[1] ?? "png"}`);
    }
    if (input.mask?.dataUrl) {
      const { mimeType, base64 } = splitDataUrl(input.mask.dataUrl);
      const bytes = Buffer.from(base64, "base64");
      const blob = new Blob([bytes], { type: mimeType || "image/png" });
      form.append("mask", blob, `mask.${(mimeType || "image/png").split("/")[1] ?? "png"}`);
    }
    return fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal,
    });
  }
}

function normalizeImageModel(model: string): string {
  const trimmed = model.trim();
  if (ALLOWED_IMAGE_MODELS.has(trimmed)) return trimmed;
  if (trimmed.includes("sunburst")) return OPENAI_GPT_IMAGE_25_SUNBURST_MODEL;
  return OPENAI_GPT_IMAGE_25_SUNBURST_MODEL;
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
