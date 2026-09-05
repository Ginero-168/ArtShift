import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isolatorSource(): string {
  return readFileSync(
    path.join(process.cwd(), "components/Canvas/PropertiesPanel/VisionObjectIsolator.tsx"),
    "utf8",
  );
}

function extractBody(source: string): string {
  const start = source.indexOf("const handleExtract = async");
  const end = source.indexOf("const isolateSingleObject");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Extract action surface", () => {
  it("exposes one action named Extract", () => {
    const source = isolatorSource();

    expect(source).toContain("const handleExtract = async");
    expect(source).toContain('processingPreviewInput(element, "extract", "Extract", url)');
    expect(source).not.toContain("Extract All");
    expect(source).not.toContain("Quick Extract");
  });

  it("keeps the remaining Extract action local and geometry-based", () => {
    const body = extractBody(isolatorSource());

    expect(body).toContain("removeBackgroundWithRuntime");
    expect(body).toContain("detectAlphaObjectBoxes");
    expect(body).toContain("extractObjectBatch");
    expect(body).not.toContain("createSam2Session");
    expect(body).not.toContain("sam2Session");
    expect(body).not.toContain("visionDetect");
    expect(body).not.toContain("groundingDinoDetect");
  });

  it("documents the single Extract action without legacy names", () => {
    const runtimeDocs = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");
    const comparisonDocs = readFileSync(
      path.join(process.cwd(), "docs/vision-model-comparison.md"),
      "utf8",
    );

    expect(runtimeDocs).toContain("`Extract` is a local-only pipeline");
    expect(runtimeDocs).not.toContain("Extract All");
    expect(runtimeDocs).not.toContain("Quick Extract");
    expect(comparisonDocs).toContain("`Extract` now runs RMBG-1.4 → alpha components");
    expect(comparisonDocs).not.toContain("Extract All");
    expect(comparisonDocs).not.toContain("Quick Extract");
  });
});
