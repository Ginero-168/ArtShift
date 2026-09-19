import { type NextRequest, NextResponse } from "next/server";
import {
  MOODBOARD_EXPAND_SYSTEM_PROMPT,
  moodboardExpandUserPrompt,
} from "@/lib/moodboard/expandPrompt";
import { parseMoodboardExpandJson } from "@/lib/moodboard/expandSchema";
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
 * Keyword → LLM vibe/association JSON only.
 * Does not call image.generate or any generative image route.
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
      { error: { code: "INVALID_INPUT", message: "A keyword is required." } },
      { status: 400 },
    );
  }

  const access = requireEndUserCloudAi(req, body.cloudConsent);
  if (!access.ok) return access.response;

  const ai = getServerAiRuntime({
    replicateToken: access.replicateToken,
    accountId: access.account.id,
  });

  try {
    const execution = await ai.execute(
      "assistant.chat",
      {
        system: MOODBOARD_EXPAND_SYSTEM_PROMPT,
        messages: [{ role: "user", content: moodboardExpandUserPrompt(keyword) }],
        maxTokens: 2200,
      },
      {
        profile: "quality",
        cloudConsent: true,
        allowFallback: false,
        timeoutMs: 60_000,
        maxCostUsd: 0.08,
        cache: false,
        accountId: access.account.id,
        signal: req.signal,
      },
    );

    const parsed = parseMoodboardExpandJson(execution.output?.text ?? "");
    if (!parsed.ok) {
      return NextResponse.json(
        { error: { code: "PROVIDER_SCHEMA", message: parsed.reason } },
        { status: 502 },
      );
    }

    return NextResponse.json({
      pack: parsed.pack,
      model: execution.metadata.model,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "PROVIDER_UNAVAILABLE", message: "Moodboard expand failed." } },
      { status: 502 },
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
