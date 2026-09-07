import { type NextRequest, NextResponse } from "next/server";
import {
  type CreativeOutputReviewInput,
  reviewCreativeOutput,
} from "@/lib/ai/orchestration/creativeDirector";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);
const MAX_BODY_BYTES = 100_000;

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limit = limiter.check(account ? `account:${account.id}` : `ip:${getClientIp(req)}`);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Creative Director review is too large." },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!account) {
    return NextResponse.json(
      { error: "Authentication is required for remote AI." },
      { status: 401 },
    );
  }
  if (!isRecord(raw) || raw.cloudConsent !== true) {
    return NextResponse.json(
      { error: "Explicit cloud consent is required for Creative Director review." },
      { status: 403 },
    );
  }
  const input = parseReviewInput(raw);
  if (!input) {
    return NextResponse.json({ error: "Invalid Creative Director review." }, { status: 400 });
  }

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const review = await reviewCreativeOutput(
      { ...input, cloudConsent: true, accountId: account.id },
      { execute: ai.execute.bind(ai), signal: req.signal },
    );
    return NextResponse.json({ review });
  } catch {
    return NextResponse.json(
      { error: "Creative Director review is temporarily unavailable." },
      { status: 502 },
    );
  }
}

function parseReviewInput(
  value: Record<string, unknown>,
): Omit<CreativeOutputReviewInput, "cloudConsent" | "accountId"> | null {
  if (!isString(value.prompt, 20_000, 1) || !isStringArray(value.reviewCriteria, 8, 500, 1)) {
    return null;
  }
  if (!isRecord(value.outputAnalysis) || containsSensitivePayload(value.outputAnalysis))
    return null;
  const analysis = value.outputAnalysis;
  if (
    !isString(analysis.caption, 2_000) ||
    !isStringArray(analysis.objects, 50, 200) ||
    !isString(analysis.visibleText, 2_000) ||
    !isStringArray(analysis.limitations, 20, 300)
  ) {
    return null;
  }
  return {
    prompt: value.prompt,
    reviewCriteria: value.reviewCriteria,
    outputAnalysis: {
      caption: analysis.caption,
      objects: analysis.objects,
      visibleText: analysis.visibleText,
      limitations: analysis.limitations,
    },
  };
}

function containsSensitivePayload(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value === "string") {
    return /data:image\/|replicate\.delivery|api[_-]?key|bearer\s+\S+|(?:secret|token|credential)\s*[:=]/iu.test(
      value,
    );
  }
  if (!value || typeof value !== "object" || seen.has(value as object)) return false;
  seen.add(value as object);
  if (Array.isArray(value)) return value.some((item) => containsSensitivePayload(item, seen));
  return Object.values(value as Record<string, unknown>).some((item) =>
    containsSensitivePayload(item, seen),
  );
}

function isString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isStringArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
  minItems = 0,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= minItems &&
    value.length <= maxItems &&
    value.every((item) => isString(item, maxLength, 1))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
