/**
 * Gemini 3 Flash plans which Level-2 variant axes/options the Prompt Helper
 * should show for a given user prompt — Shared Anchors stay locked (Level 1).
 *
 * Principles (generic — never hardcode a specific brand campaign):
 * - Level 1 accuracy is always on: copy, logo, palette, ratio, references.
 * - Level 2 axes are invented for THIS prompt's subject. A fixed photography
 *   pack is only the baseline when planning fails.
 * - Variation intensity follows the situation table (style locked / theme only /
 *   strict CI / experimental).
 */

export type VariantSituation =
  | "style_locked"
  | "theme_broad"
  | "strict_ci"
  | "experimental"
  | "subject_explore";

export type PlannedVariantOption = {
  id: string;
  label: string;
  /** Thai phrase appended to the user prompt when this card is picked */
  modifier: string;
  character?: string;
};

export type PlannedVariantAxis = {
  id: string;
  /** Row title shown in the helper. Falls back to a catalog title when omitted. */
  title?: string;
  hint?: string;
  /** Catalog option ids, ordered by preference. Used when `options` is empty. */
  optionIds: string[];
  /** Option cards invented for this subject. Preferred over `optionIds`. */
  options?: PlannedVariantOption[];
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
2) Variant axes (Level 2) — the ONLY safe differences. Invent axes and option cards that match THIS brief's subject. Do NOT return one fixed photography pack (mood, lighting, background, weather) for every prompt. Do NOT invent a fixed campaign brand; derive from the user's brief only.

How to plan:
- Read the subject of the user prompt and name 4–8 axes a person would actually want to vary for THAT subject.
- Each axis: ascii id, short Thai title, one-line Thai hint, and 6–12 options.
- Each option: ascii id, short Thai label, modifier (Thai phrase that can be appended to the prompt), character (2–4 Thai characters).
- Options on one axis must be different directions, not synonyms.
- The optional catalog lists chips you may reuse (pet coat/breed, brand axes). Reuse a catalog id only when that chip truly fits. Otherwise invent new options. A successful plan is exactly the axes you return — do not pad with generic atmosphere/lighting/background rows.
- Dragon / มังกร / mythic creature: subject axes such as species, wing type, breath, scale texture (ลายเกล็ด), pose, habitat. Do not stop at atmosphere, lighting, and background.
- Cat / แมว / kitten: include coat color and breed. Coat colors must be fur chips (orange, tabby, black) — never palette tones (vibrant, pastel, neon).
- Dog / หมา / สุนัข: include coat color and breed.
- Person / portrait: appearance, wardrobe, expression, setting — only when the prompt is about a person.
- Landscape: landform, season, time of day — only when the prompt is a landscape.
- Food, vehicle, instrument, object, building, or any other subject: invent axes that would not fit a dragon or a cat. Never copy another subject's axis set.
- Brand / ad when the brief is a brand layout: mood, structure, signature, density.

Situation (pick one):
- style_locked: user already said "like this" / tight style → 3–5 subject-specific axes
- theme_broad: wide theme → 4–8 subject-specific axes
- strict_ci: brand guidelines tight → stay inside CI; still subject-specific
- experimental: free exploration → 4–8 subject-specific axes, wider poles
- subject_explore: casual subject (สร้างรูป… / draw a…) → 4–8 axes about that subject, not a default photo checklist

Rules:
- Never put logo, exact text, or aspect ratio into axes.
- rationale: one short Thai sentence that names the axis titles you actually returned. Do not mention a feature that is not one of those titles or an option label.

JSON shape:
{
  "situation": "subject_explore",
  "rationale": "เลือกแกนชนิดมังกร ลักษณะปีก ลมหายใจ และลายเกล็ด",
  "preferBrandAxes": false,
  "axes": [
    {
      "id": "species",
      "title": "ชนิดมังกร",
      "hint": "รูปร่างหลักของมังกร",
      "options": [
        { "id": "wyvern", "label": "ไวเวิร์น", "modifier": "มังกรไวเวิร์นสองปีก", "character": "สองปีก" }
      ]
    }
  ]
}

Catalog reuse (only when the chip fits) may use optionIds instead of options:
{ "id": "breed", "title": "สายพันธุ์", "optionIds": ["scottish", "persian"] }`;

export function buildPromptHelperVariantUserMessage(
  prompt: string,
  catalog: { axisId: string; options: { id: string; label: string }[] }[],
): string {
  const catalogBlock =
    catalog.length > 0
      ? catalog
          .map(
            (axis) =>
              `${axis.axisId}: ${axis.options.map((o) => `${o.id}(${o.label})`).join(", ")}`,
          )
          .join("\n")
      : "(none — invent every axis and every option card for this subject)";
  return `User prompt:\n${prompt.trim()}\n\nRelevant catalog chips, if any (reuse an id only when it fits; otherwise invent):\n${catalogBlock}\n\nPlan Level-2 axes that are specific to this prompt's subject. Do not answer with a generic photography checklist.`;
}

