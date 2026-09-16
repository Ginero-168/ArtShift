#!/usr/bin/env node
/**
 * Generate Prompt Helper thumbnails via Replicate and store them on the VPS
 * under public/prompt-helper/thumbs/, then rewrite the TS manifest.
 *
 * Usage:
 *   node --env-file=.env.local scripts/generate-prompt-helper-thumbs.mjs
 *   node --env-file=.env.local scripts/generate-prompt-helper-thumbs.mjs --only=vibrant,pastel
 *   node --env-file=.env.local scripts/generate-prompt-helper-thumbs.mjs --missing
 */
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public/prompt-helper/thumbs");
const MANIFEST_TS = path.join(
  ROOT,
  "lib/ai/orchestration/promptHelperThumbManifest.ts",
);
const MODEL = process.env.PROMPT_HELPER_THUMB_MODEL || "openai/gpt-image-2.5-sunburst";
const TOKEN = process.env.REPLICATE_API_TOKEN;
const CONCURRENCY = Number(process.env.PROMPT_HELPER_THUMB_CONCURRENCY || 2);

/** Compact visual prompts for UI chips — no logos/campaign brands hardcoded. */
const THUMBS = [
  { id: "vibrant", prompt: "Abstract vibrant color field, neon coral yellow teal energy, soft studio lighting, square crop, no text" },
  { id: "pastel", prompt: "Soft pastel color wash pink mint peach lavender, dreamy light, square crop, no text" },
  { id: "earth", prompt: "Warm earth-tone abstract clay sand ochre, natural soft light, square crop, no text" },
  { id: "dark", prompt: "Dark modern charcoal navy gradient with subtle metal sheen, premium mood, square crop, no text" },
  { id: "neon", prompt: "Cyber neon magenta cyan glow on deep purple, futuristic, square crop, no text" },
  { id: "studio", prompt: "Minimal empty white photography studio backdrop soft shadow, clean product set, square crop, no text" },
  { id: "nature", prompt: "Sunny outdoor nature bokeh green hills blue sky, photographic, square crop, no text" },
  { id: "room", prompt: "Modern indoor room corner soft daylight window, lifestyle photo, square crop, no text" },
  { id: "abstract", prompt: "Creamy abstract bokeh circles pastel lights, shallow depth of field, square crop, no text" },
  { id: "front", prompt: "Straight-on balanced product portrait framing on soft gray, photo, square crop, no text" },
  { id: "closeup", prompt: "Extreme close-up macro texture detail sharp focus, photographic, square crop, no text" },
  { id: "isometric", prompt: "Cute isometric 3D clay render of a simple cube room, soft light, square crop, no text" },
  { id: "cinematic", prompt: "Wide cinematic still anamorphic bokeh dramatic light, film look, square crop, no text" },
  { id: "photorealistic", prompt: "Ultra-realistic photo sample of a simple ceramic vase on table, natural light, square crop, no text" },
  { id: "3d", prompt: "Glossy 3D rendered purple sphere with soft studio reflections, square crop, no text" },
  { id: "flat", prompt: "Flat vector art geometric shapes orange circle on cream, clean graphic, square crop, no text" },
  { id: "painting", prompt: "Expressive oil painting brush strokes warm abstract landscape, square crop, no text" },
  { id: "mood_premium", prompt: "Quiet luxury brand moodboard dark matte with thin gold accent light, abstract, square crop, no text no logo" },
  { id: "mood_energy", prompt: "High-energy graphic poster mood bold red black contrast abstract shapes, square crop, no text no logo" },
  { id: "mood_graphic", prompt: "Modern bold geometric split composition red and black halves, graphic design sample, square crop, no text no logo" },
  { id: "mood_drama", prompt: "Dramatic high-contrast lighting abstract stage haze dark red rim light, square crop, no text no logo" },
  { id: "mood_minimal", prompt: "Clean airy minimal layout lots of white space soft gray shapes, square crop, no text no logo" },
  { id: "struct_flat", prompt: "Solid flat color background panel single hue matte, design sample, square crop, no text" },
  { id: "struct_split", prompt: "Vertical split background two contrasting solid colors, design sample, square crop, no text" },
  { id: "struct_gradient", prompt: "Smooth vertical gradient from dark to saturated red, design sample, square crop, no text" },
  { id: "struct_frame", prompt: "Simple solid color field with thin inner frame border, design sample, square crop, no text" },
  { id: "sig_corner", prompt: "Abstract signature arc segment tucked in one corner on dark field, gold line, square crop, no text no logo" },
  { id: "sig_frame", prompt: "Thick circular ring framing empty center on dark field, gold accent, square crop, no text no logo" },
  { id: "sig_stroke", prompt: "Single elegant calligraphic stroke curve across dark field, gold line, square crop, no text no logo" },
  { id: "sig_bold", prompt: "Bold heavy circular ring graphic mark centered on dark field, gold, square crop, no text no logo" },
  { id: "density_centered", prompt: "Centered balanced poster composition soft shapes in middle, design sample, square crop, no text" },
  { id: "density_left", prompt: "Left-aligned modern layout with generous right margin empty, design sample, square crop, no text" },
  { id: "density_dense", prompt: "Dense packed graphic blocks filling frame information-rich look, design sample, square crop, no text" },
  { id: "density_airy", prompt: "Very airy sparse layout large empty margins calm, design sample, square crop, no text" },
];

