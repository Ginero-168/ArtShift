import { REPLICATE_PREDICTION_CANCEL_AFTER } from "@/lib/ai/runtimeLimits";
import type {
  AiAssistantChatInput,
  AiAssistantChatOutput,
  AiImageGenerateInput,
  AiImageUpscaleInput,
  AiPromptEnhanceInput,
  AiProviderStatus,
  AiTaskKind,
  AiTaskOutput,
  AiVectorizeInput,
  AiVisionInput,
} from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import type {
  AiProviderAdapter,
  AiProviderRequest,
  AiProviderResult,
} from "@/lib/ai-runtime/runtime";
import {
  parseReplicateAssistantOutput,
  renderConversationPrompt,
  renderGeminiSystemInstruction,
  renderHarmonyPrompt,
} from "./replicateChatProtocol";
import { assertProviderResponse, parseObjectProposals, textFromUnknownOutput } from "./shared";

const SUPPORTED_TASKS: AiTaskKind[] = [
  "assistant.chat",
  "vision.describe",
  "vision.propose",
  "vision.ocr",
  "vectorize.recraft",
  "prompt.enhance",
  "image.generate",
  "image.upscale",
];
const GPT_MODEL = "openai/gpt-4o-mini";
const GEMINI_MODEL = "google/gemini-3-flash";
const CHAT_MODEL = "openai/gpt-oss-120b";
const GEMINI_CHAT_MODEL = "google/gemini-2.5-flash";
const RECRAFT_VECTORIZE_MODEL = "recraft-ai/recraft-vectorize";
const PRUNA_P_IMAGE_UPSCALE_MODEL = "prunaai/p-image-upscale";
const GPT_IMAGE_2_MODEL = "openai/gpt-image-2";
const MAX_CHAT_OUTPUT_TOKENS = 8_192;
const MAX_RECRAFT_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_RECRAFT_PIXELS = 16_000_000;
const MAX_RECRAFT_SVG_CHARS = 4_000_000;
const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;
const GENERATED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

type ReplicatePrediction = {
  id?: string;
  model?: string;
  version?: string;
  status?: "starting" | "processing" | "succeeded" | "failed" | "canceled" | "aborted";
  output?: unknown;
  error?: unknown;
  urls?: { get?: string; cancel?: string };
  metrics?: Record<string, unknown>;
};

export class ReplicateAiAdapter implements AiProviderAdapter {
  readonly id = "replicate" as const;

