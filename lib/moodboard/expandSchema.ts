import type { MoodboardRole } from "@/lib/engine/types";
import { parseJsonCandidate } from "./json";
import { MOODBOARD_PACK_COUNTS, MOODBOARD_ROLES, MOODBOARD_TARGET_ITEM_COUNT } from "./types";

export type MoodboardExpandVisual = {
  label: string;
  query: string;
  photoCount: 1 | 2;
};

export type MoodboardExpandChip = {
  label: string;
  query?: string;
  hex?: string;
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
  const candidate = typeof raw === "string" ? parseJsonCandidate(raw) : raw;
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

  if (!subject.length || !setting.length || !prop.length || !mood.length || !color.length) {
    return { ok: false, reason: "Expand JSON is missing one or more role buckets." };
  }

  const pack: MoodboardExpandPack = {
    keyword,
    associations: associations.length
      ? associations
      : collectAssociationFallback(subject, setting, prop),
    roles: { subject, setting, prop, mood, color },
  };
  return { ok: true, pack };
}

export function plannedBoardItemCount(pack: MoodboardExpandPack): number {
  const photos =
    countPhotos(pack.roles.subject) +
    countPhotos(pack.roles.setting) +
    countPhotos(pack.roles.prop);
  return photos + pack.roles.mood.length + pack.roles.color.length;
}

export function isQuantityFirstPack(pack: MoodboardExpandPack): boolean {
  const count = plannedBoardItemCount(pack);
  return count >= MOODBOARD_TARGET_ITEM_COUNT.min && count <= MOODBOARD_TARGET_ITEM_COUNT.max + 6;
}

export function flattenStockQueries(pack: MoodboardExpandPack): string[] {
  const queries: string[] = [];
  for (const role of ["subject", "setting", "prop"] as const) {
    for (const item of pack.roles[role]) {
      for (let i = 0; i < item.photoCount; i += 1) {
        queries.push(i === 0 ? item.query : `${item.query} ${item.label}`);
      }
    }
  }
  return queries;
}

export function isMoodboardRole(value: unknown): value is MoodboardRole {
  return typeof value === "string" && ROLE_SET.has(value);
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
    return { label, query: label, photoCount: 1 };
  }
  if (!isRecord(raw)) return null;
  const label = asNonEmptyString(raw.label ?? raw.name ?? raw.text);
  const query = asNonEmptyString(raw.query ?? raw.stockQuery ?? raw.search ?? label);
  if (!label || !query) return null;
  const photoCount = raw.photoCount === 2 || raw.photos === 2 ? 2 : 1;
  return { label, query, photoCount };
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

function countPhotos(items: MoodboardExpandVisual[]): number {
  return items.reduce((sum, item) => sum + item.photoCount, 0);
}

function collectAssociationFallback(
  subject: MoodboardExpandVisual[],
  setting: MoodboardExpandVisual[],
  prop: MoodboardExpandVisual[],
): string[] {
  return [...subject, ...setting, ...prop].map((item) => item.label);
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
