import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hasVisibleAlpha } from "@/lib/vectorize/vtracerRuntime";

describe("VTracer backend wiring", () => {
  it("keeps the VTracer runtime as a browser-only public asset", () => {
    const root = process.cwd();
    const runtimeSource = readFileSync(path.join(root, "lib/vectorize/vtracerRuntime.ts"), "utf8");
    const workerSource = readFileSync(
      path.join(root, "lib/vectorize/vectorizer.worker.ts"),
      "utf8",
    );

    expect(runtimeSource).toContain('"/wasm/vtracer/vtracer_browser.js"');
    expect(runtimeSource).toContain('"/wasm/vtracer/vtracer_browser_bg.wasm"');
    expect(runtimeSource).toContain("webpackIgnore");
    expect(workerSource).toContain('options?.backend === "vtracer-wasm"');
    expect(runtimeSource).not.toContain("@visioncortex/vtracer");
  });

  it("ships the generated ESM glue and wasm binary", () => {
    const root = process.cwd();
    const jsPath = path.join(root, "public/wasm/vtracer/vtracer_browser.js");
    const wasmPath = path.join(root, "public/wasm/vtracer/vtracer_browser_bg.wasm");
    const glue = readFileSync(jsPath, "utf8");
    const wasm = readFileSync(wasmPath);

    expect(glue).toContain("__wbg_init as default");
    expect(glue).toContain("vectorize_rgba");
    expect(wasm.subarray(0, 4)).toEqual(Buffer.from([0, 97, 115, 109]));
    expect(wasm.byteLength).toBeGreaterThan(100_000);
  });

  it("recognizes an entirely transparent raster before invoking VTracer", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 0, 0]);
    expect(hasVisibleAlpha(pixels)).toBe(false);
    expect(hasVisibleAlpha(new Uint8ClampedArray([255, 0, 0, 1]))).toBe(true);
  });
});