  constructor(private readonly apiToken?: string) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Replicate",
      configured: Boolean(this.apiToken),
      state: this.apiToken ? "ready" : "missing-key",
      tasks: SUPPORTED_TASKS,
      models: [
        {
          id: GEMINI_CHAT_MODEL,
          alias: "creative-director",
          profile: "quality",
          pricing: { currency: "USD", inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
        },
        {
          id: CHAT_MODEL,
          alias: "chat-gpt-oss",
          profile: "quality",
          pricing: { currency: "USD", inputPerMillionTokens: 0.18, outputPerMillionTokens: 0.72 },
        },
        {
          id: GPT_MODEL,
          alias: "vision-economy",
          profile: "economy",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 0.15,
            outputPerMillionTokens: 0.6,
            note: "Planning estimate; confirm against the current Replicate model page.",
          },
        },
        {
          id: GEMINI_MODEL,
          alias: "vision-quality",
          profile: "quality",
          pricing: {
            currency: "USD",
            inputPerMillionTokens: 0.5,
            outputPerMillionTokens: 3,
            note: "Preview pricing estimate; confirm before production use.",
          },
        },
        {
          id: RECRAFT_VECTORIZE_MODEL,
          alias: "recraft-vectorize",
          profile: "quality",
        },
        {
          id: PRUNA_P_IMAGE_UPSCALE_MODEL,
          alias: "p-image-upscale",
          profile: "quality",
        },
        {
          id: GPT_IMAGE_2_MODEL,
          alias: "image-gpt-2",
          profile: "quality",
          pricing: { currency: "USD", perRunUsd: 0.05 },
        },
      ],
      message: this.apiToken
        ? undefined
        : "No Replicate credential is configured for this session.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (!SUPPORTED_TASKS.includes(request.task)) {
      throw new AiRuntimeError("NO_PROVIDER", `Replicate does not support ${request.task}.`, {
        provider: this.id,
      });
    }
    if (!this.apiToken) {
      throw new AiRuntimeError(
        "PROVIDER_AUTH",
        "No Replicate credential is configured for this session.",
        {
          provider: this.id,
        },
      );
    }
    if (request.task === "assistant.chat") {
      return (await this.executeChat(
        request as AiProviderRequest<"assistant.chat">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    if (request.task === "vectorize.recraft") {
      return (await this.vectorizeWithRecraft(
        request as AiProviderRequest<"vectorize.recraft">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    if (request.task === "prompt.enhance") {
      return (await this.enhancePrompt(
        request as AiProviderRequest<"prompt.enhance">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    if (request.task === "image.generate") {
      return (await this.generateImage(
        request as AiProviderRequest<"image.generate">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    if (request.task === "image.upscale") {
      return (await this.upscaleWithPruna(
        request as AiProviderRequest<"image.upscale">,
      )) as AiProviderResult<AiTaskOutput<K>>;
    }
    const input = request.input as AiVisionInput;
    const model = parseReplicateModel(request.model);
    const providerInput = createModelInput(model.slug, request.task, input);
    const prediction = await this.createPrediction(model, providerInput, request.signal);
    const completed = await this.waitForPrediction(prediction, request.signal);
    const text = textFromUnknownOutput(completed.output).trim();
    if (!text) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an empty model output.", {
        provider: this.id,
      });
    }

    const objects = request.task === "vision.propose" ? parseObjectProposals(text) : undefined;
    const output = request.task === "vision.propose" ? { text, objects: objects ?? [] } : { text };
    const metrics = completed.metrics ?? {};
    return {
      output: output as AiTaskOutput<K>,
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        inputTokens: numberFromMetrics(metrics, ["input_token_count", "input_tokens"]),
        outputTokens: numberFromMetrics(metrics, ["output_token_count", "output_tokens"]),
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings:
        request.task === "vision.propose" && objects?.length === 0
          ? ["The provider returned no valid normalized object boxes."]
          : [],
    };
  }

  private async executeChat(
    request: AiProviderRequest<"assistant.chat">,
  ): Promise<AiProviderResult<AiAssistantChatOutput>> {
    const input = request.input as AiAssistantChatInput;
    const model = parseReplicateModel(request.model);
    assertSupportedChatModel(model.slug);
    const isGemini = model.slug === GEMINI_CHAT_MODEL || model.slug.includes("gemini");
    const options = request.options;
    const dynamicThinking = options?.reasoning?.mode !== "off";
    const thinkingBudget =
      options?.reasoning?.mode === "fixed" ? options.reasoning.budgetTokens : undefined;

    const predictionInput = isGemini
      ? {
          prompt: renderConversationPrompt(input.messages),
          system_instruction: renderGeminiSystemInstruction(input),
          dynamic_thinking: dynamicThinking,
          ...(thinkingBudget !== undefined ? { thinking_budget: thinkingBudget } : {}),
          max_output_tokens: Math.min(
            MAX_CHAT_OUTPUT_TOKENS,
            Math.max(256, input.maxTokens ?? 4_096),
          ),
          temperature: 0.1,
        }
      : {
          prompt: renderHarmonyPrompt(input),
          max_tokens: Math.min(MAX_CHAT_OUTPUT_TOKENS, Math.max(256, input.maxTokens ?? 4_096)),
          temperature: 0.1,
          top_p: 1,
        };

    const prediction = await this.createPrediction(
      model,
      predictionInput,
      request.signal,
    );
    const completed = await this.waitForPrediction(prediction, request.signal);
    const raw = textFromUnknownOutput(completed.output).trim();
    if (!raw) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an empty chat output.", {
        provider: this.id,
      });
    }
    const parsed = parseReplicateAssistantOutput(raw, input.tools ?? []);
    request.onTextDelta?.(parsed.output.text);
    const metrics = completed.metrics ?? {};
    return {
      output: parsed.output,
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        inputTokens: numberFromMetrics(metrics, ["input_token_count", "input_tokens"]),
        outputTokens: numberFromMetrics(metrics, ["output_token_count", "output_tokens"]),
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings: parsed.warnings,
    };
  }

  private async enhancePrompt(
    request: AiProviderRequest<"prompt.enhance">,
  ): Promise<AiProviderResult<AiTaskOutput<"prompt.enhance">>> {
    const input = request.input as AiPromptEnhanceInput;
    const model = parseReplicateModel(request.model);
    assertSupportedChatModel(model.slug);
    const isGemini = model.slug === GEMINI_CHAT_MODEL || model.slug.includes("gemini");
    const predictionInput = isGemini
      ? {
          prompt: input.prompt,
          system_instruction:
            input.purpose === "image"
              ? "Rewrite the user's request as one precise image-generation prompt. Return only the rewritten prompt."
              : "Rewrite the user's request to be precise and actionable. Return only the rewritten prompt.",
          dynamic_thinking: false,
          thinking_budget: 0,
          max_output_tokens: 512,
          temperature: 0.1,
        }
      : {
          prompt: renderHarmonyPrompt({
            messages: [{ role: "user", content: input.prompt }],
            system:
              input.purpose === "image"
                ? "Rewrite the user's request as one precise image-generation prompt. Return only the rewritten prompt."
                : "Rewrite the user's request to be precise and actionable. Return only the rewritten prompt.",
          }),
          max_tokens: 512,
          temperature: 0.1,
          top_p: 1,
        };
    const prediction = await this.createPrediction(
      model,
      predictionInput,
      request.signal,
    );
    const completed = await this.waitForPrediction(prediction, request.signal);
    const raw = textFromUnknownOutput(completed.output).trim();
    if (!raw) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an empty prompt.", {
        provider: this.id,
      });
    }
    const parsed = parseReplicateAssistantOutput(raw, []);
    const prompt = parsed.output.text || raw;
    request.onTextDelta?.(prompt);
    const metrics = completed.metrics ?? {};
    return {
      output: { prompt },
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        inputTokens: numberFromMetrics(metrics, ["input_token_count", "input_tokens"]),
        outputTokens: numberFromMetrics(metrics, ["output_token_count", "output_tokens"]),
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings: parsed.warnings,
    };
  }

  private async generateImage(
    request: AiProviderRequest<"image.generate">,
  ): Promise<AiProviderResult<AiTaskOutput<"image.generate">>> {
    const input = request.input as AiImageGenerateInput;
    const model = parseReplicateModel(request.model);
    if (model.slug !== GPT_IMAGE_2_MODEL) {
      throw new AiRuntimeError("INVALID_INPUT", "Unsupported Replicate image generation model.", {
        provider: this.id,
      });
    }

    const prediction = await this.createPrediction(
      model,
      {
        prompt: input.prompt,
        quality: input.quality ?? "medium",
        aspect_ratio: input.aspectRatio ?? aspectRatioFromDimensions(input.width, input.height),
        ...(input.inputImages?.length
          ? { input_images: input.inputImages.map((image) => image.dataUrl) }
          : {}),
        number_of_images: 1,
        output_format: "webp",
        output_compression: 90,
        background: "opaque",
        moderation: "auto",
      },
      request.signal,
      true,
    );
    const completed = await this.waitForPrediction(prediction, request.signal, true);
    const outputUrl = extractFileUrl(completed.output);
    if (!outputUrl) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned no generated image file.", {
        provider: this.id,
      });
    }
    const dataUrl = await fetchGeneratedImage(outputUrl, request.signal);
    const metrics = completed.metrics ?? {};
    return {
      output: {
        dataUrl,
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        seed: input.seed ?? 0,
      },
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings:
        input.seed === undefined
          ? []
          : [
              "GPT Image 2 does not expose deterministic seed control; the seed was not sent upstream.",
            ],
    };
  }

  private async vectorizeWithRecraft(
    request: AiProviderRequest<"vectorize.recraft">,
  ): Promise<AiProviderResult<AiTaskOutput<"vectorize.recraft">>> {
    const input = request.input as AiVectorizeInput;
    assertReplicateImageDataUrl(input.image.dataUrl);
    assertRecraftDimensions(input.width, input.height);
    const model = parseReplicateModel(request.model);
    if (model.slug !== RECRAFT_VECTORIZE_MODEL) {
      throw new AiRuntimeError("INVALID_INPUT", "Unsupported Replicate vectorizer model.", {
        provider: this.id,
      });
    }
    const prediction = await this.createPrediction(
      model,
      { image: input.image.dataUrl },
      request.signal,
      true,
    );
    const completed = await this.waitForPrediction(prediction, request.signal, true);
    const outputUrl = extractFileUrl(completed.output);
    if (!outputUrl) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned no SVG output file.", {
        provider: this.id,
      });
    }
    const svg = await fetchRecraftSvg(outputUrl, request.signal);
    const metrics = completed.metrics ?? {};
    return {
      output: { svg },
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        inputTokens: numberFromMetrics(metrics, ["input_token_count", "input_tokens"]),
        outputTokens: numberFromMetrics(metrics, ["output_token_count", "output_tokens"]),
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings: [],
    };
  }

  private async upscaleWithPruna(
    request: AiProviderRequest<"image.upscale">,
  ): Promise<AiProviderResult<AiTaskOutput<"image.upscale">>> {
    const input = request.input as AiImageUpscaleInput;
    assertReplicateImageDataUrl(input.image.dataUrl);
    assertPImageUpscaleInputDimensions(input.width, input.height);
    const model = parseReplicateModel(request.model);
    if (model.slug !== PRUNA_P_IMAGE_UPSCALE_MODEL) {
      throw new AiRuntimeError("INVALID_INPUT", "Unsupported Replicate upscaler model.", {
        provider: this.id,
      });
    }

    const prediction = await this.createPrediction(
      model,
      {
        image: input.image.dataUrl,
        upscale_mode: "target",
        target: input.targetMegapixels,
        enhance_details: true,
        enhance_realism: false,
        output_format: "png",
        output_quality: 100,
        disable_safety_checker: false,
      },
      request.signal,
      true,
    );
    const completed = await this.waitForPrediction(prediction, request.signal, true);
    const outputUrl = extractFileUrl(completed.output);
    if (!outputUrl) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned no upscaled image file.", {
        provider: this.id,
      });
    }
    const dataUrl = await fetchGeneratedImage(outputUrl, request.signal);
    const metrics = completed.metrics ?? {};
    return {
      output: { dataUrl },
      model:
        completed.model && completed.version
          ? `${completed.model}@${completed.version}`
          : request.model,
      requestId: completed.id,
      finishReason: completed.status,
      usage: {
        providerSeconds: numberFromMetrics(metrics, ["predict_time", "total_time"]),
      },
      warnings: [],
    };
  }

  private async createPrediction(
    model: { slug: string; version?: string },
    input: Record<string, unknown>,
    signal: AbortSignal,
    safeErrors = false,
  ): Promise<ReplicatePrediction> {
    const endpoint = model.version
      ? "https://api.replicate.com/v1/predictions"
      : `https://api.replicate.com/v1/models/${model.slug}/predictions`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
        Prefer: "wait=60",
        "Cancel-After": REPLICATE_PREDICTION_CANCEL_AFTER,
      },
      body: JSON.stringify(model.version ? { version: model.version, input } : { input }),
      signal,
    });
    if (safeErrors) await assertRecraftProviderResponse(response);
    else await assertProviderResponse(response, this.id);
    return (await response.json()) as ReplicatePrediction;
  }

  private async waitForPrediction(
    prediction: ReplicatePrediction,
    signal: AbortSignal,
    safeErrors = false,
  ): Promise<ReplicatePrediction> {
    let current = prediction;
    const cancelRemote = () => {
      if (!current.urls?.cancel) return;
      void fetch(current.urls.cancel, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiToken}` },
      }).catch(() => undefined);
    };
    signal.addEventListener("abort", cancelRemote, { once: true });
    try {
      while (current.status === "starting" || current.status === "processing") {
        if (!current.urls?.get) {
          throw new AiRuntimeError(
            "PROVIDER_SCHEMA",
            "Replicate omitted the prediction status URL.",
            {
              provider: this.id,
            },
          );
        }
        try {
          await delay(1_000, signal);
        } catch (error) {
          if (isExecutionTimeout(signal.reason) && current.id) {
            throw new AiRuntimeError(
              "PROVIDER_UNAVAILABLE",
              "Replicate prediction status could not be confirmed.",
              {
                provider: this.id,
                cause: error,
                outcomeUnknown: true,
                predictionId: current.id,
              },
            );
          }
          throw error;
        }
        let response: Response;
        try {
          response = await fetch(current.urls.get, {
            headers: { Authorization: `Bearer ${this.apiToken}` },
            signal,
          });
        } catch (error) {
          if (signal.aborted && !isExecutionTimeout(signal.reason)) throw error;
          throw new AiRuntimeError(
            "PROVIDER_UNAVAILABLE",
            "Replicate prediction status could not be confirmed.",
            {
              provider: this.id,
              cause: error,
              outcomeUnknown: true,
              predictionId: current.id,
            },
          );
        }
        try {
          if (safeErrors) await assertRecraftProviderResponse(response);
          else await assertProviderResponse(response, this.id);
          current = (await response.json()) as ReplicatePrediction;
        } catch (error) {
          if (signal.aborted && !isExecutionTimeout(signal.reason)) throw error;
          throw new AiRuntimeError(
            "PROVIDER_UNAVAILABLE",
            "Replicate prediction status could not be confirmed.",
            {
              provider: this.id,
              cause: error,
              outcomeUnknown: true,
              predictionId: current.id,
            },
          );
        }
      }
      if (current.status !== "succeeded") {
        throw new AiRuntimeError(
          current.status === "canceled" || current.status === "aborted"
            ? "ABORTED"
            : "PROVIDER_UNAVAILABLE",
          typeof current.error === "string" ? current.error : "Replicate prediction failed.",
          { provider: this.id },
        );
      }
      return current;
    } finally {
      signal.removeEventListener("abort", cancelRemote);
    }
  }
}

function extractFileUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (
      first &&
      typeof first === "object" &&
      typeof (first as { url?: unknown }).url === "string"
    ) {
      return (first as { url: string }).url;
    }
  }
  if (
    output &&
    typeof output === "object" &&
    typeof (output as { url?: unknown }).url === "string"
  ) {
    return (output as { url: string }).url;
  }
  return undefined;
}

function aspectRatioFromDimensions(width: number, height: number): "1:1" | "3:2" | "2:3" {
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.08) return "1:1";
  return ratio > 1 ? "3:2" : "2:3";
}

async function fetchGeneratedImage(outputUrl: string, signal: AbortSignal): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(outputUrl);
  } catch {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an invalid image URL.", {
      provider: "replicate",
    });
  }
  const isReplicateDelivery =
    parsed.protocol === "https:" &&
    (parsed.hostname === "replicate.delivery" || parsed.hostname.endsWith(".replicate.delivery"));
  if (!isReplicateDelivery) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an unsupported image URL.", {
      provider: "replicate",
    });
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { Accept: "image/webp, image/png, image/jpeg" },
      redirect: "manual",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new AiRuntimeError("PROVIDER_UNAVAILABLE", "Replicate image output is unavailable.", {
      provider: "replicate",
      cause: error,
    });
  }
  if (!response.ok || response.status >= 300) {
    throw new AiRuntimeError("PROVIDER_UNAVAILABLE", "Replicate image output is unavailable.", {
      provider: "replicate",
    });
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_GENERATED_IMAGE_BYTES) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an oversized image.", {
      provider: "replicate",
    });
  }
  const rawContentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  const mimeType = rawContentType || "image/webp";
  if (!GENERATED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned a non-image output.", {
      provider: "replicate",
    });
  }
  const bytes = await readBoundedBytes(response, MAX_GENERATED_IMAGE_BYTES);
  if (bytes.byteLength === 0) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an invalid image output.", {
      provider: "replicate",
    });
  }
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function readBoundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an oversized image.", {
        provider: "replicate",
      });
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an oversized image.", {
          provider: "replicate",
        });
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function assertReplicateImageDataUrl(dataUrl: string): void {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match || match[1].length % 4 === 1) {
    throw new AiRuntimeError("INVALID_INPUT", "Expected a valid JPEG, PNG or WebP image.", {
      provider: "replicate",
    });
  }
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((match[1].length * 3) / 4) - padding;
  if (byteLength > MAX_RECRAFT_INPUT_BYTES) {
    throw new AiRuntimeError("INVALID_INPUT", "Replicate accepts images up to 5 MB.", {
      provider: "replicate",
    });
  }
}

function assertRecraftDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 256 ||
    height < 256 ||
    width > 4_096 ||
    height > 4_096 ||
    width * height > MAX_RECRAFT_PIXELS
  ) {
    throw new AiRuntimeError(
      "INVALID_INPUT",
      "Recraft accepts images from 256px up to 4096px and 16 megapixels.",
      { provider: "replicate" },
    );
  }
}

function assertPImageUpscaleInputDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 4_096 ||
    height > 4_096 ||
    width * height > MAX_RECRAFT_PIXELS
  ) {
    throw new AiRuntimeError(
      "INVALID_INPUT",
      "P-Image-Upscale accepts input images up to 4096px and 16 megapixels.",
      { provider: "replicate" },
    );
  }
}

function assertRecraftProviderResponse(response: Response): void {
  if (response.ok) return;
  const retryAfter = Number(response.headers.get("retry-after") ?? 0) || undefined;
  if (response.status === 401 || response.status === 403) {
    throw new AiRuntimeError("PROVIDER_AUTH", "Replicate rejected this request.", {
      provider: "replicate",
    });
  }
  if (response.status === 429) {
    throw new AiRuntimeError("PROVIDER_RATE_LIMIT", "Replicate rate limit reached.", {
      provider: "replicate",
      retryAfterSeconds: retryAfter,
    });
  }
  throw new AiRuntimeError("PROVIDER_UNAVAILABLE", "Replicate is temporarily unavailable.", {
    provider: "replicate",
  });
}

async function fetchRecraftSvg(outputUrl: string, signal: AbortSignal): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(outputUrl);
  } catch {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an invalid SVG URL.", {
      provider: "replicate",
    });
  }
  const isReplicateDelivery =
    parsed.protocol === "https:" &&
    (parsed.hostname === "replicate.delivery" || parsed.hostname.endsWith(".replicate.delivery"));
  if (!isReplicateDelivery) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an unsupported SVG URL.", {
      provider: "replicate",
    });
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { Accept: "image/svg+xml, text/plain" },
      redirect: "manual",
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw new AiRuntimeError("PROVIDER_UNAVAILABLE", "Replicate SVG output is unavailable.", {
      provider: "replicate",
      cause: error,
    });
  }
  if (!response.ok || response.status >= 300) {
    throw new AiRuntimeError("PROVIDER_UNAVAILABLE", "Replicate SVG output is unavailable.", {
      provider: "replicate",
    });
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (
    contentType &&
    !["image/svg+xml", "text/plain", "application/octet-stream"].includes(contentType)
  ) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned a non-SVG output file.", {
      provider: "replicate",
    });
  }
  const svg = await response.text();
  if (
    !svg.trim() ||
    svg.length > MAX_RECRAFT_SVG_CHARS ||
    !/<svg\b/i.test(svg) ||
    !/<\/svg\s*>/i.test(svg)
  ) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an invalid SVG output.", {
      provider: "replicate",
    });
  }
  if (/<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg) || /\bon[a-z]+\s*=/i.test(svg)) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an unsafe SVG output.", {
      provider: "replicate",
    });
  }
  if (/\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|data:|javascript:)/i.test(svg)) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate returned an external SVG reference.", {
      provider: "replicate",
    });
  }
  return svg;
}

function isExecutionTimeout(reason: unknown): boolean {
  return reason instanceof AiRuntimeError && reason.code === "TIMEOUT";
}

function parseReplicateModel(model: string): { slug: string; version?: string } {
  const [slug, version] = model.split("@");
  if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(slug)) {
    throw new AiRuntimeError("INVALID_INPUT", "Invalid Replicate model slug.", {
      provider: "replicate",
    });
  }
  if (version && !/^[a-f0-9]{32,128}$/i.test(version)) {
    throw new AiRuntimeError("INVALID_INPUT", "Invalid Replicate model version.", {
      provider: "replicate",
    });
  }
  return { slug, ...(version ? { version } : {}) };
}

function assertSupportedChatModel(model: string): void {
  if (
    model === CHAT_MODEL ||
    model === GEMINI_CHAT_MODEL ||
    model.startsWith("google/gemini-2.5-flash")
  ) {
    return;
  }
  throw new AiRuntimeError("INVALID_INPUT", `Unsupported Replicate chat model ${model}.`, {
    provider: "replicate",
  });
}

function createModelInput(
  model: string,
  task: AiTaskKind,
  input: AiVisionInput,
): Record<string, unknown> {
  const prompt = createVisionPrompt(task, input);
  if (model === GPT_MODEL) {
    return {
      prompt,
      image_input: [input.image.dataUrl],
      max_completion_tokens: task === "vision.propose" ? 2_048 : 1_024,
      temperature: task === "vision.propose" ? 0 : 0.2,
    };
  }
  if (model === GEMINI_MODEL) {
    return {
      prompt,
      images: [input.image.dataUrl],
      thinking_level: task === "vision.propose" ? "low" : "none",
      max_output_tokens: task === "vision.propose" ? 2_048 : 1_024,
      temperature: task === "vision.propose" ? 0 : 0.2,
    };
  }
  throw new AiRuntimeError("INVALID_INPUT", `Unsupported Replicate model ${model}.`, {
    provider: "replicate",
  });
}

function createVisionPrompt(task: AiTaskKind, input: AiVisionInput): string {
  if (task === "vision.propose") {
    return [
      input.prompt ??
        "Find every visually distinct foreground object and meaningful attached part.",
      "Return JSON only with this schema:",
      '{"objects":[{"label":"string","confidence":0.0,"box":{"x":0.0,"y":0.0,"width":0.0,"height":0.0}}]}',
      "Coordinates must be normalized to 0..1 relative to the full image.",
      "Keep attached thin parts such as straws, handles, straps, rings and stems inside their owning object box.",
      "Do not include decorative background patterns or empty whitespace.",
    ].join("\n");
  }
  if (task === "vision.ocr") {
    return (
      input.prompt ??
      `Transcribe every visible text region accurately${input.language ? ` in ${input.language}` : ""}. Preserve reading order.`
    );
  }
  return (
    input.prompt ??
    "Describe the image precisely, including objects, layout, relationships, text and visual style."
  );
}

function numberFromMetrics(metrics: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}
