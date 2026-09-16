import { type NextRequest, NextResponse } from "next/server";
import {
  applyPromptHelperVariantPlan,
  createPromptRefinement,
  listPromptHelperCatalogAxes,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";
import {
  buildPromptHelperVariantUserMessage,
  parsePromptHelperVariantPlan,
  PROMPT_HELPER_VARIANT_SYSTEM,
} from "@/lib/ai/orchestration/promptHelperVariantPlan";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const MAX_BODY_BYTES = 20_000;

/**
 * Plans Prompt Helper Level-2 axes with Gemini 3 Flash, then returns a
 * refinement card whose thumbnails resolve from VPS-hosted Replicate assets.
 */
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
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!account) {
    return NextResponse.json(
      { error: "Authentication is required for Prompt Helper planning." },
      { status: 401 },
    );
  }
  if (!isRecord(raw) || raw.cloudConsent !== true) {
    return NextResponse.json(
      { error: "Explicit cloud consent is required." },
      { status: 403 },
    );
  }

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const baseline = createPromptRefinement(prompt);
  let card: PromptRefinementCardData = baseline;
  let planSource: "gemini" | "baseline" = "baseline";
  let rationale = "";

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const catalog = listPromptHelperCatalogAxes();
    const result = await ai.execute(
      "assistant.chat",
      {
        system: PROMPT_HELPER_VARIANT_SYSTEM,
        messages: [
          {
            role: "user",
            content: buildPromptHelperVariantUserMessage(prompt, catalog),
          },
        ],
        maxTokens: 1200,
      },
      {
        profile: "quality",
        accountId: account.id,
        signal: req.signal,
        reasoning: { mode: "off" },
      },
    );
    const plan = parsePromptHelperVariantPlan(result.output.text);
    if (plan) {
      card = applyPromptHelperVariantPlan(baseline, plan);
      planSource = "gemini";
      rationale = plan.rationale;
    }
  } catch {
    // Keep heuristic card — helper must still open if Gemini is unavailable.
  }

  return NextResponse.json({
    card,
    planSource,
    rationale,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
