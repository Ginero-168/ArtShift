import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("automatic asset analysis boundary", () => {
  it("keeps the heavy foreground model behind an idle, dynamic import", () => {
    const root = process.cwd();
    const browserSource = readFileSync(
      path.join(root, "lib/vision/assetAnalysisBrowser.ts"),
      "utf8",
    );
    const workerPath = path.join(root, "lib/vision/assetAnalysis.worker.ts");

    expect(existsSync(workerPath)).toBe(true);
    expect(browserSource).toContain('await import("@/lib/ai/removeBg")');
    expect(browserSource).not.toContain('import { removeBackground } from "@/lib/ai/removeBg"');
    expect(readFileSync(workerPath, "utf8")).toContain("OffscreenCanvas");
  });
});
