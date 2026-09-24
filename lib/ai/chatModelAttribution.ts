/**
 * AI Chat model attribution — surface real runtime model ids, never invented names.
 *
 * Sources of truth:
 * - Adapter `metadata.model` / `execution.metadata.model` (Replicate, Google, OpenAI)
 * - Creating-model catalog `modelId` (image generate / vectorize / upscale)
 * - Local vision registry id `florence-2`
 * - Director default slug matching `lib/server/ai/modelManifest.ts` `defaultBrainModel`
 */

import { CREATING_MODEL_CATALOG } from "@/lib/ai/orchestration/creatingModelCatalog";

export type ChatModelRole = "chat" | "image" | "vision" | "local";

export type ChatModelStep = {
  /** Runtime model id (slug). Version hashes are stripped for display. */
  id: string;
  role: ChatModelRole;
};

/**
 * Default Creative Director / chat brain slug.
 * Keep in sync with `createAiRouteTable` `defaultBrainModel` in modelManifest.ts.
 */
export const DEFAULT_DIRECTOR_MODEL_ID = "google/gemini-3-flash";

/** Local Florence-2 id from `lib/ai/modelRegistry.ts`. */
export const FLORENCE_2_MODEL_ID = "florence-2";

const MAX_MODEL_ID_LENGTH = 120;
const REPLICATE_VERSION_SUFFIX = /@[a-f0-9]{64}$/iu;

/** Strip version pins and reject empty / oversized values. Does not invent a fallback. */
export function normalizeRuntimeModelId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_MODEL_ID_LENGTH) return null;
  const stripped = trimmed.replace(REPLICATE_VERSION_SUFFIX, "").trim();
  if (!stripped || stripped.length > MAX_MODEL_ID_LENGTH) return null;
  return stripped;
}

export function isFlorenceModelId(id: string): boolean {
  return id === FLORENCE_2_MODEL_ID || id.toLowerCase().includes("florence");
}

export function directorModelStep(raw?: string | null): ChatModelStep {
  const id = normalizeRuntimeModelId(raw) ?? DEFAULT_DIRECTOR_MODEL_ID;
  return { id, role: "chat" };
}

export function florenceModelStep(): ChatModelStep {
  return { id: FLORENCE_2_MODEL_ID, role: "vision" };
}

/**
 * Cloud vision step (Gemini 3 Flash API). Returns null for Florence so the
 * sparkle/status row never labels local ONNX as the active vision model.
 */
export function visionModelStep(raw?: string | null): ChatModelStep | null {
  const id = normalizeRuntimeModelId(raw) ?? DEFAULT_DIRECTOR_MODEL_ID;
  if (isFlorenceModelId(id)) return null;
  return { id, role: "vision" };
}

/** Resolve a creating-model alias to its catalog `modelId`. Returns null if unknown or unconfigured. */
export function resolveCatalogModelId(alias?: string | null): string | null {
  if (!alias) return null;
  if (alias === "creative-director") return DEFAULT_DIRECTOR_MODEL_ID;
  const entry = CREATING_MODEL_CATALOG.find((model) => model.alias === alias);
  return entry?.modelId ? normalizeRuntimeModelId(entry.modelId) : null;
}

export function catalogModelStep(
  alias?: string | null,
  role: ChatModelRole = "image",
): ChatModelStep | null {
  const id = resolveCatalogModelId(alias);
  return id ? { id, role } : null;
}

export function modelStepFromRuntime(
  raw: string | null | undefined,
  role: ChatModelRole,
): ChatModelStep | null {
  const id = normalizeRuntimeModelId(raw);
  return id ? { id, role } : null;
}

export function appendModelStep(
  steps: readonly ChatModelStep[],
  next: ChatModelStep | null | undefined,
): ChatModelStep[] {
  if (!next?.id) return [...steps];
  const last = steps[steps.length - 1];
  if (last && last.id === next.id && last.role === next.role) return [...steps];
  if (steps.some((step) => step.id === next.id && step.role === next.role)) {
    return [...steps];
  }
  return [...steps, next];
}

