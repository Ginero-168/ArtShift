import { afterEach, describe, expect, it } from "vitest";
import { claimImageActionRun, releaseImageActionRun } from "@/lib/vision/imageActionRunGuard";

describe("image action in-flight guard", () => {
  const keys: string[] = [];

  afterEach(() => {
    for (const key of keys.splice(0)) releaseImageActionRun(key);
  });

  it("allows one owner for a source action at a time", () => {
    const key = "remove-bg:source-1:file-1";
    keys.push(key);

    expect(claimImageActionRun(key)).toBe(true);
    expect(claimImageActionRun(key)).toBe(false);
  });

  it("allows the next deliberate run after the current one releases", () => {
    const key = "extract:source-1:file-1";
    keys.push(key);

    expect(claimImageActionRun(key)).toBe(true);
    releaseImageActionRun(key);
    expect(claimImageActionRun(key)).toBe(true);
  });
});
