import { MOODBOARD_DEFAULT_BATCH_COUNT, type MoodboardBatchCount } from "./constants";
import { parseJsonCandidate } from "./json";

export type MoodboardIdeaPrompt = {
  index: number;
  subject: string;
  setting: string;
  prop: string;
  mood: string;
  colorStyle: string;
  prompt: string;
};

export type MoodboardExpandPack = {
  keyword: string;
  prompts: MoodboardIdeaPrompt[];
};

export type MoodboardExpandValidation = {
  ok: true;
  pack: MoodboardExpandPack;
};

export type MoodboardExpandInvalid = {
  ok: false;
  reason: string;
};

export function parseMoodboardExpandJson(
  raw: unknown,
  count: MoodboardBatchCount = MOODBOARD_DEFAULT_BATCH_COUNT,
): MoodboardExpandValidation | MoodboardExpandInvalid {
  const candidates = collectExpandCandidates(raw);
  let lastReason = "Expand response is not a JSON object.";
  for (const candidate of candidates) {
    const parsed = parseExpandObject(candidate, count);
    if (parsed.ok) return parsed;
    lastReason = parsed.reason;
  }
  return { ok: false, reason: lastReason };
}

function collectExpandCandidates(raw: unknown): unknown[] {
  const values: unknown[] = [];
  const seen = new Set<unknown>();
  const push = (value: unknown) => {
    if (value === null || value === undefined || seen.has(value)) return;
    seen.add(value);
    values.push(value);
  };

  const parsed = typeof raw === "string" ? parseJsonCandidate(raw) : raw;
  push(parsed);

  if (isRecord(parsed)) {
    if (typeof parsed.text === "string") push(parseJsonCandidate(parsed.text));
    if (typeof parsed.output === "string") push(parseJsonCandidate(parsed.output));
    if (typeof parsed.output_text === "string") push(parseJsonCandidate(parsed.output_text));
    if (isRecord(parsed.pack)) push(parsed.pack);
  }

  return values;
}

function parseExpandObject(
  candidate: unknown,
  count: MoodboardBatchCount,
): MoodboardExpandValidation | MoodboardExpandInvalid {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, reason: "Expand response is not a JSON object." };
  }
  const obj = candidate as Record<string, unknown>;
  const keyword = typeof obj.keyword === "string" ? obj.keyword.trim() : "";
  if (!keyword) return { ok: false, reason: "Expand JSON is missing keyword." };

  const promptsRaw = Array.isArray(obj.prompts) ? obj.prompts : null;
  if (!promptsRaw) {
    // Legacy role-bucket packs: synthesize N distinct prompts from associations / roles.
    const synthesized = synthesizeFromLegacyPack(keyword, obj, count);
    if (synthesized) return { ok: true, pack: synthesized };
    return { ok: false, reason: "Expand JSON is missing prompts[]." };
  }

  const prompts: MoodboardIdeaPrompt[] = [];
  const seenIndexes = new Set<number>();
  const seenPromptKeys = new Set<string>();

  for (const entry of promptsRaw) {
    if (prompts.length >= count) break;
    const item = parseIdeaPrompt(entry, prompts.length + 1);
    if (!item) continue;
    if (seenIndexes.has(item.index)) continue;
    const key = item.prompt.toLowerCase();
    if (seenPromptKeys.has(key)) continue;
    seenIndexes.add(item.index);
    seenPromptKeys.add(key);
    prompts.push(item);
  }

  if (prompts.length < count) {
    const filled = fillMissingPrompts(keyword, prompts, count);
    return { ok: true, pack: { keyword, prompts: filled } };
  }

  prompts.sort((a, b) => a.index - b.index);
  return {
    ok: true,
    pack: {
      keyword,
      prompts: prompts.slice(0, count).map((item, i) => ({
        ...item,
        index: i + 1,
      })),
    },
  };
}

