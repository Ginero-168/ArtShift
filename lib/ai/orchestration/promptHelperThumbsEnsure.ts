/**
 * Ensure Prompt Helper thumbnails exist on disk (VPS public folder).
 * Missing ids are generated via Replicate and persisted for later opens.
 */

import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listPromptHelperThumbEntries, promptHelperThumbPrompt } from "./promptHelperThumbPrompts";

const OUT_DIR = path.join(process.cwd(), "public/prompt-helper/thumbs");
const MANIFEST_JSON = path.join(process.cwd(), "public/prompt-helper/manifest.json");
const MODEL = process.env.PROMPT_HELPER_THUMB_MODEL || "openai/gpt-image-2.5-sunburst";
const CONCURRENCY = Math.max(1, Number(process.env.PROMPT_HELPER_THUMB_CONCURRENCY || 2));

const inFlight = new Set<string>();
let queueTail: Promise<void> = Promise.resolve();

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
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
  await mkdir(OUT_DIR, { recursive: true });
  const files = await readdir(OUT_DIR);
  const ids = files
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => f.replace(/\.jpg$/, ""))
    .sort();
  const jsonManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    thumbs: Object.fromEntries(ids.map((id) => [id, { src: `/prompt-helper/thumbs/${id}.jpg` }])),
  };
  await writeFile(MANIFEST_JSON, `${JSON.stringify(jsonManifest, null, 2)}\n`);
  return ids;
}

async function generateOne(token: string, optionId: string) {
  const prompt = promptHelperThumbPrompt(optionId);
  if (!prompt) return false;
  const dest = path.join(OUT_DIR, `${optionId}.jpg`);
  if (await exists(dest)) return true;
  let prediction = await createPrediction(token, prompt);
  if (prediction.status !== "succeeded") {
    prediction = await waitPrediction(token, prediction);
  }
  const url = firstOutputUrl(prediction.output);
  if (!url) throw new Error(`no output url for ${optionId}`);
  await mkdir(OUT_DIR, { recursive: true });
  await downloadToFile(url, dest);
  return true;
}

export async function listExistingPromptHelperThumbIds(): Promise<string[]> {
  try {
    await mkdir(OUT_DIR, { recursive: true });
    const files = await readdir(OUT_DIR);
    return files
      .filter((f) => f.endsWith(".jpg"))
      .map((f) => f.replace(/\.jpg$/, ""))
      .sort();
  } catch {
    return [];
  }
}

export type EnsureThumbsResult = {
  existing: string[];
  queued: string[];
  skippedNoPrompt: string[];
  skippedNoToken: boolean;
};

/**
 * Queue missing thumbs for background generation. Returns immediately after scheduling.
 * Files land in `public/prompt-helper/thumbs/` so the next Helper open (or a poll) can show them.
 */
export async function ensurePromptHelperThumbs(params: {
  optionIds: string[];
  token: string | null | undefined;
  maxQueue?: number;
}): Promise<EnsureThumbsResult> {
  const maxQueue = params.maxQueue ?? 24;
  await mkdir(OUT_DIR, { recursive: true });
  const known = new Set(await listExistingPromptHelperThumbIds());
  const unique = [...new Set(params.optionIds.map((id) => id.trim()).filter(Boolean))];
  const existing: string[] = [];
  const missing: string[] = [];
  const skippedNoPrompt: string[] = [];

  for (const id of unique) {
    if (known.has(id)) {
      existing.push(id);
      continue;
    }
    if (!promptHelperThumbPrompt(id)) {
      skippedNoPrompt.push(id);
      continue;
    }
    missing.push(id);
  }

  const queued = missing.filter((id) => !inFlight.has(id)).slice(0, maxQueue);
  if (!params.token) {
    return { existing, queued: [], skippedNoPrompt, skippedNoToken: true };
  }
  if (queued.length === 0) {
    return { existing, queued: [], skippedNoPrompt, skippedNoToken: false };
  }

  for (const id of queued) inFlight.add(id);
  const token = params.token;
  queueTail = queueTail
    .then(async () => {
      let index = 0;
      async function worker() {
        while (index < queued.length) {
          const id = queued[index++]!;
          try {
            await generateOne(token, id);
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
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queued.length) }, () => worker()),
      );
      try {
        await writeJsonManifest();
      } catch (error) {
        console.error("[prompt-helper-thumbs] manifest:", error);
      }
    })
    .catch((error) => {
      console.error("[prompt-helper-thumbs] queue:", error);
    });

  return { existing, queued, skippedNoPrompt, skippedNoToken: false };
}

export function allCatalogThumbIds(): string[] {
  return listPromptHelperThumbEntries().map((e) => e.id);
}
