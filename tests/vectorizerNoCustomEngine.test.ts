import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("removed Vectorize1 engine", () => {
  it("removes the legacy Custom Auto-Trace implementation module", () => {
    expect(existsSync(path.join(root, "lib/vectorize/vectorizer-core.ts"))).toBe(false);
  });

  it("does not retain a Custom fallback in the public vectorizer path", () => {
    const vectorizer = read("lib/vectorize/vectorizer.ts");
    const worker = read("lib/vectorize/vectorizer.worker.ts");
    const backend = read("lib/vectorize/vectorizerBackend.ts");

    expect(vectorizer).not.toContain("getVectorizeFallbackOptions");
    expect(vectorizer).not.toContain('backend ?? "custom"');
    expect(worker).not.toContain("vectorizeImageData");
    expect(backend).not.toContain('value: "custom"');
    expect(backend).not.toContain('backend === "custom"');
    expect(backend).not.toContain("getVectorizeFallbackOptions");
  });
});
