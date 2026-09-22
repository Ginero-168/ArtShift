import { MOODBOARD_IMAGE_COUNT } from "./constants";
import { parseJsonCandidate } from "./json";
import { MOODBOARD_PACK_COUNTS, MOODBOARD_ROLES, type MoodboardRole } from "./types";

export type MoodboardExpandVisual = {
  label: string;
  query: string;
};

export type MoodboardExpandChip = {
  label: string;
  query?: string;
  hex?: string;
};

export type MoodboardImagePrompt = {
  label: string;
  role: MoodboardRole;
  prompt: string;
};

export type MoodboardExpandPack = {
  keyword: string;
  associations: string[];
  roles: {
    subject: MoodboardExpandVisual[];
    setting: MoodboardExpandVisual[];
    prop: MoodboardExpandVisual[];
    mood: MoodboardExpandChip[];
    color: MoodboardExpandChip[];
  };
  imagePrompts: MoodboardImagePrompt[];
};

export type MoodboardExpandValidation = {
  ok: true;
  pack: MoodboardExpandPack;
};

export type MoodboardExpandInvalid = {
  ok: false;
  reason: string;
};

const ROLE_SET = new Set<string>(MOODBOARD_ROLES);

export function parseMoodboardExpandJson(
  raw: unknown,
): MoodboardExpandValidation | MoodboardExpandInvalid {
  const candidates = collectExpandCandidates(raw);
  let lastReason = "Expand response is not a JSON object.";
  for (const candidate of candidates) {
    const parsed = parseExpandObject(candidate);
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
  }

  return values;
}

function parseExpandObject(candidate: unknown): MoodboardExpandValidation | MoodboardExpandInvalid {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, reason: "Expand response is not a JSON object." };
  }
  const obj = candidate as Record<string, unknown>;
  const keyword = typeof obj.keyword === "string" ? obj.keyword.trim() : "";
  if (!keyword) return { ok: false, reason: "Expand JSON is missing keyword." };

  const associations = asStringList(obj.associations ?? obj.vibes ?? obj.ideas);
  const rolesRaw = isRecord(obj.roles) ? obj.roles : obj;
  const subject = parseVisuals(rolesRaw.subject, MOODBOARD_PACK_COUNTS.subject);
  const setting = parseVisuals(rolesRaw.setting, MOODBOARD_PACK_COUNTS.setting);
  const prop = parseVisuals(rolesRaw.prop ?? rolesRaw.props, MOODBOARD_PACK_COUNTS.prop);
  const mood = parseChips(rolesRaw.mood, MOODBOARD_PACK_COUNTS.mood);
  const color = parseColorChips(rolesRaw.color ?? rolesRaw.colors, MOODBOARD_PACK_COUNTS.color);

  let roles = { subject, setting, prop, mood, color };
  if (!subject.length || !setting.length || !prop.length || !mood.length || !color.length) {
    if (associations.length === 0 && !hasAnyImagePromptSeed(obj)) {
      return { ok: false, reason: "Expand JSON is missing one or more role buckets." };
    }
    const synthesized = synthesizeExpandPack(keyword, associations);
    roles = {
      subject: subject.length ? subject : synthesized.roles.subject,
      setting: setting.length ? setting : synthesized.roles.setting,
      prop: prop.length ? prop : synthesized.roles.prop,
      mood: mood.length ? mood : synthesized.roles.mood,
      color: color.length ? color : synthesized.roles.color,
    };
  }

  const parsedPrompts = parseImagePrompts(obj.imagePrompts ?? obj.prompts ?? obj.images);
  const imagePrompts =
    parsedPrompts.length >= MOODBOARD_IMAGE_COUNT
      ? parsedPrompts.slice(0, MOODBOARD_IMAGE_COUNT)
      : selectMoodboardImagePrompts({
          keyword,
          associations: associations.length
            ? associations
            : collectAssociationFallback(roles.subject, roles.setting, roles.prop),
          roles,
          imagePrompts: parsedPrompts,
        });

  if (imagePrompts.length !== MOODBOARD_IMAGE_COUNT) {
    return {
      ok: false,
      reason: `Expand must yield exactly ${MOODBOARD_IMAGE_COUNT} image prompts.`,
    };
  }

  return {
    ok: true,
    pack: {
      keyword,
      associations: associations.length
        ? associations
        : collectAssociationFallback(roles.subject, roles.setting, roles.prop),
      roles,
      imagePrompts,
    },
  };
}

