import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Florence browser execution boundary", () => {
  it("keeps Transformers.js model loading and generation off the UI thread", () => {
    const root = process.cwd();
    const engineSource = readFileSync(path.join(root, "lib/vision/visionEngine.ts"), "utf8");
    const workerPath = path.join(root, "lib/vision/vision.worker.ts");

    expect(existsSync(workerPath)).toBe(true);
    if (!existsSync(workerPath)) return;

    const workerSource = readFileSync(workerPath, "utf8");
    expect(engineSource).not.toContain("@huggingface/transformers");
    expect(engineSource).toContain("executeVisionTaskInWorker");
    expect(workerSource).toContain("transformers-florence-v3");
    expect(workerSource).toContain("model.generate");
  });
});
