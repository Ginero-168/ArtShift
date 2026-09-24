import { type NextRequest, NextResponse } from "next/server";
import { isPromptHelperThumbId } from "@/lib/ai/orchestration/promptHelperThumbManifest";
import type { PromptHelperThumbOptionHint } from "@/lib/ai/orchestration/promptHelperThumbPrompts";
import {
  ensurePromptHelperThumbs,
  listExistingPromptHelperThumbIds,
  listFailedPromptHelperThumbIds,
} from "@/lib/ai/orchestration/promptHelperThumbsEnsure";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import {
  requireAuthenticatedAccount,
  requireEndUserCloudAi,
} from "@/lib/server/ai/endUserCloudGuard";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { refundCharge } from "@/lib/server/credits/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(40, 60_000);
const MAX_BODY_BYTES = 160_000;
const MAX_OPTION_IDS = 200;
const MAX_QUEUE = 48;

function parseBaseSubject(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function parseOptionHints(value: unknown): PromptHelperThumbOptionHint[] {
  if (!Array.isArray(value)) return [];
  const hints: PromptHelperThumbOptionHint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string" || !isPromptHelperThumbId(raw.id)) continue;
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 40) : "";
    const modifier = typeof raw.modifier === "string" ? raw.modifier.trim().slice(0, 180) : "";
    hints.push({
      id: raw.id,
      label: label || undefined,
      modifier: modifier || undefined,
    });
    if (hints.length >= MAX_OPTION_IDS) break;
  }
  return hints;
}

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

  const access = requireAuthenticatedAccount(req);
  if (!access.ok) return access.response;

  const idsParam = req.nextUrl.searchParams.get("ids");
  const existing = await listExistingPromptHelperThumbIds();
  const failed = await listFailedPromptHelperThumbIds();
  if (idsParam) {
    const wanted = new Set(
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const ready = existing.filter((id) => wanted.has(id));
    const failedWanted = failed.filter((id) => wanted.has(id));
    return NextResponse.json({
      ready,
      failed: failedWanted,
      existingCount: existing.length,
    });
  }
  return NextResponse.json({ ids: existing, failed });
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

  const body =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const optionIds = Array.isArray(body.optionIds)
    ? body.optionIds.filter(
        (id): id is string => typeof id === "string" && isPromptHelperThumbId(id),
      )
    : [];

  if (optionIds.length === 0) {
    return NextResponse.json({ error: "optionIds required" }, { status: 400 });
  }

  const access = requireEndUserCloudAi(
    req,
    body.cloudConsent,
    "prompt.thumbs",
    Math.min(optionIds.length, MAX_QUEUE),
  );
  if (!access.ok) return access.response;

  try {
    const result = await ensurePromptHelperThumbs({
      optionIds: optionIds.slice(0, MAX_OPTION_IDS),
      options: parseOptionHints(body.options),
      baseSubject: parseBaseSubject(body.baseSubject),
      token: access.replicateToken,
      maxQueue: MAX_QUEUE,
    });
    return NextResponse.json(result);
  } catch (error) {
    refundCharge(access.charge?.entryId, "prompt helper thumbs failed");
    throw error;
  }
}