function parseIdeaPrompt(raw: unknown, fallbackIndex: number): MoodboardIdeaPrompt | null {
  if (typeof raw === "string") {
    const prompt = raw.trim();
    if (!prompt) return null;
    return {
      index: fallbackIndex,
      subject: prompt,
      setting: "open composition",
      prop: "subtle detail",
      mood: "curious",
      colorStyle: "natural light",
      prompt,
    };
  }
  if (!isRecord(raw)) return null;
  const prompt = asNonEmptyString(raw.prompt ?? raw.text ?? raw.query);
  if (!prompt) return null;
  const indexRaw = raw.index;
  const index =
    typeof indexRaw === "number" && Number.isInteger(indexRaw) && indexRaw >= 1
      ? indexRaw
      : fallbackIndex;
  return {
    index,
    subject: asNonEmptyString(raw.subject) ?? "focal subject",
    setting: asNonEmptyString(raw.setting) ?? "evocative setting",
    prop: asNonEmptyString(raw.prop) ?? "telling prop",
    mood: asNonEmptyString(raw.mood) ?? "atmospheric mood",
    colorStyle:
      asNonEmptyString(raw.colorStyle ?? raw.color ?? raw.style) ?? "distinct color style",
    prompt,
  };
}

/** Build N prompts when the model returned role buckets (older expand shape). */
function synthesizeFromLegacyPack(
  keyword: string,
  obj: Record<string, unknown>,
  count: MoodboardBatchCount,
): MoodboardExpandPack | null {
  const associations = asStringList(obj.associations ?? obj.vibes ?? obj.ideas);
  const roles = isRecord(obj.roles) ? obj.roles : obj;
  const subjects = asLabelList(roles.subject);
  const settings = asLabelList(roles.setting);
  const props = asLabelList(roles.prop ?? roles.props);
  const moods = asLabelList(roles.mood);
  const colors = asLabelList(roles.color ?? roles.colors);

  const seeds = uniqueLabels([
    ...associations,
    ...subjects,
    ...settings,
    ...props,
    ...moods,
    ...colors,
    keyword,
  ]);
  if (seeds.length === 0) return null;

  const prompts: MoodboardIdeaPrompt[] = [];
  for (let i = 0; i < count; i += 1) {
    const subject =
      subjects[i % Math.max(1, subjects.length)] ?? seeds[i % seeds.length] ?? keyword;
    const setting =
      settings[(i + 1) % Math.max(1, settings.length)] ??
      seeds[(i + 1) % seeds.length] ??
      `${keyword} place`;
    const prop =
      props[(i + 2) % Math.max(1, props.length)] ?? seeds[(i + 2) % seeds.length] ?? "detail";
    const mood =
      moods[(i + 3) % Math.max(1, moods.length)] ?? seeds[(i + 3) % seeds.length] ?? "mood";
    const colorStyle =
      colors[(i + 4) % Math.max(1, colors.length)] ??
      seeds[(i + 4) % seeds.length] ??
      "color treatment";
    prompts.push({
      index: i + 1,
      subject,
      setting,
      prop,
      mood,
      colorStyle,
      prompt: `A ${mood} scene of ${subject} in ${setting}, featuring ${prop}, ${colorStyle}, moodboard reference still, no text.`,
    });
  }
  return { keyword, prompts };
}

function fillMissingPrompts(
  keyword: string,
  existing: MoodboardIdeaPrompt[],
  count: MoodboardBatchCount,
): MoodboardIdeaPrompt[] {
  const prompts = [...existing];
  const seen = new Set(prompts.map((item) => item.prompt.toLowerCase()));
  while (prompts.length < count) {
    const facet = [
      "close-up texture study",
      "wide establishing atmosphere",
      "hands and object detail",
      "silhouette against light",
      "material still life",
      "street-level perspective",
      "quiet interior vignette",
      "dramatic weather beat",
      "color-blocked graphic frame",
    ][prompts.length % 9];
    const prompt = `${keyword} — ${facet}; distinct moodboard frame ${prompts.length + 1}, no text overlay.`;
    if (seen.has(prompt.toLowerCase())) continue;
    seen.add(prompt.toLowerCase());
    prompts.push({
      index: prompts.length + 1,
      subject: keyword,
      setting: facet,
      prop: "design detail",
      mood: "curious",
      colorStyle: "editorial color",
      prompt,
    });
  }
  return prompts.map((item, index) => ({ ...item, index: index + 1 }));
}

function asLabelList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const labels: string[] = [];
  for (const entry of raw) {
    if (typeof entry === "string" && entry.trim()) {
      labels.push(entry.trim());
      continue;
    }
    if (isRecord(entry)) {
      const label = asNonEmptyString(entry.label ?? entry.name ?? entry.text ?? entry.query);
      if (label) labels.push(label);
    }
  }
  return labels;
}

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function uniqueLabels(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const label = value.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(label);
  }
  return result;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
