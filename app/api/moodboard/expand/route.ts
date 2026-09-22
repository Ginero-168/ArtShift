import { type NextRequest, NextResponse } from "next/server";
import { isMoodboardBatchCount, type MoodboardBatchCount } from "@/lib/moodboard/constants";
import {
  moodboardExpandMaxTokens,
  moodboardExpandRetryPrompt,
  moodboardExpandSystemPrompt,
  moodboardExpandUserPrompt,
} from "@/lib/moodboard/expandPrompt";
import { parseMoodboardExpandJson } from "@/lib/moodboard/expandSchema";
import { looksTruncatedJson, safeModelTextPreview } from "@/lib/moodboard/json";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { requireEndUserCloudAi } from "@/lib/server/ai/endUserCloudGuard";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(12, 60_000);
const MAX_BODY_BYTES = 8_000;

/**
 * Keyword / vibe → Gemini Flash associative expand → exactly N distinct image prompts.
 * N is 9, 16, or 25. Pixel generation is a separate Replicate gpt-image-2.5-flare step.
 */
export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
  if (!limit.ok) {
    return NextResponse.json(
      { error: { code: "PROVIDER_RATE_LIMIT", message: "Rate limit exceeded." } },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: { code: "INVALID_INPUT", message: "Moodboard expand request is too large." } },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid JSON body." } },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid Moodboard expand payload." } },
      { status: 400 },
    );
  }

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword || keyword.length > 160) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "A short prompt or keyword is required." } },
      { status: 400 },
    );
  }

  if (!isMoodboardBatchCount(body.count)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Batch count must be 9, 16, or 25." } },
      { status: 400 },
    );
  }
  const count = body.count;

  const access = requireEndUserCloudAi(req, body.cloudConsent);
  if (!access.ok) return access.response;

  const ai = getServerAiRuntime({
    replicateToken: access.replicateToken,
    accountId: access.account.id,
  });

  try {
    let execution = await runExpandChat(ai, access.account.id, req.signal, keyword, count, false);
    let parsed = parseExpandExecution(execution, count);
    if (!parsed.ok && looksTruncatedJson(collectChatOutputTexts(execution.output)[0] ?? "")) {
      execution = await runExpandChat(ai, access.account.id, req.signal, keyword, count, true);
      parsed = parseExpandExecution(execution, count);
    }
    if (!parsed.ok) {
      const raw = collectChatOutputTexts(execution.output)[0] ?? "";
      const preview = safeModelTextPreview(raw);
      const message = looksTruncatedJson(raw)
        ? "Expand JSON was cut off before it finished. Try again."
        : parsed.reason;
      return NextResponse.json(
        {
          error: {
            code: "PROVIDER_SCHEMA",
            message,
            preview,
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      pack: parsed.pack,
      count,
      model: execution.metadata.model,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "PROVIDER_UNAVAILABLE", message: "Moodboard expand failed." } },
      { status: 502 },
    );
  }
}

function runExpandChat(
  ai: { execute: ReturnType<typeof getServerAiRuntime>["execute"] },
  accountId: string,
  signal: AbortSignal,
  keyword: string,
  count: MoodboardBatchCount,
  retry: boolean,
) {
  return ai.execute(
    "assistant.chat",
    {
      system: moodboardExpandSystemPrompt(count),
      messages: [
        {
          role: "user",
          content: retry
            ? moodboardExpandRetryPrompt(keyword, count)
            : moodboardExpandUserPrompt(keyword, count),
        },
      ],
      maxTokens: moodboardExpandMaxTokens(count),
    },
    {
      profile: "quality",
      modelAlias: "creative-director",
      cloudConsent: true,
      allowFallback: false,
      timeoutMs: 90_000,
      maxCostUsd: 0.05,
      cache: false,
      accountId,
      signal,
      reasoning: { mode: "off" },
    },
  );
}

function parseExpandExecution(
  execution: {
    output?: unknown;
  },
  count: MoodboardBatchCount,
): ReturnType<typeof parseMoodboardExpandJson> {
  const texts = collectChatOutputTexts(execution.output);
  let parsed = parseMoodboardExpandJson(texts[0] ?? "", count);
  if (!parsed.ok) {
    for (const text of texts.slice(1)) {
      parsed = parseMoodboardExpandJson(text, count);
      if (parsed.ok) break;
    }
  }
  const rawOutput: unknown = execution.output;
  if (!parsed.ok && looksLikeExpandPack(rawOutput)) {
    parsed = parseMoodboardExpandJson(rawOutput, count);
  }
  return parsed;
}

function collectChatOutputTexts(output: unknown): string[] {
  const texts: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    texts.push(trimmed);
  };

  if (!isRecord(output)) return texts;
  push(output.text);
  push(output.output_text);
  const message = output.assistantMessage;
  if (isRecord(message)) {
    if (typeof message.content === "string") push(message.content);
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (isRecord(block) && (block.type === "text" || typeof block.text === "string")) {
          push(block.text);
        }
      }
    }
  }
  return texts;
}

function looksLikeExpandPack(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.keyword === "string" || Array.isArray(value.prompts);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
