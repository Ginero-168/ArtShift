import type {
  AiImageGenerateInput,
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
import { assertProviderResponse } from "./shared";

type PollinationsImage = {
  url?: string;
  b64_json?: string;
  media_type?: string;
  revised_prompt?: string;
};

type PollinationsResponse = {
  data?: PollinationsImage[];
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
};

export class PollinationsAiAdapter implements AiProviderAdapter {
  readonly id = "pollinations" as const;

  constructor(private readonly apiKey = process.env.POLLINATIONS_API_KEY) {}

  async status(): Promise<AiProviderStatus> {
    return {
      id: this.id,
      label: "Pollinations",
      configured: Boolean(this.apiKey),
      state: this.apiKey ? "ready" : "missing-key",
      tasks: ["image.generate"],
      models: [{ id: "flux", alias: "image-primary", profile: "economy" }],
      message: this.apiKey ? undefined : "POLLINATIONS_API_KEY is not configured.",
    };
  }

  async execute<K extends AiTaskKind>(
    request: AiProviderRequest<K>,
  ): Promise<AiProviderResult<AiTaskOutput<K>>> {
    if (request.task !== "image.generate") {
      throw new AiRuntimeError("NO_PROVIDER", `Pollinations does not support ${request.task}.`, {
        provider: this.id,
      });
    }
    if (!this.apiKey) {
      throw new AiRuntimeError("PROVIDER_AUTH", "POLLINATIONS_API_KEY is not configured.", {
        provider: this.id,
      });
    }
    const input = request.input as AiImageGenerateInput;
    const seed = input.seed ?? Math.floor(Math.random() * 10_000_000);
    const response = await fetch("https://gen.pollinations.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: input.prompt,
        model: request.model || "flux",
        n: 1,
        size: `${input.width}x${input.height}`,
        quality: "medium",
        response_format: "b64_json",
        safe: true,
      }),
      signal: request.signal,
    });
    await assertProviderResponse(response, this.id);
    const payload = (await response.json()) as PollinationsResponse;
    const image = payload.data?.[0];
    const dataUrl = await resolveImageDataUrl(image, request.signal);
    return {
      output: {
        dataUrl,
        prompt: image?.revised_prompt?.trim() || input.prompt,
        width: input.width,
        height: input.height,
        seed,
      } as AiTaskOutput<K>,
      model: request.model || "flux",
      usage: {
        inputTokens: payload.usage?.input_tokens,
        outputTokens: payload.usage?.output_tokens,
        totalTokens: payload.usage?.total_tokens,
      },
      warnings:
        input.seed === undefined
          ? []
          : ["The provider may not guarantee deterministic seed reuse."],
    };
  }
}

async function resolveImageDataUrl(
  image: PollinationsImage | undefined,
  signal: AbortSignal,
): Promise<string> {
  if (!image) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Pollinations returned no image.", {
      provider: "pollinations",
    });
  }
  if (image.b64_json) {
    const mimeType = image.media_type?.startsWith("image/") ? image.media_type : "image/png";
    return `data:${mimeType};base64,${image.b64_json}`;
  }
  if (image.url && /^https:\/\//i.test(image.url)) {
    const response = await fetch(image.url, { signal });
    await assertProviderResponse(response, "pollinations");
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
    const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
    return `data:${mimeType};base64,${bytes}`;
  }
  throw new AiRuntimeError("PROVIDER_SCHEMA", "Pollinations returned an invalid image payload.", {
    provider: "pollinations",
  });
}
