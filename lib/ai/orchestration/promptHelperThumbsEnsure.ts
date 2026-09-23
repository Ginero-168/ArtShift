/**
 * Ensure Prompt Helper thumbnails exist on disk (VPS public folder).
 * Missing ids are generated via Replicate and persisted for later opens.
 * Catalog ids use their stored prompt. Invented ids (wings__bat, species__western)
 * use the option modifier/label plus the card subject.
 *
 * Sensitive / hard failures are recorded so reopen does not burn the same
 * Replicate call forever — a safer fallback prompt is tried once first.
 */

import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isPromptHelperThumbId } from "./promptHelperThumbManifest";
import {
  listPromptHelperThumbEntries,
  type PromptHelperThumbOptionHint,
  resolvePromptHelperThumbPrompt,
} from "./promptHelperThumbPrompts";

const DEFAULT_OUT_DIR = path.join(process.cwd(), "public/prompt-helper/thumbs");
const MODEL = process.env.PROMPT_HELPER_THUMB_MODEL || "openai/gpt-image-2.5-sunburst";
const CONCURRENCY = Math.max(1, Number(process.env.PROMPT_HELPER_THUMB_CONCURRENCY || 2));
const FAILED_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const inFlight = new Set<string>();
let queueTail: Promise<void> = Promise.resolve();

function thumbLocations(): { outDir: string; manifestJson: string; failedJson: string } {
  const outDir =
    process.env.VITEST && process.env.PROMPT_HELPER_THUMB_DIR
      ? path.resolve(process.env.PROMPT_HELPER_THUMB_DIR)
      : DEFAULT_OUT_DIR;
  return {
    outDir,
    manifestJson: path.join(path.dirname(outDir), "manifest.json"),
    failedJson: path.join(outDir, "_failed.json"),
  };
}

const SAFE_FALLBACK_PROMPTS: Readonly<Record<string, string>> = {
  comic:
    "Wholesome pop-art poster of a smiling coffee cup with thick black outlines and bright halftone dots, clean illustration, square crop, no text, no watermark",
  pixel:
    "Cute 8-bit pixel art gem icon on a bright blue background, wholesome game sprite, square crop, no text, no watermark",
  clay: "Soft clay sculpture of a round yellow smiling blob character, stop-motion clay look, wholesome, square crop, no text, no watermark",
  ink: "Gentle Chinese ink wash of distant misty mountains on cream paper, traditional brush painting, square crop, no text, no watermark",
  child:
    "Wholesome illustration of a cheerful child silhouette playing with a kite at a park, soft daylight, square crop, no text, no watermark",
  couple:
    "Wholesome illustration of two people holding hands at sunset as distant silhouettes, romantic soft light, square crop, no text, no watermark",
  model:
    "Elegant adult fashion editorial portrait, soft studio light, wholesome magazine look, square crop, no text, no watermark",
};

type FailedEntry = {
  at: number;
  reason: string;
  promptHash: string;
  attempts: number;
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function hashPrompt(prompt: string): string {
  return createHash("sha1").update(prompt).digest("hex").slice(0, 12);
}

function isSensitiveError(message: string): boolean {
  return /sensitive|E005|flagged|nsfw|safety|policy/i.test(message);
}

async function loadFailedMap(): Promise<Record<string, FailedEntry>> {
  try {
    const raw = await readFile(thumbLocations().failedJson, "utf8");
    const parsed = JSON.parse(raw) as Record<string, FailedEntry>;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

async function saveFailedMap(map: Record<string, FailedEntry>): Promise<void> {
  const { outDir, failedJson } = thumbLocations();
  await mkdir(outDir, { recursive: true });
  await writeFile(failedJson, `${JSON.stringify(map, null, 2)}\n`);
}

function shouldSkipFailed(
  entry: FailedEntry | undefined,
  promptHash: string,
  now = Date.now(),
): boolean {
  if (!entry) return false;
  if (entry.promptHash !== promptHash) return false;
  if (now - entry.at > FAILED_COOLDOWN_MS) return false;
  return entry.attempts >= 1;
}

function firstOutputUrl(output: unknown): string | null {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const nested = firstOutputUrl(item);
      if (nested) return nested;
    }
  }
  if (output && typeof output === "object") {
    for (const value of Object.values(output as Record<string, unknown>)) {
      const nested = firstOutputUrl(value);
      if (nested) return nested;
    }
  }
  return null;
}

async function createPrediction(token: string, prompt: string) {
  const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: "1:1",
        quality: "low",
        output_format: "jpeg",
        output_compression: 70,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`replicate ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<{
    id: string;
    status: string;
    output?: unknown;
    error?: string;
  }>;
}

async function waitPrediction(
  token: string,
  prediction: { id: string; status: string; output?: unknown; error?: string },
) {
  let current = prediction;
  for (let i = 0; i < 120; i++) {
    if (current.status === "succeeded") return current;
    if (current.status === "failed" || current.status === "canceled") {
      throw new Error(`prediction ${current.status}: ${current.error || ""}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${current.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`poll ${res.status}`);
    current = (await res.json()) as typeof current;
  }
  throw new Error("prediction timeout");
}

