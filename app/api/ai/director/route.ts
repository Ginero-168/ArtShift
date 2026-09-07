import { type NextRequest, NextResponse } from "next/server";
import {
  type CreativeDirectorInput,
  prepareCreativeDirection,
} from "@/lib/ai/orchestration/creativeDirector";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { isImageSearchConfigured, searchImageReferences } from "@/lib/server/ai/contextImageSearch";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);
const MAX_BODY_BYTES = 300_000;
const AVAILABLE_DIRECTOR_CAPABILITIES = ["IMAGE_DEFAULT", "IMAGE_EDIT"] as const;

export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
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
        { error: "Creative Director request is too large." },
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
      { error: "Explicit cloud consent is required for the Creative Director." },
      { status: 403 },
    );
  }

  const input = parseDirectorInput(raw);
  if (!input) {
    return NextResponse.json({ error: "Invalid Creative Director request." }, { status: 400 });
  }

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const direction = await prepareCreativeDirection(
      {
        ...input,
        availableCapabilities: [...AVAILABLE_DIRECTOR_CAPABILITIES],
        cloudConsent: true,
        accountId: account.id,
      },
      {
        execute: ai.execute.bind(ai),
        signal: req.signal,
        searchImagesAvailable: isImageSearchConfigured(),
        searchImages: (query, limit, signal) => searchImageReferences(query, limit, { signal }),
      },
    );
    return NextResponse.json({ direction });
  } catch {
    return NextResponse.json(
      { error: "Creative Director is temporarily unavailable." },
      { status: 502 },
    );
  }
}

function parseDirectorInput(
  value: Record<string, unknown>,
): Omit<CreativeDirectorInput, "availableCapabilities" | "cloudConsent" | "accountId"> | null {
  if (!isSafeString(value.prompt, 20_000, 1) || containsSensitivePayload(value.prompt)) return null;
  if (!isRecord(value.canvasSummary)) return null;
  const canvas = value.canvasSummary;
  if (
    !isBoundedNumber(canvas.objectCount, 0, 10_000) ||
    !isBoundedNumber(canvas.selectedCount, 0, 1_000) ||
    !isBoundedNumber(canvas.width, 1, 100_000) ||
    !isBoundedNumber(canvas.height, 1, 100_000) ||
    (canvas.brandName !== undefined && !isSafeString(canvas.brandName, 200, 1))
  ) {
    return null;
  }
  if (!Array.isArray(value.referenceAnalyses) || value.referenceAnalyses.length > 4) return null;
  const referenceAnalyses: Array<CreativeDirectorInput["referenceAnalyses"][number]> = [];
  for (const candidate of value.referenceAnalyses) {
    if (!isRecord(candidate) || containsSensitivePayload(candidate)) return null;
    if (
      !isSafeString(candidate.caption, 2_000) ||
      !isStringArray(candidate.objects, 50, 200) ||
      !isSafeString(candidate.visibleText, 2_000) ||
      !isRecord(candidate.dimensions) ||
      !isBoundedNumber(candidate.dimensions.width, 1, 100_000) ||
      !isBoundedNumber(candidate.dimensions.height, 1, 100_000) ||
      !isBoundedNumber(candidate.dimensions.aspectRatio, 0.0001, 10_000) ||
      !isStringArray(candidate.appearanceNotes, 20, 300) ||
      !isStringArray(candidate.limitations, 20, 300)
    ) {
      return null;
    }
    referenceAnalyses.push({
      caption: candidate.caption,
      objects: candidate.objects,
      visibleText: candidate.visibleText,
      dimensions: {
        width: candidate.dimensions.width,
        height: candidate.dimensions.height,
        aspectRatio: candidate.dimensions.aspectRatio,
      },
      appearanceNotes: candidate.appearanceNotes,
      limitations: candidate.limitations,
    });
  }
  return {
    prompt: value.prompt,
    canvasSummary: {
      objectCount: canvas.objectCount,
      selectedCount: canvas.selectedCount,
      width: canvas.width,
      height: canvas.height,
      ...(typeof canvas.brandName === "string" ? { brandName: canvas.brandName } : {}),
    },
    referenceAnalyses,
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

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isSafeString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isSafeString(item, maxLength))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
