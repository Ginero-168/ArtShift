import { type NextRequest, NextResponse } from "next/server";
import {
  buildPromptHelperVariantUserMessage,
  groundPromptHelperRationale,
  PROMPT_HELPER_VARIANT_SYSTEM,
  parsePromptHelperVariantPlan,
} from "@/lib/ai/orchestration/promptHelperVariantPlan";
import {
  applyPromptHelperVariantPlan,
  createPromptRefinement,
  listPromptHelperPlanningCatalog,
  type PromptRefinementCardData,
} from "@/lib/ai/orchestration/promptRefinement";
import { getClientIp, RateLimiter } from "@/lib/rateLimit";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";
import { getServerAiRuntime } from "@/lib/server/ai/runtime";
import { getSessionReplicateToken, getUserAccount } from "@/lib/server/ai/userCredentials";
import { chargeCredits, refundCharge } from "@/lib/server/credits/gate";

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
    return NextResponse.json({ error: "Explicit cloud consent is required." }, { status: 403 });
  }

  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }

  const charge = chargeCredits(account.id, "prompt.plan");
  if (!charge.ok) return charge.response;

  const baseline = createPromptRefinement(prompt);
  let card: PromptRefinementCardData = baseline;
  let planSource: "gemini" | "baseline" = "baseline";
  let rationale = "";
  let planError: string | null = null;
  let modelUsed: string | null = null;

  try {
    const ai = getServerAiRuntime({
      replicateToken: getSessionReplicateToken(req),
      accountId: account.id,
    });
    const catalog = listPromptHelperPlanningCatalog(prompt);
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
        maxTokens: 6000,
      },
      {
        profile: "quality",
        accountId: account.id,
        signal: req.signal,
        cloudConsent: true,
        allowFallback: false,
        reasoning: { mode: "off" },
      },
    );
    modelUsed = result.metadata.model ?? null;
    const rawText = result.output.text?.trim() ?? "";
    if (!rawText) {
      planError = "empty_model_output";
      console.error("[prompt-helper-plan] empty model output", {
        model: modelUsed,
        prompt: prompt.slice(0, 80),
      });
    } else {
      const plan = parsePromptHelperVariantPlan(rawText);
      if (!plan) {
        planError = "unparseable_plan";
        console.error("[prompt-helper-plan] unparseable plan", {
          model: modelUsed,
          preview: rawText.slice(0, 280),
        });
      } else {
        const applied = applyPromptHelperVariantPlan(baseline, plan);
        if (applied === baseline) {
          planError = "no_matching_options";
          console.error("[prompt-helper-plan] plan had no usable axes", {
            model: modelUsed,
            axes: plan.axes.map((a) => ({
              id: a.id,
              n: a.options?.length || a.optionIds.length,
            })),
          });
        } else {
          card = applied;
          planSource = "gemini";
          rationale = groundPromptHelperRationale(plan.rationale, applied.dimensions, prompt);
        }
      }
    }
  } catch (error) {
    planError = error instanceof Error ? error.message.slice(0, 200) : "planner_failed";
    console.error("[prompt-helper-plan] ✗", planError);
    refundCharge(charge.entryId, "prompt plan failed");
  }

  return NextResponse.json({
    card,
    planSource,
    rationale,
    planError,
    modelUsed,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