async function downloadToFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function writeJsonManifest() {
  const { outDir, manifestJson } = thumbLocations();
  await mkdir(outDir, { recursive: true });
  const files = await readdir(outDir);
  const ids = files
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => f.replace(/\.jpg$/, ""))
    .sort();
  const jsonManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    thumbs: Object.fromEntries(ids.map((id) => [id, { src: `/prompt-helper/thumbs/${id}.jpg` }])),
  };
  await writeFile(manifestJson, `${JSON.stringify(jsonManifest, null, 2)}\n`);
  return ids;
}

async function runPredictionToFile(token: string, prompt: string, dest: string) {
  let prediction = await createPrediction(token, prompt);
  if (prediction.status !== "succeeded") {
    prediction = await waitPrediction(token, prediction);
  }
  const url = firstOutputUrl(prediction.output);
  if (!url) throw new Error("no output url");
  await mkdir(thumbLocations().outDir, { recursive: true });
  await downloadToFile(url, dest);
}

async function generateOne(token: string, optionId: string, primary: string) {
  if (!primary || !isPromptHelperThumbId(optionId)) return false;
  const dest = path.join(thumbLocations().outDir, `${optionId}.jpg`);
  if (await exists(dest)) {
    const failed = await loadFailedMap();
    if (failed[optionId]) {
      delete failed[optionId];
      await saveFailedMap(failed);
    }
    return true;
  }

  const promptHash = hashPrompt(primary);
  try {
    await runPredictionToFile(token, primary, dest);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const fallback = SAFE_FALLBACK_PROMPTS[optionId];
    if (fallback && (isSensitiveError(message) || /prediction failed/i.test(message))) {
      try {
        console.warn(`[prompt-helper-thumbs] retry ${optionId} with safer prompt`);
        await runPredictionToFile(token, fallback, dest);
      } catch (fallbackError) {
        await recordFailure(
          optionId,
          promptHash,
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
        );
        throw fallbackError;
      }
    } else {
      await recordFailure(optionId, promptHash, message);
      throw error;
    }
  }

  const failed = await loadFailedMap();
  if (failed[optionId]) {
    delete failed[optionId];
    await saveFailedMap(failed);
  }
  return true;
}

async function recordFailure(optionId: string, promptHash: string, reason: string) {
  const failed = await loadFailedMap();
  const prev = failed[optionId];
  failed[optionId] = {
    at: Date.now(),
    reason: reason.slice(0, 400),
    promptHash,
    attempts: (prev?.promptHash === promptHash ? prev.attempts : 0) + 1,
  };
  await saveFailedMap(failed);
}

