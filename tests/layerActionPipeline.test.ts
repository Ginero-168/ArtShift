import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function isolatorSource(): string {
  return readFileSync(
    path.join(process.cwd(), "components/Canvas/PropertiesPanel/VisionObjectIsolator.tsx"),
    "utf8",
  );
}

function layerBody(source: string): string {
  const start = source.indexOf("const handleLayer = async");
  const end = source.indexOf("layerHandlerRef.current = handleLayer");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Layer action surface", () => {
  it("exposes a Layer action beside Extract without renaming Extract", () => {
    const source = isolatorSource();
    const bar = readFileSync(
      path.join(process.cwd(), "components/Canvas/ObjectContextBar.tsx"),
      "utf8",
    );

    expect(source).toContain("const handleLayer = async");
    expect(source).toContain('processingPreviewInput(element, "layer", LAYER_LABEL');
    expect(source).toContain("const handleExtract = async");
    expect(source).toContain('processingPreviewInput(element, "extract", "Extract", url)');
    expect(bar).toContain("LAYER_LABEL");
    expect(bar).toContain("EXTRACT_LABEL");
    expect(bar).toContain('"layer-runner"');
  });

  it("keeps Layer as a consented Replicate cloud path", () => {
    const body = layerBody(isolatorSource());

    expect(body).toContain("/api/layer/decompose");
    expect(body).toContain("image.decomposeLayers");
    expect(body).toContain("cloudConsent: true");
    expect(body).toContain("qwen-image-layered");
    expect(body).toContain("DEFAULT_DECOMPOSE_LAYERS");
    expect(body).toContain("preloadDataURL");
    expect(body).toContain('report("preload"');
    expect(body).toContain("addElements(newElements, \"decompose image layers\")");
    expect(body).toContain("x: element.x");
    expect(body).toContain("y: element.y");
    expect(body).not.toContain("removeBackgroundWithRuntime");
  });

  it("warms preloadDataURL when the Layer tool becomes active", () => {
    const source = isolatorSource();
    expect(source).toContain('if (activeTool !== "layer") return;');
    expect(source).toContain("void preloadDataURL(cached.dataURL)");
  });

  it("documents Layer as the cloud decompose path while Extract stays local", () => {
    const runtimeDocs = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");

    expect(runtimeDocs).toContain("`Extract` is a local-only pipeline");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
    expect(runtimeDocs).toContain("qwen/qwen-image-layered");
    expect(runtimeDocs).toContain("requireEndUserCloudAi");
  });
});
