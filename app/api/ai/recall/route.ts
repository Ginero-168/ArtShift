import { type NextRequest, NextResponse } from "next/server";
import {
  DIRECTOR_CONVERSATION_HISTORY_LIMIT,
  type PriorImageGenerationContext,
} from "@/lib/ai/orchestration/chatContinuity";
import { executeFollowUpRecall } from "@/lib/ai/orchestration/followUpRecall";
import { parsePriorImageGenerationPayload } from "@/lib/ai/orchestration/priorGenerationParse";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);
const MAX_BODY_BYTES = 300_000;

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
      return NextResponse.json({ error: "Recall request is too large." }, { status: 413 });
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
      { error: "Explicit cloud consent is required for follow-up recall." },
      { status: 403 },
    );
  }

  const input = parseRecallInput(raw);
  if (!input) {
    return NextResponse.json({ error: "Invalid follow-up recall request." }, { status: 400 });
  }

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const recall = await executeFollowUpRecall(ai, input, {
      signal: req.signal,
      accountId: account.id,
    });
    return NextResponse.json({
      recall,
      model: recall.model ?? null,
    });
  } catch (error) {
    console.error("[Follow-up Recall Route Error]:", error);
    return NextResponse.json(
      { error: "Follow-up recall is temporarily unavailable." },
      { status: 502 },
    );
  }
}

function parseInsertedPromptImages(value: unknown):
  | {
      objectId: string;
      fileId: string;
      displayName: string;
      sourceWidth: number;
      sourceHeight: number;
      width: number;
      height: number;
      elementVersion: number;
      angle: number;
    }[]
  | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 4) return undefined;
  const refs: {
    objectId: string;
    fileId: string;
    displayName: string;
    sourceWidth: number;
    sourceHeight: number;
    width: number;
    height: number;
    elementVersion: number;
    angle: number;
  }[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const sourceWidth =
      typeof item.sourceWidth === "number" ? item.sourceWidth : Number(item.width);
    const sourceHeight =
      typeof item.sourceHeight === "number" ? item.sourceHeight : Number(item.height);
    if (
      !(sourceWidth > 0) ||
      !(sourceHeight > 0) ||
      sourceWidth > 20_000 ||
      sourceHeight > 20_000
    ) {
      continue;
    }
    if (item.objectId !== undefined && !isSafeString(item.objectId, 120)) continue;
    if (item.fileId !== undefined && !isSafeString(item.fileId, 120)) continue;
    if (item.displayName !== undefined && !isSafeString(item.displayName, 120)) continue;
    refs.push({
      objectId: typeof item.objectId === "string" ? item.objectId : `inserted-${refs.length + 1}`,
      fileId: typeof item.fileId === "string" ? item.fileId : "",
      displayName: typeof item.displayName === "string" ? item.displayName : "Photo",
      sourceWidth,
      sourceHeight,
      width: typeof item.width === "number" && item.width > 0 ? item.width : sourceWidth,
      height: typeof item.height === "number" && item.height > 0 ? item.height : sourceHeight,
      elementVersion: 1,
      angle: 0,
    });
  }
  return refs;
}

function parseRecallInput(value: Record<string, unknown>): {
  followUpPrompt: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  lastGeneration: PriorImageGenerationContext;
  insertedRefs?: ReturnType<typeof parseInsertedPromptImages>;
} | null {
  if (
    !isSafeString(value.followUpPrompt, 4_000, 1) ||
    containsSensitivePayload(value.followUpPrompt)
  ) {
    return null;
  }
  const lastGeneration = parsePriorImageGenerationPayload(value.lastGeneration);
  if (!lastGeneration) return null;
  const conversationHistory = parseConversationHistory(value.conversationHistory);
  if (value.conversationHistory !== undefined && !conversationHistory) return null;
  const insertedRefs = parseInsertedPromptImages(value.insertedPromptImages);
  return {
    followUpPrompt: value.followUpPrompt,
    conversationHistory: conversationHistory ?? [],
    lastGeneration,
    ...(insertedRefs?.length ? { insertedRefs } : {}),
  };
}

function parseConversationHistory(
  value: unknown,
): { role: "user" | "assistant"; content: string }[] | null | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > DIRECTOR_CONVERSATION_HISTORY_LIMIT) return null;
  const messages: { role: "user" | "assistant"; content: string }[] = [];
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

function isSafeString(value: unknown, max: number, min = 0): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