/** Replace the step for this role (expected → actual adapter id) or append a new role. */
export function upsertModelStep(
  steps: readonly ChatModelStep[],
  next: ChatModelStep | null | undefined,
): ChatModelStep[] {
  if (!next?.id) return [...steps];
  const index = steps.findIndex((step) => step.role === next.role);
  if (index === -1) return [...steps, next];
  if (steps[index]?.id === next.id) return [...steps];
  const copy = [...steps];
  copy[index] = next;
  return copy;
}

export function uniqueModelSteps(steps: readonly ChatModelStep[]): ChatModelStep[] {
  const seen = new Set<string>();
  const result: ChatModelStep[] = [];
  for (const step of steps) {
    const id = normalizeRuntimeModelId(step.id);
    if (!id) continue;
    const key = `${step.role}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ id, role: step.role });
  }
  return result;
}

/**
 * Status / sparkle row.
 * Planning + generate: `google/gemini-3-flash → openai/gpt-image-2.5-sunburst`.
 * Generate-only: cloud image API. Vision-only: Gemini API. Never local Florence/ONNX.
 */
export function displayModelSteps(steps: readonly ChatModelStep[]): ChatModelStep[] {
  const unique = uniqueModelSteps(steps).filter((step) => !isFlorenceModelId(step.id));
  const chat = unique.filter((step) => step.role === "chat");
  const vision = unique.filter((step) => step.role === "vision" || step.role === "local");
  const image = unique.filter((step) => step.role === "image");
  const planning = chat.length > 0 ? chat : vision;
  if (planning.length > 0 && image.length > 0) return [...planning, ...image];
  if (image.length > 0) return image;
  if (vision.length > 0) return vision;
  if (chat.length > 0) return chat;
  return [];
}

function displayId(id: string): string {
  if (id === FLORENCE_2_MODEL_ID) return "Florence-2";
  return id;
}

/**
 * Completed-turn label.
 * One model: `google/gemini-3-flash`
 * Image then local vision: `openai/gpt-image-2.5-sunburst then Florence-2`
 * Multiple other models: `google/gemini-3-flash → openai/gpt-image-2.5-sunburst`
 */
export function formatModelChain(steps: readonly ChatModelStep[]): string {
  const ids = uniqueModelSteps(steps).map((step) => step.id);
  if (ids.length === 0) return "";
  if (ids.length === 1) return displayId(ids[0]!);

  const primary = ids[0]!;
  const rest = ids.slice(1);
  const onlyFlorenceFollows = rest.every((id) => id === FLORENCE_2_MODEL_ID);
  if (onlyFlorenceFollows && rest.length > 0) {
    return `${displayId(primary)} then Florence-2`;
  }

  const florenceAtEnd =
    rest[rest.length - 1] === FLORENCE_2_MODEL_ID &&
    rest.slice(0, -1).every((id) => id !== FLORENCE_2_MODEL_ID);
  if (florenceAtEnd) {
    const middle = rest.slice(0, -1).map(displayId);
    const chain = [displayId(primary), ...middle].join(" → ");
    return `${chain} then Florence-2`;
  }

  return [primary, ...rest].map(displayId).join(" → ");
}

/**
 * Model id shown on the image-gen sparkle / spinner row.
 * Generate: cloud image API. Vision: Gemini API. Chat: Gemini. Never local Florence.
 */
export function formatModelDisclosure(
  steps?: readonly ChatModelStep[] | null,
  fallback?: string | null,
): string {
  const chain = formatModelChain(displayModelSteps(steps ?? []));
  if (chain) return chain;
  const extra = typeof fallback === "string" ? fallback.trim() : "";
  if (!extra) return "";
  const normalized = normalizeRuntimeModelId(extra);
  if (!normalized || normalized === FLORENCE_2_MODEL_ID) return "";
  if (extra === "Florence-2") return "";
  return extra;
}

const MODEL_CHAIN_SEPARATOR = /(\s→\s|\sthen\s)/;

/**
 * Chip label. Strips `google/` and internal suffixes such as `@hidden`.
 * `google/gemini-3-flash@hidden` → `Gemini 3 Flash`.
 */
export function formatModelDisplayLabel(raw: string): string {
  return raw
    .split(MODEL_CHAIN_SEPARATOR)
    .map((part) => (part === " → " || part === " then " ? part : humanizeRuntimeModelId(part)))
    .join("");
}

/** Tooltip id. Drops the `@hidden` placeholder and keeps a real provider slug. */
export function formatModelTechnicalTitle(raw: string): string {
  return raw
    .split(MODEL_CHAIN_SEPARATOR)
    .map((part) => (part === " → " || part === " then " ? part : stripHiddenModelSuffix(part)))
    .join("");
}

export function humanizeRuntimeModelId(raw: string): string {
  const cleaned = stripHiddenModelSuffix(raw)
    .replace(/@[a-f0-9]{64}$/iu, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned === "Florence-2" || cleaned === FLORENCE_2_MODEL_ID) return "Florence-2";
  if (!cleaned.includes("/") && !cleaned.includes("@") && /\s/u.test(cleaned)) return cleaned;
  const slug = cleaned.includes("/") ? cleaned.slice(cleaned.lastIndexOf("/") + 1) : cleaned;
  return humanizeModelSlug(slug);
}

function stripHiddenModelSuffix(raw: string): string {
  return raw.trim().replace(/@hidden$/iu, "");
}

function humanizeModelSlug(slug: string): string {
  const gemini = /^gemini-(.+)$/iu.exec(slug);
  if (gemini?.[1]) {
    const parts = gemini[1]
      .split("-")
      .filter(Boolean)
      .map((part) => (/^\d+(?:\.\d+)?$/u.test(part) ? part : titleToken(part)));
    return ["Gemini", ...parts].join(" ");
  }
  const gptImage = /^gpt-image-(.+)$/iu.exec(slug);
  if (gptImage?.[1]) {
    const parts = gptImage[1].split("-").filter(Boolean);
    const version = parts[0] ?? "";
    const variant = parts.slice(1).map(titleToken).join(" ");
    return variant ? `GPT Image ${version} ${variant}` : `GPT Image ${version}`;
  }
  if (/^gpt-4o-mini$/iu.test(slug)) return "GPT-4o mini";
  const oss = /^gpt-oss-(\d+b)$/iu.exec(slug);
  if (oss?.[1]) return `GPT-OSS ${oss[1].toUpperCase()}`;
  if (/^florence-2$/iu.test(slug)) return "Florence-2";
  return slug.split("-").filter(Boolean).map(titleToken).join(" ");
}

function titleToken(token: string): string {
  if (/^gpt$/iu.test(token)) return "GPT";
  if (/^ai$/iu.test(token)) return "AI";
  if (/^oss$/iu.test(token)) return "OSS";
  if (/^\d+(?:\.\d+)?$/u.test(token)) return token;
  if (/^\d+(?:\.\d+)?[a-z]+$/iu.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/**
 * In-flight Thought phrasing, matching image gen `กำลังสร้างรูปภาพด้วย {id}...`
 */
export function formatUsingStatus(steps: readonly ChatModelStep[]): string {
  const chain = formatModelChain(displayModelSteps(steps));
  return chain ? `กำลังใช้ ${chain}...` : "";
}

export function attachRuntimeModel<T extends { runtimeModel?: string }>(
  value: T,
  rawModel: string | null | undefined,
): T {
  const id = normalizeRuntimeModelId(rawModel);
  if (!id) return value;
  return { ...value, runtimeModel: id };
}

export type ChatTurnModels = {
  remember: (step: ChatModelStep | null | undefined) => ChatModelStep[];
  forget: (role: ChatModelRole) => ChatModelStep[];
  snapshot: () => ChatModelStep[];
  label: () => string;
  using: () => string;
  attach: <T extends object>(message: T) => T & { usedModels?: ChatModelStep[] };
};

export function createChatTurnModels(): ChatTurnModels {
  let steps: ChatModelStep[] = [];
  const snapshot = () => uniqueModelSteps(steps);
  const label = () => formatModelChain(displayModelSteps(steps));
  return {
    remember(step) {
      steps = upsertModelStep(steps, step);
      return snapshot();
    },
    forget(role) {
      steps = steps.filter((step) => step.role !== role);
      return snapshot();
    },
    snapshot,
    label,
    using: () => formatUsingStatus(steps),
    attach(message) {
      const usedModels = snapshot();
      return usedModels.length > 0 ? { ...message, usedModels } : { ...message };
    },
  };
}
