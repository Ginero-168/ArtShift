import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Remove BG local-only boundary", () => {
  it("does not expose an API upload path", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/ai/removeBg.ts"), "utf8");

    expect(source).toContain("return removeBackgroundClient");
    expect(source).not.toContain("/api/removebg");
    expect(source).not.toContain("removeBackgroundRemote");
    expect(source).not.toContain("allowRemoteFallback");
    expect(existsSync(path.join(process.cwd(), "app/api/removebg/route.ts"))).toBe(false);
  });
});