const RATIONALE_GLUE = new Set([
  "เลือก",
  "แกน",
  "ที่",
  "ช่วย",
  "เสริม",
  "ความ",
  "ของ",
  "ให้",
  "แล้ว",
  "และ",
  "ทั้ง",
  "นี้",
  "ใน",
  "กับ",
  "จาก",
  "เป็น",
  "ได้",
  "ตัว",
  "ภาพ",
  "ตาม",
  "เข้า",
  "หัวข้อ",
  "พรอมป์",
  "ไว้",
  "สำหรับ",
  "โมเดล",
  "คัด",
  "ตัวเลือก",
  "แนว",
  "แบบ",
  "หลัก",
  "เพิ่ม",
  "ชุด",
  "เหล่านี้",
  "เพราะ",
  "เพื่อ",
  "โดย",
  "หรือ",
  "แต่",
  "ไม่",
  "มี",
  "การ",
  "ผู้",
  "ใช้",
  "รูป",
  "สร้าง",
]);

export type PromptHelperRationaleAxis = {
  title: string;
  hint?: string;
  options: Array<{ label: string; character?: string }>;
};

/** Banner copy that only names axes actually on the card. */
export function groundPromptHelperRationale(
  modelRationale: string,
  axes: PromptHelperRationaleAxis[],
  originalPrompt: string,
): string {
  const titles = axes.map((axis) => axis.title.trim()).filter(Boolean);
  const synthesized = titles.length > 0 ? `เลือกแกนให้เข้ากับพรอมป์นี้: ${titles.join(", ")}` : "";
  const rationale = modelRationale.trim();
  if (!rationale || titles.length === 0) return synthesized;

  const haystack = [
    originalPrompt,
    ...axes.flatMap((axis) => [
      axis.title,
      axis.hint ?? "",
      ...axis.options.flatMap((option) => [option.label, option.character ?? ""]),
    ]),
  ].join("\n");

  const runs = rationale.match(/[\u0E00-\u0E7F]{2,}|[A-Za-z][A-Za-z0-9_+-]{2,}/g) ?? [];
  for (const run of runs) {
    if (RATIONALE_GLUE.has(run)) continue;
    if (haystack.includes(run)) continue;
    const stripped = stripLeadingGlue(run);
    if (stripped.length >= 2 && haystack.includes(stripped)) continue;
    return synthesized;
  }
  return rationale;
}

const GLUE_BY_LENGTH = [...RATIONALE_GLUE].sort((a, b) => b.length - a.length);

/** "และลายเกล็ด" / "เลือกแกนชนิดมังกร" → the axis title after filler words. */
function stripLeadingGlue(run: string): string {
  let current = run;
  let changed = true;
  while (changed && current.length >= 2) {
    changed = false;
    for (const glue of GLUE_BY_LENGTH) {
      if (current.startsWith(glue) && current.length > glue.length) {
        current = current.slice(glue.length);
        changed = true;
        break;
      }
    }
  }
  return current;
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
      const planned = parseAxis(axis);
      if (planned) axes.push(planned);
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

function parseAxis(axis: unknown): PlannedVariantAxis | null {
  if (!axis || typeof axis !== "object") return null;
  const raw = axis as {
    id?: unknown;
    title?: unknown;
    hint?: unknown;
    optionIds?: unknown;
    options?: unknown;
  };
  if (typeof raw.id !== "string" || !raw.id.trim()) return null;
  const options = parseOptions(raw.options);
  const optionIds = Array.isArray(raw.optionIds)
    ? raw.optionIds
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 15)
    : [];
  if (options.length === 0 && optionIds.length === 0) return null;
  return {
    id: raw.id.trim().slice(0, 48),
    title: optionalText(raw.title, 40),
    hint: optionalText(raw.hint, 80),
    optionIds,
    options: options.length > 0 ? options : undefined,
  };
}

function parseOptions(value: unknown): PlannedVariantOption[] {
  if (!Array.isArray(value)) return [];
  const options: PlannedVariantOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const raw = item as {
      id?: unknown;
      label?: unknown;
      modifier?: unknown;
      character?: unknown;
    };
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 40) : "";
    const modifierSource = typeof raw.modifier === "string" ? raw.modifier.trim() : label;
    const modifier = modifierSource.slice(0, 180);
    if (!label || !modifier) continue;
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim().slice(0, 48) : label;
    options.push({
      id,
      label,
      modifier,
      character: optionalText(raw.character, 16),
    });
    if (options.length >= 15) break;
  }
  return options;
}

function optionalText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed || undefined;
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
