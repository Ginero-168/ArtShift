import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Skeleton action surface", () => {
  it("adds a Skeleton button after Multi-Angle without removing Extract or Layer", () => {
    const bar = read("components/Canvas/ObjectContextBar.tsx");
    expect(bar).toContain("SKELETON_LABEL");
    expect(bar).toContain("LAYER_LABEL");
    expect(bar).toContain("EXTRACT_LABEL");
    expect(bar).toContain("<PoseSkeletonRunner");
    expect(bar.indexOf("MULTI_ANGLE_LABEL, toggleMultiAngle")).toBeLessThan(
      bar.indexOf("SKELETON_LABEL, toggleSkeleton"),
    );
    const skeletonRunner = bar.indexOf('activeImageTool === "skeleton" ?');
    const removeBgRunner = bar.indexOf('activeImageTool === "remove-bg" ||');
    expect(skeletonRunner).toBeGreaterThan(0);
    expect(skeletonRunner).toBeLessThan(removeBgRunner);
    const skeletonBranch = bar.slice(skeletonRunner, removeBgRunner);
    expect(skeletonBranch).toContain("<PoseSkeletonRunner");
    expect(skeletonBranch).not.toContain("VisionObjectIsolator");
  });

  it("lands a transparent pose PNG on the Preload card from the cloud job", () => {
    const body = read("components/Canvas/PropertiesPanel/PoseSkeletonRunner.tsx");
    const client = read("lib/vision/poseSkeletonClient.ts");
    expect(body).toContain("requestPoseSkeleton");
    expect(client).toContain('"/api/skeleton"');
    expect(client).toContain('task: "image.poseSkeleton"');
    expect(client).toContain('action: "status"');
    expect(body).toContain("renderPoseSkeletonPng");
    expect(body).toContain("enqueueProcessingJob");
    expect(body).toContain('kind: "skeleton"');
    expect(body).toContain("getProcessingPreviewPlacement");
    expect(body).toContain("getProcessingPreviewBounds(element)");
    expect(body).toContain('addElement(resultImage, "pose skeleton")');
    expect(body).toContain("crop: element.crop");
    expect(client).toContain("cloudConsent: true");
    expect(body).not.toContain("detectHumanPoses");
    expect(body).not.toContain("poseLandmarker");
    expect(body).not.toContain("mediapipe");
    expect(body).not.toContain("gemini");
  });

  it("uses pinned Replicate YOLO26 pose instead of an on-device landmarker", () => {
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
    const runtimeDocs = read("docs/AI_RUNTIME.md");
    expect(runtimeDocs).toContain("### Skeleton (cloud pose)");
    expect(runtimeDocs).toContain("### Multi-Angle (cloud camera edit)");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
    expect(runtimeDocs).toContain("### Moodboard AI (Flare low, 9 / 16 / 25)");
    expect(runtimeDocs).not.toContain("public/mediapipe");
  });
});
