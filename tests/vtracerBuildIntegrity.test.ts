import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("VTracer build integrity", () => {
  it("checks the committed runtime as part of the production build", () => {
    const root = process.cwd();
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.["verify:vtracer-wasm"]).toBeDefined();
    expect(packageJson.scripts?.build).toContain("verify:vtracer-wasm");
  });

  it("pins wasm-pack and stages generated runtime files before replacement", () => {
    const root = process.cwd();
    const source = readFileSync(path.join(root, "scripts/build-vtracer-wasm.mjs"), "utf8");
    expect(source).toContain("REQUIRED_WASM_PACK_VERSION");
    expect(source).toContain("mkdtempSync");
    expect(source).toContain("renameSync");
    expect(source).toContain("vtracer_browser_bg.wasm");
  });
});
