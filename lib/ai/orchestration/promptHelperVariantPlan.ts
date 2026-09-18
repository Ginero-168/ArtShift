/**
 * Gemini 3 Flash plans which Level-2 variant axes/options the Prompt Helper
 * should show for a given user prompt — Shared Anchors stay locked (Level 1).
 *
 * Principles (generic — never hardcode a specific brand campaign):
 * - Level 1 accuracy is always on: copy, logo, palette, ratio, references.
 * - Level 2 axes are chosen per brief from the brand's visual language.
 * - Variation intensity follows the situation table (style locked / theme only /
 *   strict CI / experimental).
 */

export type VariantSituation =
  | "style_locked"
  | "theme_broad"
  | "strict_ci"
  | "experimental"
  | "subject_explore";

export type PlannedVariantAxis = {
  id: string;
  /** Option ids from the catalog, ordered by preference */
  optionIds: string[];
};

export type PromptHelperVariantPlan = {
  situation: VariantSituation;
  rationale: string;
  /** Prefer brand-variant axes when true */
  preferBrandAxes: boolean;
  axes: PlannedVariantAxis[];
};

export const PROMPT_HELPER_VARIANT_SYSTEM = `You are ArtShift's Prompt Helper planner (Gemini).
Return ONLY one JSON object. No markdown.

Two layers:
1) Shared Anchors (Level 1) — always accuracy: exact text/logo/brand colors/aspect ratio/reference identity. Never treat these as pickable variants.
2) Variant axes (Level 2) — the ONLY safe differences. Choose axes that match THIS brief's visual language (background structure, signature motif, mood poles, layout density, tone, camera, style, etc.). Do NOT invent a fixed campaign brand; derive signature elements from the user's brief only.

Situation table (pick one):
- style_locked: user already said "like this" / tight style → tiny differences only (1–2 axes, 2–3 options each)
- theme_broad: only a wide theme/tone → full poles so the user can choose a direction
- strict_ci: brand guidelines tight → axes stay inside CI; vary composition/atmosphere only
- experimental: free campaign → wider poles allowed
- subject_explore: casual subject photo request → tone/background/camera/style

Allowed axis ids (subset only what fits):
mood, structure, signature, density, color, background, camera, style, scenery

Rules:
- Prefer 3–4 axes max. Each axis 3–5 option ids from the allowed lists in the user message.
- Poles on an axis must feel different enough to choose a direction (premium vs energy vs minimal, etc.).
- Never put logo/text/ratio into axes.

JSON shape:
{
  "situation": "theme_broad",
  "rationale": "short Thai why these axes fit",
  "preferBrandAxes": false,
  "axes": [{ "id": "color", "optionIds": ["vibrant","pastel","earth","dark"] }]
}`;

export function buildPromptHelperVariantUserMessage(
  prompt: string,
  catalog: { axisId: string; options: { id: string; label: string }[] }[],
): string {
  const catalogBlock = catalog
    .map((axis) => `${axis.axisId}: ${axis.options.map((o) => `${o.id}(${o.label})`).join(", ")}`)
    .join("\n");
  return `User prompt:\n${prompt.trim()}\n\nAvailable catalog options by axis:\n${catalogBlock}\n\nPlan Level-2 axes now.`;
}

export function parsePromptHelperVariantPlan(raw: string): PromptHelperVariantPlan | null {
  try {
    const clean = raw
      .trim()
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<PromptHelperVariantPlan>;
    if (!parsed || typeof parsed !== "object") return null;
    const situation = normalizeSituation(parsed.situation);
    if (!Array.isArray(parsed.axes) || parsed.axes.length === 0) return null;
    const axes: PlannedVariantAxis[] = [];
    for (const axis of parsed.axes) {
      if (!axis || typeof axis.id !== "string" || !Array.isArray(axis.optionIds)) continue;
      const optionIds = axis.optionIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 6);
      if (optionIds.length === 0) continue;
      axes.push({ id: axis.id.trim(), optionIds });
    }
    if (axes.length === 0) return null;
    return {
      situation,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
      preferBrandAxes: Boolean(parsed.preferBrandAxes),
      axes: axes.slice(0, 5),
    };
  } catch {
    return null;
  }
}

function normalizeSituation(value: unknown): VariantSituation {
  switch (value) {
    case "style_locked":
    case "theme_broad":
    case "strict_ci":
    case "experimental":
    case "subject_explore":
      return value;
    default:
      return "theme_broad";
  }
}
