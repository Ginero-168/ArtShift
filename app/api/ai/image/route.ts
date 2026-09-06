import { type NextRequest, NextResponse } from "next/server";
import { cleanImagePrompt, enrichPrompt } from "@/lib/ai/imageGeneration";
import type { AiImageGenerateInput } from "@/lib/ai-runtime/contracts";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const imageGenLimiter = new RateLimiter(20, 60_000);

export async function POST(req: NextRequest) {
  const limit = imageGenLimiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawPrompt = typeof body.prompt === "string" ? body.prompt : "beautiful artwork";
  const normalizedPrompt = cleanImagePrompt(rawPrompt) || rawPrompt.trim() || "beautiful artwork";
  if (normalizedPrompt.length > 32_000) {
    return NextResponse.json({ error: "Image prompt is too long." }, { status: 400 });
  }
  const width = boundedDimension(body.width);
  const height = boundedDimension(body.height);
  const aspectRatio = boundedAspectRatio(body.aspectRatio);
  const quality = boundedQuality(body.quality);
  const inputImages = boundedInputImages(body.inputImages);
  const enhance = body.enhance !== false;
  const ai = getServerAiRuntime({ replicateToken: getSessionReplicateToken(req) });

  let prompt = normalizedPrompt;
  let promptWarning: string | undefined;
  if (enhance) {
    try {
      const enhanced = await ai.execute(
        "prompt.enhance",
        { prompt: normalizedPrompt, purpose: "image" },
        {
          profile: "economy",
          cloudConsent: true,
          allowFallback: false,
          timeoutMs: 20_000,
          maxCostUsd: 0.02,
          signal: req.signal,
        },
      );
      prompt = enhanced.output.prompt;
    } catch {
      prompt = enrichPrompt(normalizedPrompt);
      promptWarning = "Cloud prompt enhancement was unavailable; local enrichment was used.";
    }
  }

  try {
    const execution = await ai.execute(
      "image.generate",
      { prompt, width, height, aspectRatio, quality, inputImages, enhance: false },
      {
        profile: "quality",
        provider: "replicate",
        modelAlias: "image-gpt-2",
        cloudConsent: true,
        allowFallback: false,
        timeoutMs: 90_000,
        maxCostUsd: 0.05,
        signal: req.signal,
      },
    );
    return NextResponse.json({
      success: true,
      ...execution.output,
      provider: execution.metadata.provider,
      model: execution.metadata.model,
      usage: execution.metadata.usage,
      warnings: [promptWarning, ...execution.metadata.warnings].filter(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image generation failed.";
    const status = error instanceof AiRuntimeError && error.code === "PROVIDER_AUTH" ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

function boundedAspectRatio(value: unknown): AiImageGenerateInput["aspectRatio"] {
  const allowed: AiImageGenerateInput["aspectRatio"][] = [
    "1:1",
    "3:2",
    "2:3",
    "4:3",
    "3:4",
    "16:9",
    "9:16",
    "auto",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "1536x1152",
    "1152x1536",
    "2048x2048",
    "2048x1152",
    "1152x2048",
    "3840x2160",
    "2160x3840",
  ];
  return typeof value === "string" && allowed.includes(value as AiImageGenerateInput["aspectRatio"])
    ? (value as AiImageGenerateInput["aspectRatio"])
    : undefined;
}

function boundedDimension(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2_048, Math.max(256, Math.round(value)))
    : 1_024;
}

function boundedQuality(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "high" ? value : "medium";
}

function boundedInputImages(
  value: unknown,
): Array<{ dataUrl: string; mimeType?: "image/jpeg" | "image/png" | "image/webp" }> {
  if (!Array.isArray(value) || value.length > 4) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (
      typeof record.dataUrl !== "string" ||
      !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u.test(record.dataUrl)
    ) {
      return [];
    }
    const mimeType = record.mimeType;
    return [
      {
        dataUrl: record.dataUrl,
        ...(mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp"
          ? { mimeType }
          : {}),
      },
    ];
  });
}