export async function listExistingPromptHelperThumbIds(): Promise<string[]> {
  try {
    const { outDir } = thumbLocations();
    await mkdir(outDir, { recursive: true });
    const files = await readdir(outDir);
    return files
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => f.replace(/\.jpg$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export async function listFailedPromptHelperThumbIds(): Promise<string[]> {
  const failed = await loadFailedMap();
  const now = Date.now();
  return Object.entries(failed)
    .filter(([, entry]) => shouldSkipFailed(entry, entry.promptHash, now))
    .map(([id]) => id)
    .sort();
}

export type EnsureThumbsResult = {
  existing: string[];
  queued: string[];
  skippedNoPrompt: string[];
  skippedFailed: string[];
  skippedNoToken: boolean;
};

export async function ensurePromptHelperThumbs(params: {
  optionIds: string[];
  token: string | null | undefined;
  maxQueue?: number;
  /** Label and modifier for ids that are not in the photography catalog. */
  options?: PromptHelperThumbOptionHint[];
  /** Card subject, e.g. "ภาพมังกร", folded into invented thumb prompts. */
  baseSubject?: string;
  /** When true, resolve after queued generations finish. */
  wait?: boolean;
}): Promise<EnsureThumbsResult> {
  const maxQueue = params.maxQueue ?? 48;
  const { outDir } = thumbLocations();
  await mkdir(outDir, { recursive: true });
  const known = new Set(await listExistingPromptHelperThumbIds());
  const failedMap = await loadFailedMap();
  const hints = new Map<string, PromptHelperThumbOptionHint>();
  for (const hint of params.options ?? []) {
    if (!hint || typeof hint.id !== "string" || hints.has(hint.id)) continue;
    hints.set(hint.id, hint);
  }
  const baseSubject = params.baseSubject?.trim() || undefined;
  const unique = [...new Set(params.optionIds.map((id) => id.trim()).filter(Boolean))];
  const existing: string[] = [];
  const missing: string[] = [];
  const skippedNoPrompt: string[] = [];
  const skippedFailed: string[] = [];
  const prompts = new Map<string, string>();

  for (const id of unique) {
    if (!isPromptHelperThumbId(id)) {
      skippedNoPrompt.push(id);
      continue;
    }
    if (known.has(id)) {
      existing.push(id);
      continue;
    }
    const hint = hints.get(id);
    const prompt = resolvePromptHelperThumbPrompt(id, {
      label: hint?.label,
      modifier: hint?.modifier,
      baseSubject,
    });
    if (!prompt) {
      skippedNoPrompt.push(id);
      continue;
    }
    if (shouldSkipFailed(failedMap[id], hashPrompt(prompt))) {
      skippedFailed.push(id);
      continue;
    }
    prompts.set(id, prompt);
    missing.push(id);
  }

  const queued = missing.filter((id) => !inFlight.has(id)).slice(0, maxQueue);
  if (!params.token) {
    return { existing, queued: [], skippedNoPrompt, skippedFailed, skippedNoToken: true };
  }
  if (queued.length === 0) {
    return { existing, queued: [], skippedNoPrompt, skippedFailed, skippedNoToken: false };
  }

  console.info(
    `[prompt-helper-thumbs] queue ${queued.length}/${missing.length} missing (have ${existing.length}): ${queued.slice(0, 12).join(",")}${queued.length > 12 ? "…" : ""}`,
  );

  for (const id of queued) inFlight.add(id);
  const token = params.token;
  const job = queueTail.then(async () => {
    let index = 0;
    async function worker() {
      while (index < queued.length) {
        const id = queued[index++]!;
        try {
          await generateOne(token, id, prompts.get(id) || "");
        } catch (error) {
          console.error(
            `[prompt-helper-thumbs] ✗ ${id}:`,
            error instanceof Error ? error.message : error,
          );
        } finally {
          inFlight.delete(id);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queued.length) }, () => worker()));
    try {
      await writeJsonManifest();
    } catch (error) {
      console.error("[prompt-helper-thumbs] manifest:", error);
    }
  });
  queueTail = job.catch((error) => {
    console.error("[prompt-helper-thumbs] queue:", error);
  });

  if (params.wait) await queueTail;
  return { existing, queued, skippedNoPrompt, skippedFailed, skippedNoToken: false };
}

export function allCatalogThumbIds(): string[] {
  return listPromptHelperThumbEntries().map((e) => e.id);
}