function parseArgs(argv) {
  const only = argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  return {
    only: only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null,
    missing: argv.includes("--missing"),
  };
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function createPrediction(prompt) {
  const res = await fetch("https://api.replicate.com/v1/models/" + MODEL + "/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
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
  return res.json();
}

async function waitPrediction(prediction) {
  let current = prediction;
  for (let i = 0; i < 120; i++) {
    if (current.status === "succeeded") return current;
    if (current.status === "failed" || current.status === "canceled") {
      throw new Error(`prediction ${current.status}: ${current.error || ""}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${current.id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) throw new Error(`poll ${res.status}`);
    current = await res.json();
  }
  throw new Error("prediction timeout");
}

function firstOutputUrl(output) {
  if (typeof output === "string" && /^https?:\/\//.test(output)) return output;
  if (Array.isArray(output)) {
    const hit = output.find((item) => typeof item === "string" && /^https?:\/\//.test(item));
    if (hit) return hit;
  }
  if (output && typeof output === "object") {
    for (const value of Object.values(output)) {
      const nested = firstOutputUrl(value);
      if (nested) return nested;
    }
  }
  return null;
}

async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

async function generateOne(entry) {
  const dest = path.join(OUT_DIR, `${entry.id}.jpg`);
  console.log(`→ ${entry.id}`);
  let prediction = await createPrediction(entry.prompt);
  if (prediction.status !== "succeeded") {
    prediction = await waitPrediction(prediction);
  }
  const url = firstOutputUrl(prediction.output);
  if (!url) throw new Error(`no output url for ${entry.id}`);
  await downloadToFile(url, dest);
  console.log(`✓ ${entry.id}`);
  return entry.id;
}

async function mapPool(items, limit, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

async function writeManifest(ids) {
  const unique = [...new Set(ids)].sort();
  const lines = unique.map((id) => `  ${JSON.stringify(id)}: "/prompt-helper/thumbs/${id}.jpg",`);
  const body = `/**
 * Static map of Prompt Helper option IDs → VPS-served thumbnail URLs.
 * Regenerated by \`scripts/generate-prompt-helper-thumbs.mjs\`.
 */
export const PROMPT_HELPER_THUMB_SRCS: Readonly<Record<string, string>> = {
${lines.join("\n")}
};

export function promptHelperThumbSrc(optionId: string): string | undefined {
  return PROMPT_HELPER_THUMB_SRCS[optionId];
}
`;
  await writeFile(MANIFEST_TS, body);
  const jsonManifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    thumbs: Object.fromEntries(
      unique.map((id) => [id, { src: `/prompt-helper/thumbs/${id}.jpg` }]),
    ),
  };
  await writeFile(
    path.join(ROOT, "public/prompt-helper/manifest.json"),
    JSON.stringify(jsonManifest, null, 2) + "\n",
  );
}

async function main() {
  if (!TOKEN) {
    console.error("REPLICATE_API_TOKEN is required");
    process.exit(1);
  }
  const args = parseArgs(process.argv.slice(2));
  await mkdir(OUT_DIR, { recursive: true });

  let queue = THUMBS;
  if (args.only?.length) {
    queue = THUMBS.filter((t) => args.only.includes(t.id));
  }
  if (args.missing) {
    const filtered = [];
    for (const entry of queue) {
      if (!(await exists(path.join(OUT_DIR, `${entry.id}.jpg`)))) filtered.push(entry);
    }
    queue = filtered;
  }

  console.log(`Generating ${queue.length} thumbs with ${MODEL} (concurrency=${CONCURRENCY})`);
  if (queue.length > 0) {
    await mapPool(queue, CONCURRENCY, async (entry) => {
      try {
        return await generateOne(entry);
      } catch (error) {
        console.error(`✗ ${entry.id}:`, error instanceof Error ? error.message : error);
        return null;
      }
    });
  }

  // Manifest includes every jpg already on disk (success + prior runs).
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(OUT_DIR);
  const ids = files.filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, ""));
  await writeManifest(ids);
  console.log(`Manifest updated with ${ids.length} thumbs`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
