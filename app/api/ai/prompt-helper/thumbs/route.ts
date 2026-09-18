import { type NextRequest, NextResponse } from "next/server";
import {
  ensurePromptHelperThumbs,
  listExistingPromptHelperThumbIds,
} from "@/lib/ai/orchestration/promptHelperThumbsEnsure";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(40, 60_000);
const MAX_BODY_BYTES = 40_000;

/**
 * GET — list thumb ids already on disk.
 * POST — queue generation for missing option ids (background); next Helper open shows new images.
 */
export async function GET(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const idsParam = req.nextUrl.searchParams.get("ids");
  const existing = await listExistingPromptHelperThumbIds();
  if (idsParam) {
    const wanted = new Set(
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const ready = existing.filter((id) => wanted.has(id));
    return NextResponse.json({ ready, existingCount: existing.length });
  }
  return NextResponse.json({ ids: existing });
}

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
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const optionIds = Array.isArray((raw as { optionIds?: unknown })?.optionIds)
    ? ((raw as { optionIds: unknown[] }).optionIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0 && id.length < 80,
      ) as string[])
    : [];

  if (optionIds.length === 0) {
    return NextResponse.json({ error: "optionIds required" }, { status: 400 });
  }

  const token =
    getSessionReplicateToken(req) || process.env.REPLICATE_API_TOKEN || null;

  const result = await ensurePromptHelperThumbs({
    optionIds: optionIds.slice(0, 80),
    token,
    maxQueue: 24,
  });

  return NextResponse.json(result);
}
