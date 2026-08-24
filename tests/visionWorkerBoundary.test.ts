import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

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

  it("resolves Florence to the browser runtime during client builds", () => {
    const config = nextConfig("phase-production-build");
    expect(config.serverExternalPackages).not.toContain("transformers-florence-v3");
    const runtimeConfig = {
      resolve: { alias: {} as Record<string, string> },
      plugins: [] as unknown[],
    };
    class IgnorePlugin {}

    const resolved = config.webpack?.(
      runtimeConfig as never,
      {
        isServer: false,
        webpack: { IgnorePlugin },
      } as never,
    ) as typeof runtimeConfig;

    expect(resolved.resolve.alias["transformers-florence-v3$"]).toMatch(/transformers\.web\.js$/);
  });

  it("keeps the server-side worker compilation on the browser runtime too", () => {
    const config = nextConfig("phase-production-build");
    const runtimeConfig = {
      resolve: { alias: {} as Record<string, string> },
      plugins: [] as unknown[],
    };

    const resolved = config.webpack?.(
      runtimeConfig as never,
      {
        isServer: true,
        webpack: { IgnorePlugin: class IgnorePlugin {} },
      } as never,
    ) as typeof runtimeConfig;

    expect(resolved.resolve.alias["transformers-florence-v3$"]).toMatch(/transformers\.web\.js$/);
  });

  it("externalizes the native ONNX runtime in server compilation", () => {
    const config = nextConfig("phase-production-build");
    const runtimeConfig = {
      resolve: { alias: {} as Record<string, string> },
      plugins: [] as unknown[],
      externals: [] as unknown[],
    };

    const resolved = config.webpack?.(
      runtimeConfig as never,
      { isServer: true, webpack: { IgnorePlugin: class IgnorePlugin {} } } as never,
    ) as typeof runtimeConfig;

    expect(resolved.externals).toContainEqual({
      "onnxruntime-node": "commonjs onnxruntime-node",
    });
  });
});
