/**
 * Prepaid credit pricing.
 *
 * 1 credit = 0.01 THB of the amount billed to the user.
 * Billed THB = estimated provider USD × USD_TO_THB × COST_PLUS_MARGIN (~25%).
 * Credits are rounded up so a call never under-collects.
 *
 * Provider USD figures are estimates (Replicate public prices / existing runtime
 * ceilings). Adjust this table when a model page changes; do not hard-code
 * prices in routes.
 */

export const CREDIT_THB = 0.01;
export const COST_PLUS_MARGIN = 1.25;
/** Configurable FX assumption. Not a live rate. */
export const USD_TO_THB = 35;

/**
 * Granted once, the first time a Google account is seen by the ledger
 * (login or first billable call). About three cheap image generations
 * (`image.generate.low` / moodboard stills are ~53 credits each).
 */
export const WELCOME_GRANT_CREDITS = 200;

export const CREDIT_ACTIONS = [
  "image.generate.low",
  "image.generate.medium",
  "image.generate.high",
  "image.generate.xhigh",
  "moodboard.image",
  "moodboard.expand",
  "image.multiAngle",
  "image.decomposeLayers",
  "image.upscale",
  "image.poseSkeleton",
  "vectorize.recraft",
  "vision.describe",
  "llm.turn",
  "prompt.plan",
  "prompt.thumbs",
  "prompt.enhance",
] as const;

export type CreditAction = (typeof CREDIT_ACTIONS)[number];

/** Estimated provider cost in USD for one unit of the action, before margin. */
export const PROVIDER_USD: Record<CreditAction, number> = {
  "image.generate.low": 0.012,
  "image.generate.medium": 0.04,
  "image.generate.high": 0.13,
  "image.generate.xhigh": 0.25,
  "moodboard.image": 0.012,
  "moodboard.expand": 0.004,
  "image.multiAngle": 0.03,
  "image.decomposeLayers": 0.05,
  "image.upscale": 0.02,
  "image.poseSkeleton": 0.01,
  "vectorize.recraft": 0.04,
  "vision.describe": 0.003,
  "llm.turn": 0.004,
  "prompt.plan": 0.004,
  "prompt.thumbs": 0.012,
  "prompt.enhance": 0.001,
};

export function isCreditAction(value: string): value is CreditAction {
  return (CREDIT_ACTIONS as readonly string[]).includes(value);
}

export function billedThbForProviderUsd(providerUsd: number): number {
  if (!Number.isFinite(providerUsd) || providerUsd <= 0) return 0;
  return providerUsd * USD_TO_THB * COST_PLUS_MARGIN;
}

/** Integer credits to collect for an estimated provider cost. */
export function creditsForProviderUsd(providerUsd: number): number {
  const billedThb = billedThbForProviderUsd(providerUsd);
  if (billedThb <= 0) return 0;
  return Math.ceil(billedThb / CREDIT_THB - 1e-9);
}

export function creditsForAction(action: CreditAction, units = 1): number {
  const count = normalizeUnits(units);
  return creditsForProviderUsd(PROVIDER_USD[action]) * count;
}

export function imageGenerateAction(
  quality: string | undefined,
): "image.generate.low" | "image.generate.medium" | "image.generate.high" | "image.generate.xhigh" {
  if (quality === "low") return "image.generate.low";
  if (quality === "medium") return "image.generate.medium";
  if (quality === "xhigh" || quality === "max") return "image.generate.xhigh";
  return "image.generate.high";
}

export function welcomeGrantCredits(): number {
  const raw = process.env.ARTSHIFT_WELCOME_CREDITS;
  if (raw && /^\d+$/.test(raw)) {
    const parsed = Number(raw);
    if (parsed >= 0 && parsed <= 1_000_000_000) return parsed;
  }
  return WELCOME_GRANT_CREDITS;
}

function normalizeUnits(units: number): number {
  if (!Number.isInteger(units) || units < 1) return 1;
  return Math.min(units, 64);
}
