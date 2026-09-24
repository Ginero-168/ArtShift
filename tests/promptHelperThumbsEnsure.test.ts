import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInventedPromptHelperThumbPrompt,
  promptHelperThumbPrompt,
} from "@/lib/ai/orchestration/promptHelperThumbPrompts";
import { ensurePromptHelperThumbs } from "@/lib/ai/orchestration/promptHelperThumbsEnsure";

type FetchCall = { url: string; body?: { input?: { prompt?: string; quality?: string } } };

describe("ensurePromptHelperThumbs", () => {
  let root = "";
  let fetchCalls: FetchCall[] = [];

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "artshift-thumbs-"));
    process.env.PROMPT_HELPER_THUMB_DIR = path.join(root, "thumbs");
    fetchCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const href = String(url);
        const body = init?.body ? (JSON.parse(String(init.body)) as FetchCall["body"]) : undefined;
        fetchCalls.push({ url: href, body });
        if (href.includes("api.replicate.com/v1/models")) {
          return new Response(
            JSON.stringify({
              id: "pred_test",
              status: "succeeded",
              output: "https://cdn.example.test/out.jpg",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (href.includes("cdn.example.test")) {
          return new Response(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), { status: 200 });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );
  });

  afterEach(async () => {
    delete process.env.PROMPT_HELPER_THUMB_DIR;
    vi.unstubAllGlobals();
    if (root) await rm(root, { recursive: true, force: true });
  });

  function predictionPrompts(): string[] {
    return fetchCalls
      .filter((call) => call.url.includes("/predictions"))
      .map((call) => call.body?.input?.prompt || "");
  }

  it("queues an invented option id using its modifier, label, and base subject", async () => {
    const wingsPrompt = buildInventedPromptHelperThumbPrompt({
      label: "ปีกค้างคาว",
      modifier: "มังกรปีกค้างคาว",
      baseSubject: "ภาพมังกร",
    });
    const speciesPrompt = buildInventedPromptHelperThumbPrompt({
      label: "ตะวันตก",
      modifier: "มังกรสายพันธุ์ตะวันตก",
      baseSubject: "ภาพมังกร",
    });
    expect(wingsPrompt).toContain("มังกรปีกค้างคาว");
    expect(wingsPrompt).toContain("ภาพมังกร");
    expect(promptHelperThumbPrompt("wings__bat")).toBeUndefined();

    const result = await ensurePromptHelperThumbs({
      optionIds: ["wings__bat", "species__western"],
      options: [
        { id: "wings__bat", label: "ปีกค้างคาว", modifier: "มังกรปีกค้างคาว" },
        { id: "species__western", label: "ตะวันตก", modifier: "มังกรสายพันธุ์ตะวันตก" },
      ],
      baseSubject: "ภาพมังกร",
      token: "r8_test",
      wait: true,
    });

    expect(result.skippedNoPrompt).toEqual([]);
    expect(result.queued).toEqual(["wings__bat", "species__western"]);
    expect(result.skippedNoToken).toBe(false);
    expect(predictionPrompts().sort()).toEqual([wingsPrompt, speciesPrompt].sort());
    for (const call of fetchCalls.filter((item) => item.url.includes("/predictions"))) {
      expect(call.body?.input?.quality).toBe("low");
      expect(call.url).toContain("openai/gpt-image-2.5-sunburst");
    }
    const cached = await readFile(path.join(root, "thumbs", "wings__bat.jpg"));
    expect(cached.byteLength).toBeGreaterThan(0);

    fetchCalls = [];
    const again = await ensurePromptHelperThumbs({
      optionIds: ["wings__bat", "species__western"],
      options: [
        { id: "wings__bat", label: "ปีกค้างคาว", modifier: "มังกรปีกค้างคาว" },
        { id: "species__western", label: "ตะวันตก", modifier: "มังกรสายพันธุ์ตะวันตก" },
      ],
      baseSubject: "ภาพมังกร",
      token: "r8_test",
      wait: true,
    });
    expect(again.existing.sort()).toEqual(["species__western", "wings__bat"]);
    expect(again.queued).toEqual([]);
    expect(predictionPrompts()).toEqual([]);
  });

  it("still queues a catalog id with its catalog prompt", async () => {
    const catalog = promptHelperThumbPrompt("flat");
    expect(catalog).toBeTruthy();

    const result = await ensurePromptHelperThumbs({
      optionIds: ["flat"],
      options: [{ id: "flat", label: "แบน", modifier: "do-not-replace-catalog-prompt" }],
      baseSubject: "ภาพมังกร",
      token: "r8_test",
      wait: true,
    });

    expect(result.queued).toEqual(["flat"]);
    expect(result.skippedNoPrompt).toEqual([]);
    expect(predictionPrompts()).toEqual([catalog]);
  });

  it("does not regenerate an id that is already cached on disk", async () => {
    const dest = path.join(root, "thumbs");
    await mkdir(dest, { recursive: true });
    await writeFile(path.join(dest, "vibrant.jpg"), Buffer.from([0xff, 0xd8, 0xff]));

    const result = await ensurePromptHelperThumbs({
      optionIds: ["vibrant", "wings__bat"],
      options: [{ id: "wings__bat", label: "ปีกค้างคาว", modifier: "มังกรปีกค้างคาว" }],
      baseSubject: "ภาพมังกร",
      token: "r8_test",
      wait: true,
    });

    expect(result.existing).toEqual(["vibrant"]);
    expect(result.queued).toEqual(["wings__bat"]);
    expect(predictionPrompts()).not.toContain(promptHelperThumbPrompt("vibrant"));
    const untouched = await readFile(path.join(dest, "vibrant.jpg"));
    expect(untouched.equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
  });

  it("skips an invented id when no modifier or label is provided", async () => {
    const result = await ensurePromptHelperThumbs({
      optionIds: ["wings__bat"],
      token: "r8_test",
      wait: true,
    });
    expect(result.queued).toEqual([]);
    expect(result.skippedNoPrompt).toEqual(["wings__bat"]);
    expect(predictionPrompts()).toEqual([]);
  });
});
