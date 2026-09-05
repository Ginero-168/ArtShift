import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isolatorSource(): string {
  return readFileSync(
    path.join(process.cwd(), "components/Canvas/PropertiesPanel/VisionObjectIsolator.tsx"),
    "utf8",
  );
}

function extractAllBody(source: string): string {
  const start = source.indexOf("const handleExtractAll = async");
  const end = source.indexOf("const handleExtractGeometry = async");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Extract All local pipeline", () => {
  it("keeps alpha geometry and SAM 2 refinement as the extraction path", () => {
    const body = extractAllBody(isolatorSource());

    expect(body).toContain("removeBackgroundWithRuntime");
    expect(body).toContain("detectAlphaObjectBoxes");
    expect(body).toContain("labelAlphaComponents");
    expect(body).toContain("createSam2Session");
    expect(body).toContain("extractObjectBatch");
  });

  it("does not run Florence-2 or Grounding DINO detectors while extracting", () => {
    const body = extractAllBody(isolatorSource());

    for (const detector of [
      "visionDetect",
      "visionDenseDetect",
      "groundingDinoDetect",
      "shouldRunVisionRecall",
      "mergeVisionDetections",
      "mergeVisionWithAlphaComponents",
    ]) {
      expect(body).not.toContain(detector);
    }
  });

  it("does not import the removed Extract detectors into the isolator", () => {
    const source = isolatorSource();

    for (const detector of [
      "groundingDinoDetect",
      "visionDenseDetect",
      "shouldRunVisionRecall",
      "mergeVisionDetections",
      "mergeVisionWithAlphaComponents",
    ]) {
      expect(source).not.toContain(detector);
    }
  });

  it("offers the VPS fallback only for background removal", () => {
    const source = isolatorSource();
    const label = source.slice(source.indexOf("Allow VPS fallback"));

    expect(label).toContain("Remove BG");
    expect(source).not.toContain("Florence-2 ใช้งานไม่ได้");
  });

  it("documents that Extract has no detector fallback", () => {
    const docs = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");

    expect(docs).toContain("There is no server\nfallback for Florence-2 or any detector.");
    expect(docs).toContain("No vision-language\ndetector runs during extraction.");
  });
});
