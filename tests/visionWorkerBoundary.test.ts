import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Florence browser execution boundary", () => {
  it("keeps Transformers.js model loading and generation off the UI thread", () => {
    const root = process.cwd();
    const engineSource = readFileSync(path.join(root, "lib/vision/visionEngine.ts"), "utf8");
    const workerPath = path.join(root, "lib/vision/vision.worker.ts");
    const browserRuntimePath = path.join(root, "lib/vision/florenceBrowserRuntime.js");

    expect(existsSync(workerPath)).toBe(true);
    expect(existsSync(browserRuntimePath)).toBe(true);
    if (!existsSync(workerPath)) return;

    const workerSource = readFileSync(workerPath, "utf8");
    const browserRuntimeSource = existsSync(browserRuntimePath)
      ? readFileSync(browserRuntimePath, "utf8")
      : "";
    expect(engineSource).not.toContain("@huggingface/transformers");
    expect(engineSource).toContain("executeVisionTaskInWorker");
    expect(workerSource).toContain("./florenceBrowserRuntime.js");
    expect(workerSource).not.toMatch(/from ["']transformers-florence-v3["']/);
    expect(browserRuntimeSource).toContain(
      "../../node_modules/transformers-florence-v3/dist/transformers.web.js",
    );
    expect(workerSource).toContain("model.generate");
  });

  it("keeps Florence out of Next server package externals", () => {
    const config = nextConfig("phase-production-build");
    expect(config.serverExternalPackages).not.toContain("transformers-florence-v3");
    expect(config.serverExternalPackages).not.toContain("onnxruntime-node");
  });
});
