import { type NextRequest, NextResponse } from "next/server";
import { BRIEF_VISION_PROMPT, parseBriefResponse } from "@/lib/ai/briefParser";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

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

  const replicateToken = getSessionReplicateToken(req) || process.env.REPLICATE_API_TOKEN;
  const ai = getServerAiRuntime({
    replicateToken,
    accountId: account?.id,
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
      },
    );

    const rawText = execution.output?.text ?? "";
    const parsedResult = parseBriefResponse(rawText);
    const hasUsableLayout = Boolean(
      parsedResult &&
        (parsedResult.heroSubject ||
          parsedResult.headlineCard ||
          parsedResult.backgroundZone ||
          parsedResult.backgroundPartitions.length > 0),
    );

    if (parsedResult && hasUsableLayout) {
      return NextResponse.json({
        success: true,
        result: parsedResult,
        model: execution.metadata.model,
        durationMs: execution.metadata.durationMs,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "AI วิเคราะห์ภาพไม่สำเร็จ: ผลลัพธ์ไม่อยู่ในรูปแบบ Brief ที่ใช้งานได้",
      },
      { status: 502 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message.trim().slice(0, 500) : "Unknown AI error";
    return NextResponse.json(
      {
        success: false,
        error: `AI วิเคราะห์ภาพไม่สำเร็จ: ${detail || "Unknown AI error"}`,
      },
      { status: 502 },
    );
  }
}
