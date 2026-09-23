import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Skeleton action surface", () => {
  it("keeps Extract, Layer, and Multi-Angle without a Skeleton button", () => {
    const bar = read("components/Canvas/ObjectContextBar.tsx");
    expect(bar).not.toContain("SKELETON_LABEL");
    expect(bar).not.toContain("toggleSkeleton");
    expect(bar).not.toContain("PoseSkeletonRunner");
    expect(bar).not.toContain('activeImageTool === "skeleton"');
    expect(bar).toContain("LAYER_LABEL");
    expect(bar).toContain("EXTRACT_LABEL");
    expect(bar).toContain("MULTI_ANGLE_LABEL");
    expect(bar.indexOf("MULTI_ANGLE_LABEL, toggleMultiAngle")).toBeLessThan(
      bar.indexOf("action(VECTORIZE_GROUP_LABEL"),
    );
    expect(bar).toContain("VisionObjectIsolator");
  });

  it("does not mount a pose runner or advertise Skeleton in the product docs", () => {
    expect(() => read("components/Canvas/PropertiesPanel/PoseSkeletonRunner.tsx")).toThrow();
    const runtimeDocs = read("docs/AI_RUNTIME.md");
    expect(runtimeDocs).not.toContain("### Skeleton (cloud pose)");
    expect(runtimeDocs).not.toContain("Skeleton");
    expect(runtimeDocs).toContain("### Multi-Angle (cloud camera edit)");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
    expect(runtimeDocs).toContain("### Moodboard AI (Flare low, 9 / 16 / 25)");
    expect(runtimeDocs).not.toContain("public/mediapipe");
  });

  it("leaves the unused cloud pose route on Replicate YOLO26 instead of MediaPipe", () => {
    const route = read("app/api/skeleton/route.ts");
    const adapter = read("lib/server/ai/adapters/replicateAdapter.ts");
    const manifest = read("lib/server/ai/modelManifest.ts");
    expect(route).toContain("requireEndUserCloudAi");
    expect(route).toContain('modelAlias: "yolo26-pose"');
    expect(route).toContain("allowFallback: false");
    expect(adapter).toContain("ultralytics/yolo26-pose");
    expect(adapter).toContain("return_json: true");
    expect(adapter).toContain("model_size: modelSize");
    expect(manifest).toContain("0da88062bf83caea8e8d2456ae5290a8efab06420bc58cd1ebb9ec2324353aa8");
    expect(read("lib/vision/poseSkeleton.ts")).toContain("COCO-17");
    expect(route).not.toContain("mediapipe");
    expect(adapter).not.toContain("mediapipe");
  });
});
