import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("privacy page", () => {
  it("publishes a real Thai-primary policy at /privacy", () => {
    const source = readFileSync("app/privacy/page.tsx", "utf8");
    expect(source).toContain("นโยบายความเป็นส่วนตัว");
    expect(source).toContain("Privacy Policy");
    expect(source).toContain("September 19, 2026");
    expect(source).toContain("Pinterest");
    expect(source).toContain("support@artshift.io");
    expect(source).toContain("local-first");
    expect(source).toContain("IndexedDB");
  });

  it("is linked from the public home page footer", () => {
    const source = readFileSync("app/page.tsx", "utf8");
    expect(source).toContain('href="/privacy"');
  });
});
