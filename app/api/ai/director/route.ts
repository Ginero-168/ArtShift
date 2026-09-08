import { type NextRequest, NextResponse } from "next/server";
import {
  type CreativeDirectorInput,
  CreativeDirectorValidationError,
  prepareOrchestratorTurn,
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
    const direction = await prepareOrchestratorTurn(
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
  } catch (error) {
    console.error("[Creative Director Route Error]:", error);
    if (error instanceof CreativeDirectorValidationError) {
      return NextResponse.json(
        {
          code: error.code,
          error:
            "Creative Director ส่งแผนไม่ครบตามรูปแบบที่กำหนด ยังไม่ได้สร้าง Task หรือเรียก Image Model กรุณาลองใหม่",
        },
        { status: 502 },
      );
    }
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
  const conversationHistory = parseConversationHistory(value.conversationHistory);
  if (value.conversationHistory !== undefined && !conversationHistory) return null;
  const artworkContext = parseArtworkContext(value.artworkContext);
  if (value.artworkContext !== undefined && artworkContext === undefined) return null;
  const designContext = parseDesignContext(value.designContext);
  if (value.designContext !== undefined && !designContext) return null;
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
    ...(conversationHistory ? { conversationHistory } : {}),
    ...(artworkContext !== undefined ? { artworkContext } : {}),
    ...(designContext ? { designContext } : {}),
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

function parseDesignContext(
  value: unknown,
): CreativeDirectorInput["designContext"] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || containsSensitivePayload(value)) return null;
  const snapshot = parseArtworkContext(value.snapshot);
  if (
    snapshot === undefined ||
    !isSafeString(value.docId, 200, 1) ||
    !isSafeString(value.artworkId, 200, 1) ||
    !isRevision(value.baseRevision) ||
    !isBoundedNumber(value.artworkWidth, 1, 100_000) ||
    !isBoundedNumber(value.artworkHeight, 1, 100_000) ||
    typeof value.hasSelection !== "boolean" ||
    !Array.isArray(value.selectedObjectIds) ||
    value.selectedObjectIds.length > 300 ||
    value.selectedObjectIds.some((id) => !isSafeString(id, 200, 1))
  ) {
    return null;
  }
  return {
    docId: value.docId,
    artworkId: value.artworkId,
    baseRevision: value.baseRevision,
    artworkWidth: value.artworkWidth,
    artworkHeight: value.artworkHeight,
    hasSelection: value.hasSelection,
    selectedObjectIds: value.selectedObjectIds,
    snapshot,
  };
}

function parseConversationHistory(
  value: unknown,
): CreativeDirectorInput["conversationHistory"] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 12) return null;
  const messages: NonNullable<CreativeDirectorInput["conversationHistory"]>[number][] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      !isSafeString(item.content, 12_000, 1) ||
      containsSensitivePayload(item.content)
    ) {
      return null;
    }
    messages.push({ role: item.role, content: item.content });
  }
  return messages;
}

function parseArtworkContext(value: unknown): unknown | undefined {
  if (value === undefined) return undefined;
  if (containsSensitivePayload(value)) return undefined;
  try {
    return JSON.stringify(value).length <= 80_000 ? value : undefined;
  } catch {
    return undefined;
  }
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

function isRevision(value: unknown): value is number | string {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0 && value.length <= 200)
  );
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
