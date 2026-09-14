import { type NextRequest, NextResponse } from "next/server";
import { parseVisionResponse } from "@/lib/ai/orchestration/cloudVisionParser";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const MAX_REQUEST_BODY_BYTES = 20 * 1024 * 1024;

const UNIFIED_VISION_PROMPT = `Analyze this image in detail for a graphic design tool. Return a strictly valid JSON object ONLY (no markdown formatting, no codeblocks) with the following structure:
{
  "caption": "Detailed visual description of the subject, scene, layout, composition, lighting, art style, and mood",
  "objects": ["list of main visually distinct objects, elements, or graphic parts identified in the image"],
  "visibleText": "All visible words, letters, labels, or typography seen in the image accurately transcribed in reading order",
  "style": "Graphic style (e.g. 2D flat graphic, minimalist vector, realistic photograph, banner, etc.)",
  "dominantColors": ["#hex1", "#hex2", "#hex3"]
}`;

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
  if (!image || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Valid image data URL is required." }, { status: 400 });
  }

  const replicateToken = getSessionReplicateToken(req);
  const ai = getServerAiRuntime({
    replicateToken,
    accountId: account?.id,
  });

  try {
    const execution = await ai.execute(
      "vision.describe",
      {
        image: { dataUrl: image },
        prompt: UNIFIED_VISION_PROMPT,
      },
      {
        profile: "quality",
        signal: req.signal,
        timeoutMs: 15_000,
        cloudConsent: true,
        allowFallback: true,
      },
    );

    const rawText = execution.output?.text ?? "";
    const parsedResult = parseVisionResponse(rawText);

    return NextResponse.json({
      success: true,
      result: parsedResult,
      model: execution.metadata.model,
      durationMs: execution.metadata.durationMs,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        fallback: true,
        error: error instanceof Error ? error.message : "Cloud vision error",
      },
      { status: 200 },
    );
  }
}

