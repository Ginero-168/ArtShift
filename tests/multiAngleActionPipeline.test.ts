import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function panelSource(): string {
  return readFileSync(
    path.join(process.cwd(), "components/Canvas/PropertiesPanel/MultiAnglePanel.tsx"),
    "utf8",
  );
}

describe("Multi-Angle action surface", () => {
  it("adds a Multi-Angle button beside Layer without removing Extract or Layer", () => {
    const bar = readFileSync(
      path.join(process.cwd(), "components/Canvas/ObjectContextBar.tsx"),
      "utf8",
    );
    expect(bar).toContain("MULTI_ANGLE_LABEL");
    expect(bar).toContain("LAYER_LABEL");
    expect(bar).toContain("EXTRACT_LABEL");
    expect(bar).toContain("<MultiAnglePanel");
    expect(bar.indexOf("LAYER_LABEL")).toBeLessThan(bar.indexOf("MULTI_ANGLE_LABEL"));
  });

  it("runs through the consented Replicate route and lands on the Preload card", () => {
    const body = panelSource();
    expect(body).toContain("<MultiAnglePreview camera={camera} onCameraChange={updateCamera} />");
    expect(body).toContain(
      "onChange={(value) => updateCamera({ ...camera, rotateDegrees: value })}",
    );
    expect(body).toContain("moveForward: DEFAULT_MULTI_ANGLE_CAMERA.moveForward");
    expect(body).toContain("verticalTilt: settings.verticalTilt");
    expect(body).toContain("useWideAngle: settings.useWideAngle");
    expect(body).toContain("goFast: DEFAULT_MULTI_ANGLE_GO_FAST");
    expect(body).toContain("outputFormat: DEFAULT_MULTI_ANGLE_OUTPUT_FORMAT");
    expect(body).not.toContain("Move forward");
    expect(body).not.toContain("Inference steps");
    expect(body).not.toContain("Lightning");
    expect(body).not.toContain('aria-label="Prompt"');
    expect(body).toContain("onCameraChange={updateCamera}");
    expect(body).toContain("/api/multi-angle");
    expect(body).toContain("image.multiAngle");
    expect(body).toContain("cloudConsent: true");
    expect(body).toContain("loraScale");
    expect(body).toContain("loraWeights");
    expect(body).toContain("trueGuidanceScale");
    expect(body).not.toContain("useMultipleAngles");
    expect(body).not.toContain("multipleAnglesStrength");
    expect(body).toContain("qwen-edit-multiangle");
    expect(body).toContain("enqueueProcessingJob");
    expect(body).toContain('kind: "multi-angle"');
    expect(body).toContain("getProcessingPreviewPlacement");
    expect(body).toContain("getProcessingPreviewBounds(element)");
    expect(body).toContain('addElement(resultImage, "multi-angle camera edit")');
    expect(body).not.toContain("x: element.x");
    expect(body).not.toContain("y: element.y");
  });

  it("documents Multi-Angle as its own cloud path", () => {
    const runtimeDocs = readFileSync(path.join(process.cwd(), "docs/AI_RUNTIME.md"), "utf8");
    expect(runtimeDocs).toContain("### Multi-Angle (cloud camera edit)");
    expect(runtimeDocs).toContain("qwen/qwen-edit-multiangle");
    expect(runtimeDocs).toContain("requireEndUserCloudAi");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
  });
});
