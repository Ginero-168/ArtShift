import { type NextRequest, NextResponse } from "next/server";
import { BRIEF_VISION_PROMPT, isUsableBriefLayout, parseBriefResponse } from "@/lib/ai/briefParser";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { requireEndUserCloudAi } from "@/lib/server/ai/endUserCloudGuard";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getUserAccount } from "@/lib/server/ai/userCredentials";
import { refundCharge } from "@/lib/server/credits/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

/**
 * One cloud vision pass per request.
 * Client owns the 3-attempt retry loop so quality stays on the same path
 * without multiplying server-side retries.
 */
export async function POST(req: NextRequest) {
  const account = getUserAccount(req);
  const limitKey = account ? `account:${account.id}` : `ip:${getClientIp(req)}`;
  const limit = limiter.check(limitKey);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await readBoundedJson(req, MAX_REQUEST_BODY_BYTES);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Image request body is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : null;
  if (!image?.startsWith("data:image/")) {
    return NextResponse.json({ error: "Valid image data URL is required." }, { status: 400 });
  }

  const access = requireEndUserCloudAi(req, body.cloudConsent, "vision.describe");
  if (!access.ok) return access.response;

  const ai = getServerAiRuntime({
    replicateToken: access.replicateToken,
    accountId: access.account.id,
  });

  try {
    const execution = await ai.execute(
      "vision.describe",
      {
        image: { dataUrl: image },
        prompt: BRIEF_VISION_PROMPT,
      },
      {
        profile: "quality",
        signal: req.signal,
        timeoutMs: 35_000,
        cloudConsent: true,
        allowFallback: false,
        accountId: access.account.id,
      },
    );

    const rawText = execution.output?.text ?? "";
    const parsedResult = parseBriefResponse(rawText);

    if (isUsableBriefLayout(parsedResult)) {
      return NextResponse.json({
        success: true,
        result: parsedResult,
        model: execution.metadata.model,
        durationMs: execution.metadata.durationMs,
      });
    }

    refundCharge(access.charge?.entryId, "brief vision unusable");
    return NextResponse.json(
      {
        success: false,
        retryable: true,
        error: "unusable_layout",
      },
      { status: 502 },
    );
  } catch {
    refundCharge(access.charge?.entryId, "brief vision failed");
    return NextResponse.json(
      {
        success: false,
        retryable: true,
        error: "vision_failed",
      },
      { status: 502 },
    );
  }
}
