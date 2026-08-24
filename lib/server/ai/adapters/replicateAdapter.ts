import type {
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
import { assertProviderResponse, parseObjectProposals, textFromUnknownOutput } from "./shared";

const SUPPORTED_TASKS: AiTaskKind[] = ["vision.describe", "vision.propose", "vision.ocr"];
const GPT_MODEL = "openai/gpt-4o-mini";
const GEMINI_MODEL = "google/gemini-3-flash";

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

  constructor(private readonly apiToken = process.env.REPLICATE_API_TOKEN) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Replicate",
      configured: Boolean(this.apiToken),
      state: this.apiToken ? "ready" : "missing-key",
      tasks: SUPPORTED_TASKS,
      models: [
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
      ],
      message: this.apiToken ? undefined : "REPLICATE_API_TOKEN is not configured.",
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
      throw new AiRuntimeError("PROVIDER_AUTH", "REPLICATE_API_TOKEN is not configured.", {
        provider: this.id,
      });
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

  private async createPrediction(
    model: { slug: string; version?: string },
    input: Record<string, unknown>,
    signal: AbortSignal,
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
        "Cancel-After": "90s",
      },
      body: JSON.stringify(model.version ? { version: model.version, input } : { input }),
      signal,
    });
    await assertProviderResponse(response, this.id);
    return (await response.json()) as ReplicatePrediction;
  }

  private async waitForPrediction(
    prediction: ReplicatePrediction,
    signal: AbortSignal,
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
        await delay(1_000, signal);
        const response = await fetch(current.urls.get, {
          headers: { Authorization: `Bearer ${this.apiToken}` },
          signal,
        });
        await assertProviderResponse(response, this.id);
        current = (await response.json()) as ReplicatePrediction;
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
