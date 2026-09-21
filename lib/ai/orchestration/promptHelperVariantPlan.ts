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
2) Variant axes (Level 2) — the ONLY safe differences. Choose axes that match THIS brief. Do NOT invent a fixed campaign brand; derive from the user's brief only.

Image-prompt levers (use these mental categories):
- atmosphere: emotional register (epic, whimsical, dark, serene…)
- creative: concept twist that makes a thin prompt richer (surreal, mythic, chibi, epic scale…)
- lighting: light quality/direction (rim, god rays, neon, moonlit…)
- color: palette poles
- background / scenery: place and supporting scene
- weather: time of day / weather spice
- detail: surface/material density
- composition: framing and layout of the shot
- camera / style: lens language and visual medium
- breed: species/breed for pets (cats, dogs)
- look: person appearance for portraits
- Brand axes when preferBrandAxes: mood, structure, signature, density

Situation table (pick one):
- style_locked: user already said "like this" / tight style → 3–4 axes, up to 15 options each when the catalog allows
- theme_broad: wide theme only → up to 10 axes, 15 options each so the user can explore
- strict_ci: brand guidelines tight → axes stay inside CI; vary composition/atmosphere/lighting; still prefer rich option lists
- experimental: free campaign → up to 10 axes, 15 options each, wider creative + atmosphere poles
- subject_explore: casual subject (สร้างรูป… / draw a…) → prefer atmosphere + creative + lighting + background/scenery + weather + detail + composition + style + camera + color. Target up to 10 axes, 15 options each.

Allowed axis ids (subset only what fits):
mood, structure, signature, density, color, background, camera, style, scenery, atmosphere, creative, lighting, detail, weather, composition, breed, look

Relevance (critical):
- Read the user prompt carefully. Option ids must feel useful for THAT subject.
- Fantasy / creature / epic (มังกร, dragon, wizard, monster, myth): prefer atmosphere (atm_epic, atm_dark, atm_mysterious), creative (cre_mythic, cre_epic_scale, cre_surreal), lighting (light_dramatic, light_godrays, light_biolum), scenery/background (mountain, volcano, storm, aurora, cave, ruins), detail (det_scales, det_hyper), composition (comp_wide_est, comp_low_hero, comp_depth), cinematic cameras. NEVER pick kitchen, office, cafe, library, selfie, park for these.
- Pets / cute animals: ALWAYS include breed + color as fur/coat (orange, tabby, scottish, golden…) — NEVER replace pet color with palette tones (vibrant, pastel, neon). Prefer domestic/garden backgrounds, atm_playful / atm_whimsical, cre_chibi ok.
- People / portrait: ALWAYS include look; studio/room/cafe/city; lighting + atmosphere + composition matter; avoid volcano unless asked.
- Landscapes: scenery + weather + lighting + atmosphere + composition.
- Brand / ad: prefer mood/structure/signature/density when preferBrandAxes is true.

Rules:
- For subject_explore / theme_broad / experimental: target up to 10 axes and exactly 15 option ids per axis from the allowed lists (use as many catalog ids as exist, prefer 15).
- style_locked / strict_ci may use fewer axes but still fill each chosen axis toward 15 options when possible.
- Poles on an axis must feel different enough to choose a direction.
- Never put logo/text/ratio into axes.
- rationale: one short Thai sentence explaining why these options fit THIS prompt.

JSON shape:
{
  "situation": "subject_explore",
  "rationale": "short Thai why these axes fit",
  "preferBrandAxes": false,
  "axes": [{ "id": "atmosphere", "optionIds": ["atm_epic","atm_dark","atm_mysterious"] }]
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
    let clean = raw
      .trim()
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    clean = match[0].replace(/,\s*([}\]])/g, "$1");
    const parsed = JSON.parse(clean) as Partial<PromptHelperVariantPlan>;
    if (!parsed || typeof parsed !== "object") return null;
    const situation = normalizeSituation(parsed.situation);
    if (!Array.isArray(parsed.axes) || parsed.axes.length === 0) return null;
    const axes: PlannedVariantAxis[] = [];
    for (const axis of parsed.axes) {
      if (!axis || typeof axis.id !== "string" || !Array.isArray(axis.optionIds)) continue;
      const optionIds = axis.optionIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 15);
      if (optionIds.length === 0) continue;
      axes.push({ id: axis.id.trim(), optionIds });
    }
    if (axes.length === 0) return null;
    return {
      situation,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
      preferBrandAxes: Boolean(parsed.preferBrandAxes),
      axes: axes.slice(0, 10),
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
