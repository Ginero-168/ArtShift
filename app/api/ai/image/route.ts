import { type NextRequest, NextResponse } from "next/server";
import { cleanImagePrompt, enrichPrompt } from "@/lib/ai/pollinations";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";

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
  const enhance = body.enhance !== false;
  const modelAlias = imageModelAlias(body.model);
  const ai = getServerAiRuntime();

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
      { prompt, width, height, enhance: false },
      {
        profile: "economy",
        modelAlias,
        allowFallback: false,
        timeoutMs: 90_000,
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

function boundedDimension(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(2_048, Math.max(256, Math.round(value)))
    : 1_024;
}

function imageModelAlias(value: unknown): string {
  switch (value) {
    case "flux-realism":
      return "image-realism";
    case "flux-anime":
      return "image-anime";
    case "flux-3d":
      return "image-3d";
    case "turbo":
      return "image-fast";
    default:
      return "image-primary";
  }
}
