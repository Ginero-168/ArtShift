import { type NextRequest, NextResponse } from "next/server";
import type { AiChatMessage } from "@/lib/ai-runtime/contracts";
import { type DesignAgentContext, prepareDesignTurn } from "@/lib/designAgent/server";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { getSessionReplicateToken } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_CONTEXT_CHARS = 80_000;

export async function POST(req: NextRequest) {
  const limit = limiter.check(getClientIp(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isRecord(body))
    return NextResponse.json({ error: "Request must be an object." }, { status: 400 });

  const messages = parseMessages(body.messages);
  const context = parseContext(body.context);
  if (!messages || !context) {
    return NextResponse.json(
      { error: "Invalid or oversized design-agent request." },
      { status: 400 },
    );
  }

  const replicateToken = getSessionReplicateToken(req);
  if (!replicateToken) {
    return NextResponse.json(
      { error: "Add your Replicate API Key in AI Settings first.", code: "AI_KEY_REQUIRED" },
      { status: 401 },
    );
  }

  try {
    const result = await prepareDesignTurn(messages, context, { replicateToken });
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Design agent request failed.";
    return NextResponse.json({ error: `Design agent error: ${message}` }, { status: 500 });
  }
}

function parseMessages(value: unknown): AiChatMessage[] | null {
  if (!Array.isArray(value) || value.length > MAX_MESSAGES) return null;
  const messages: AiChatMessage[] = [];
  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) return null;
    if (typeof item.content !== "string" || item.content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role: item.role, content: item.content });
  }
  return messages;
}

function parseContext(value: unknown): DesignAgentContext | null {
  if (!isRecord(value)) return null;
  const snapshot = value.snapshot;
  if (JSON.stringify(snapshot ?? {}).length > MAX_CONTEXT_CHARS) return null;
  if (
    typeof value.docId !== "string" ||
    typeof value.artworkId !== "string" ||
    !isRevision(value.baseRevision) ||
    typeof value.artworkWidth !== "number" ||
    typeof value.artworkHeight !== "number" ||
    typeof value.hasSelection !== "boolean" ||
    !Array.isArray(value.selectedObjectIds) ||
    value.selectedObjectIds.some((id) => typeof id !== "string" || id.length > 200)
  ) {
    return null;
  }
  return {
    docId: value.docId,
    baseRevision: value.baseRevision,
    artworkId: value.artworkId,
    artworkWidth: value.artworkWidth,
    artworkHeight: value.artworkHeight,
    hasSelection: value.hasSelection,
    selectedObjectIds: value.selectedObjectIds,
    snapshot,
  };
}

function isRevision(value: unknown): value is number | string {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 0 && value.length <= 200)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
