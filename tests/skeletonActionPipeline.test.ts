import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  POSE_LANDMARKER_MODEL,
  POSE_TASKS_ESM,
  POSE_TASKS_VERSION,
  POSE_TASKS_WASM,
} from "@/lib/vision/poseLandmarker";

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

  it("lands a transparent pose PNG on the Preload card", () => {
    const body = read("components/Canvas/PropertiesPanel/PoseSkeletonRunner.tsx");
    expect(body).toContain("detectHumanPoses");
    expect(body).toContain("renderPoseSkeletonPng");
    expect(body).toContain("enqueueProcessingJob");
    expect(body).toContain('kind: "skeleton"');
    expect(body).toContain("getProcessingPreviewPlacement");
    expect(body).toContain("getProcessingPreviewBounds(element)");
    expect(body).toContain('addElement(resultImage, "pose skeleton")');
    expect(body).toContain("crop: element.crop");
    expect(body).not.toContain("/api/");
    expect(body).not.toContain("replicate");
    expect(body).not.toContain("gemini");
  });

  it("loads pinned on-device landmarks instead of a cloud vision guess", () => {
    const loader = read("lib/vision/poseLandmarker.ts");
    expect(POSE_TASKS_VERSION).toBe("1.0.1");
    expect(POSE_TASKS_ESM).toContain(`@mediapipe/tasks-vision@${POSE_TASKS_VERSION}`);
    expect(POSE_TASKS_WASM).toContain("/wasm");
    expect(POSE_LANDMARKER_MODEL).toContain("pose_landmarker_full");
    expect(loader).toContain('delegate: "GPU"');
    expect(loader).toContain('delegate: "CPU"');
    expect(loader).toContain("numPoses: MAX_SKELETON_POSES");
    expect(loader).not.toContain('@mediapipe/tasks-vision"');
    const runtimeDocs = read("docs/AI_RUNTIME.md");
    expect(runtimeDocs).toContain("### Skeleton (on-device pose)");
    expect(runtimeDocs).toContain("### Multi-Angle (cloud camera edit)");
    expect(runtimeDocs).toContain("### Layer (cloud decompose)");
    expect(runtimeDocs).toContain("### Moodboard AI (Flare low, 9 / 16 / 25)");
  });
});
