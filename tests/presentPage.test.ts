import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("present page wiring", () => {
  it("loads from projectStore instead of the disconnected legacy engine persist", () => {
    const source = readFileSync("app/present/page.tsx", "utf8");
    expect(source).toContain("loadPresentDocument");
    expect(source).toContain("projectStore");
    expect(source).toContain("getImageCache");
    expect(source).toContain("getExportableSlides");
    expect(source).toContain("showFrames: true");
    expect(source).toContain("useEditorOverscrollLock");
    expect(source).not.toContain("loadEngine()");
  });
});