/** Quantity-first roles + 9 image prompts when the model omitted buckets. */
export function synthesizeExpandPack(keyword: string, associations: string[]): MoodboardExpandPack {
  const seeds = uniqueLabels([
    ...associations,
    keyword,
    `${keyword} street`,
    `${keyword} people`,
    `${keyword} market`,
    `${keyword} night`,
    `${keyword} texture`,
    `${keyword} detail`,
    `${keyword} portrait`,
  ]);
  let offset = 0;
  const subject = takeVisuals(seeds, keyword, MOODBOARD_PACK_COUNTS.subject.min, offset);
  offset += subject.length;
  const setting = takeVisuals(seeds, keyword, MOODBOARD_PACK_COUNTS.setting.min, offset);
  offset += setting.length;
  const prop = takeVisuals(seeds, keyword, MOODBOARD_PACK_COUNTS.prop.min, offset);
  offset += prop.length;
  const mood = takeChips(seeds, MOODBOARD_PACK_COUNTS.mood.min, offset);
  offset += mood.length;
  const color = takeColorChips(seeds, MOODBOARD_PACK_COUNTS.color.min, offset);
  const roles = { subject, setting, prop, mood, color };
  const packBase = {
    keyword,
    associations: associations.length ? associations.slice(0, 24) : seeds.slice(0, 8),
    roles,
    imagePrompts: [] as MoodboardImagePrompt[],
  };
  return {
    ...packBase,
    imagePrompts: selectMoodboardImagePrompts(packBase),
  };
}

/**
 * Pick exactly {@link MOODBOARD_IMAGE_COUNT} distinct image prompts from the pack.
 * Prefer LLM-provided prompts; fill gaps from role labels.
 */
export function selectMoodboardImagePrompts(
  pack: Omit<MoodboardExpandPack, "imagePrompts"> & { imagePrompts?: MoodboardImagePrompt[] },
): MoodboardImagePrompt[] {
  const seen = new Set<string>();
  const selected: MoodboardImagePrompt[] = [];

  const push = (item: MoodboardImagePrompt | null) => {
    if (!item || selected.length >= MOODBOARD_IMAGE_COUNT) return;
    const key = item.prompt.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    selected.push({
      label: item.label.trim() || item.prompt.slice(0, 40),
      role: item.role,
      prompt: item.prompt.trim(),
    });
  };

  for (const item of pack.imagePrompts ?? []) push(item);

  const roleCycle: MoodboardRole[] = ["subject", "setting", "prop", "mood", "color"];
  const pools: Record<MoodboardRole, string[]> = {
    subject: pack.roles.subject.map((item) => item.label),
    setting: pack.roles.setting.map((item) => item.label),
    prop: pack.roles.prop.map((item) => item.label),
    mood: pack.roles.mood.map((item) => item.label),
    color: pack.roles.color.map((item) => item.label),
  };
  const poolIndex: Record<MoodboardRole, number> = {
    subject: 0,
    setting: 0,
    prop: 0,
    mood: 0,
    color: 0,
  };

  let guard = 0;
  while (selected.length < MOODBOARD_IMAGE_COUNT && guard < 64) {
    guard += 1;
    const role = roleCycle[selected.length % roleCycle.length];
    const pool = pools[role];
    const label =
      pool[poolIndex[role] % Math.max(1, pool.length)] ??
      pack.associations[selected.length % Math.max(1, pack.associations.length)] ??
      pack.keyword;
    poolIndex[role] += 1;
    push({
      label,
      role,
      prompt: buildFallbackImagePrompt(pack.keyword, label, role),
    });
  }

  while (selected.length < MOODBOARD_IMAGE_COUNT) {
    const index = selected.length + 1;
    push({
      label: `${pack.keyword} ${index}`,
      role: roleCycle[selected.length % roleCycle.length],
      prompt: buildFallbackImagePrompt(pack.keyword, `${pack.keyword} idea ${index}`, "mood"),
    });
  }

  return selected.slice(0, MOODBOARD_IMAGE_COUNT);
}

export function isMoodboardRole(value: unknown): value is MoodboardRole {
  return typeof value === "string" && ROLE_SET.has(value);
}

function hasAnyImagePromptSeed(obj: Record<string, unknown>): boolean {
  return Array.isArray(obj.imagePrompts) || Array.isArray(obj.prompts) || Array.isArray(obj.images);
}

function parseImagePrompts(raw: unknown): MoodboardImagePrompt[] {
  if (!Array.isArray(raw)) return [];
  const items: MoodboardImagePrompt[] = [];
  for (const entry of raw) {
    if (items.length >= MOODBOARD_IMAGE_COUNT + 4) break;
    const parsed = parseImagePrompt(entry);
    if (parsed) items.push(parsed);
  }
  return items;
}

