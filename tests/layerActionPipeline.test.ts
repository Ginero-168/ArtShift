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
  const end = source.indexOf("const analysisMessage");
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
    expect(bar).toContain('"layer-panel"');
    expect(bar).not.toContain('"layer-runner"');
  });

  it("opens a compact layer-count control instead of auto-running Layer", () => {
    const source = isolatorSource();
    const settings = readFileSync(
      path.join(process.cwd(), "components/Canvas/PropertiesPanel/LayerCountSettings.tsx"),
      "utf8",
    );
    const bar = readFileSync(
      path.join(process.cwd(), "components/Canvas/ObjectContextBar.tsx"),
      "utf8",
    );
    const autoRunBranch = bar.slice(
      bar.indexOf('activeImageTool === "remove-bg" || activeImageTool === "extract"'),
      bar.indexOf('role="dialog"'),
    );

    expect(autoRunBranch).not.toContain('"layer"');
    expect(bar).toContain('data-testid={activeImageTool === "layer" ? "layer-panel"');
    expect(source).toContain("<LayerCountSettings");
    expect(source).toContain("onRun={(count) => void handleLayer(undefined, count)}");
    expect(settings).toContain('aria-label="Number of layers"');
    expect(settings).toContain('aria-label="Decrease layer count"');
    expect(settings).toContain('aria-label="Increase layer count"');
    expect(settings).toContain('aria-label="Run Layer"');
    expect(settings).toContain("resolveDecomposeLayerCount");
    expect(settings).toContain("DEFAULT_DECOMPOSE_LAYERS");
    expect(settings).toContain("DECOMPOSE_LAYERS_MIN");
    expect(settings).toContain("DECOMPOSE_LAYERS_MAX");
  });

  it("keeps Layer as a consented Replicate cloud path", () => {
    const body = layerBody(isolatorSource());

    expect(body).toContain("/api/layer/decompose");
    expect(body).toContain("image.decomposeLayers");
    expect(body).toContain("cloudConsent: true");
    expect(body).toContain("qwen-image-layered");
    expect(body).toContain("requestedLayers");
    expect(body).toContain("DECOMPOSE_LAYERS_MIN");
    expect(body).toContain("DECOMPOSE_LAYERS_MAX");
    expect(body).toContain("numLayers,");
    expect(body).toMatch(/แยกเป็น \$\{numLayers\} เลเยอร์/);
    expect(body).not.toContain("numLayers: DEFAULT_DECOMPOSE_LAYERS");
    expect(body).toContain("preloadLayerSource");
    expect(body).toContain('report("preload"');
    expect(body).toContain('addElements(newElements, "decompose image layers")');
    expect(body).toContain("getProcessingPreviewPlacement");
    expect(body).toContain("getProcessingPreviewBounds(element)");
    expect(body).not.toContain("x: element.x");
    expect(body).not.toContain("y: element.y");
    expect(body).not.toContain("removeBackgroundWithRuntime");
  });

  it("places Layer outputs at the Preload card instead of covering the source", () => {
    const body = layerBody(isolatorSource());
    const placementIndex = body.indexOf("getProcessingPreviewPlacement");
    const addIndex = body.indexOf('addElements(newElements, "decompose image layers")');
    expect(placementIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeGreaterThan(placementIndex);
    expect(body).toContain("...layerBounds");
  });

  it("warms the Layer source when the Layer tool becomes active", () => {
    const source = isolatorSource();
    expect(source).toContain('if (activeTool !== "layer") return;');
    expect(source).toContain("void preloadLayerSource(element.fileId)");
  });

  it("documents Layer as the cloud decompose path while Extract stays local", () => {
    const runtimeDocs = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");

    expect(runtimeDocs).toContain("`Extract` is a local-only pipeline");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
    expect(runtimeDocs).toContain("qwen/qwen-image-layered");
    expect(runtimeDocs).toContain("requireEndUserCloudAi");
  });
});