function parseImagePrompt(raw: unknown): MoodboardImagePrompt | null {
  if (typeof raw === "string") {
    const prompt = raw.trim();
    if (!prompt) return null;
    return { label: prompt.slice(0, 48), role: "subject", prompt };
  }
  if (!isRecord(raw)) return null;
  const prompt = asNonEmptyString(raw.prompt ?? raw.query ?? raw.text ?? raw.description);
  const label = asNonEmptyString(raw.label ?? raw.name ?? prompt?.slice(0, 48));
  if (!prompt || !label) return null;
  const role = isMoodboardRole(raw.role) ? raw.role : "subject";
  return { label, role, prompt };
}

function parseVisuals(raw: unknown, bounds: { min: number; max: number }): MoodboardExpandVisual[] {
  if (!Array.isArray(raw)) return [];
  const items: MoodboardExpandVisual[] = [];
  for (const entry of raw) {
    if (items.length >= bounds.max) break;
    const parsed = parseVisual(entry);
    if (parsed) items.push(parsed);
  }
  return items;
}

function parseVisual(raw: unknown): MoodboardExpandVisual | null {
  if (typeof raw === "string") {
    const label = raw.trim();
    if (!label) return null;
    return { label, query: label };
  }
  if (!isRecord(raw)) return null;
  const label = asNonEmptyString(raw.label ?? raw.name ?? raw.text);
  const query = asNonEmptyString(raw.query ?? raw.stockQuery ?? raw.search ?? label);
  if (!label || !query) return null;
  return { label, query };
}

function parseChips(raw: unknown, bounds: { min: number; max: number }): MoodboardExpandChip[] {
  if (!Array.isArray(raw)) return [];
  const items: MoodboardExpandChip[] = [];
  for (const entry of raw) {
    if (items.length >= bounds.max) break;
    if (typeof entry === "string") {
      const label = entry.trim();
      if (label) items.push({ label, query: label });
      continue;
    }
    if (!isRecord(entry)) continue;
    const label = asNonEmptyString(entry.label ?? entry.name ?? entry.text);
    if (!label) continue;
    items.push({
      label,
      query: asNonEmptyString(entry.query) ?? label,
    });
  }
  return items;
}

function parseColorChips(
  raw: unknown,
  bounds: { min: number; max: number },
): MoodboardExpandChip[] {
  const chips = parseChips(raw, bounds);
  if (!Array.isArray(raw)) return chips;
  return chips.map((chip, index) => {
    const entry = raw[index];
    const hex = isRecord(entry) ? asHex(entry.hex ?? entry.color) : asHex(entry);
    return { ...chip, hex: hex ?? fallbackColor(index) };
  });
}

function collectAssociationFallback(
  subject: MoodboardExpandVisual[],
  setting: MoodboardExpandVisual[],
  prop: MoodboardExpandVisual[],
): string[] {
  return [...subject, ...setting, ...prop].map((item) => item.label);
}

function takeVisuals(
  seeds: string[],
  keyword: string,
  count: number,
  offset: number,
): MoodboardExpandVisual[] {
  const items: MoodboardExpandVisual[] = [];
  for (let i = 0; i < count; i += 1) {
    const label = seeds[(offset + i) % seeds.length] ?? keyword;
    items.push({
      label,
      query: `${keyword} ${label}`.trim(),
    });
  }
  return items;
}

function takeChips(seeds: string[], count: number, offset: number): MoodboardExpandChip[] {
  const items: MoodboardExpandChip[] = [];
  for (let i = 0; i < count; i += 1) {
    const label = seeds[(offset + i) % seeds.length] ?? `mood ${i + 1}`;
    items.push({ label, query: label });
  }
  return items;
}

function takeColorChips(seeds: string[], count: number, offset: number): MoodboardExpandChip[] {
  const items: MoodboardExpandChip[] = [];
  for (let i = 0; i < count; i += 1) {
    const label = seeds[(offset + i) % seeds.length] ?? `color ${i + 1}`;
    items.push({ label, hex: fallbackColor(i) });
  }
  return items;
}

function buildFallbackImagePrompt(keyword: string, label: string, role: MoodboardRole): string {
  return `Moodboard ${role} reference for "${keyword}": ${label}. Single upright photographic still, distinct composition, no collage, no text overlay.`;
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
  return result.length ? result : ["reference"];
}

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 24);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : undefined;
}

function fallbackColor(index: number): string {
  const palette = ["#1f2937", "#f59e0b", "#ef4444", "#10b981", "#6366f1", "#f8fafc"];
  return palette[index % palette.length];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
