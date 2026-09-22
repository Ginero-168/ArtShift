import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type DetectHumanPosesOptions,
  detectHumanPoses,
  POSE_DETECT_TIMEOUT_MS,
  POSE_LANDMARKER_MODEL,
  PoseModelError,
  resetPoseLandmarkerForTests,
} from "@/lib/vision/poseLandmarker";
import { POSE_SKELETON_MODEL_MESSAGE, poseSkeletonFailureMessage } from "@/lib/vision/poseSkeleton";

const image = {} as CanvasImageSource;

const POSE_ASSET_SHA256: Record<string, string> = {
  "public/mediapipe/tasks-vision/1.0.1/vision_bundle.mjs":
    "fd588910278805a9ec217dc795c36307c64854d40dd3dd02750a1f81257b697c",
  "public/mediapipe/tasks-vision/1.0.1/wasm/vision_wasm_internal.js":
    "e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73",
  "public/mediapipe/tasks-vision/1.0.1/wasm/vision_wasm_internal.wasm":
    "8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886",
  "public/mediapipe/tasks-vision/1.0.1/wasm/vision_wasm_nosimd_internal.js":
    "e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658",
  "public/mediapipe/tasks-vision/1.0.1/wasm/vision_wasm_nosimd_internal.wasm":
    "a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192",
  "public/mediapipe/models/pose_landmarker_full_float16.task":
    "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
};

afterEach(() => {
  resetPoseLandmarkerForTests();
});

function sha256(relativePath: string): string {
  const bytes = readFileSync(path.join(process.cwd(), relativePath));
  return createHash("sha256").update(bytes).digest("hex");
}

function visionModule(
  createFromOptions: (
    wasmFileset: unknown,
    options: { baseOptions: { delegate: "CPU" | "GPU" } },
  ) => Promise<{
    detect: () => { landmarks: Array<Array<{ x: number; y: number; visibility: number }>> };
  }>,
): NonNullable<DetectHumanPosesOptions["loadModule"]> extends () => Promise<infer Module>
  ? Module
  : never {
  return {
    FilesetResolver: { forVisionTasks: async () => ({}) },
    PoseLandmarker: { createFromOptions },
  };
}

describe("pose landmarker deadline", () => {
  it("serves the pinned same-origin bundle, wasm, and model", () => {
    expect(POSE_DETECT_TIMEOUT_MS).toBe(40_000);
    expect(POSE_LANDMARKER_MODEL.startsWith("https://")).toBe(false);
    for (const [relativePath, hash] of Object.entries(POSE_ASSET_SHA256)) {
      const bytes = readFileSync(path.join(process.cwd(), relativePath));
      expect(sha256(relativePath)).toBe(hash);
      if (relativePath.endsWith(".wasm")) {
        expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
      }
      if (relativePath.endsWith(".task")) {
        // MediaPipe task bundles are ZIP payloads with a 2-byte prefix.
        expect([...bytes.subarray(2, 4)]).toEqual([0x50, 0x4b]);
      }
    }
  });

  it("rejects with PoseModelError when the model load never settles", async () => {
    const started = Date.now();
    const error = await detectHumanPoses(image, {
      timeoutMs: 40,
      probeWebGL: () => true,
      loadModule: () => new Promise(() => {}),
    }).then(
      () => {
        throw new Error("expected the hung load to time out");
      },
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PoseModelError);
    expect(error).toMatchObject({ name: "PoseModelError", timedOut: true });
    expect(poseSkeletonFailureMessage(error)).toBe(POSE_SKELETON_MODEL_MESSAGE);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("lets the next click use CPU after a timeout instead of reusing the hung load", async () => {
    await expect(
      detectHumanPoses(image, {
        timeoutMs: 30,
        probeWebGL: () => true,
        loadModule: () => new Promise(() => {}),
      }),
    ).rejects.toMatchObject({ name: "PoseModelError", timedOut: true });

    const delegates: Array<"CPU" | "GPU"> = [];
    const poses = await detectHumanPoses(image, {
      timeoutMs: 500,
      probeWebGL: () => true,
      loadModule: async () =>
        visionModule(async (_wasm, options) => {
          delegates.push(options.baseOptions.delegate);
          return {
            detect: () => ({ landmarks: [[{ x: 0.2, y: 0.3, visibility: 1 }]] }),
          };
        }),
    });
    expect(delegates).toEqual(["CPU"]);
    expect(poses).toEqual([{ landmarks: [{ x: 0.2, y: 0.3, visibility: 1 }] }]);
  });

  it("falls back to CPU when GPU setup throws", async () => {
    const delegates: Array<"CPU" | "GPU"> = [];
    const poses = await detectHumanPoses(image, {
      timeoutMs: 500,
      probeWebGL: () => true,
      loadModule: async () =>
        visionModule(async (_wasm, options) => {
          delegates.push(options.baseOptions.delegate);
          if (options.baseOptions.delegate === "GPU") {
            throw new Error("GPU delegate failed");
          }
          return { detect: () => ({ landmarks: [[{ x: 0.4, y: 0.6, visibility: 1 }]] }) };
        }),
    });
    expect(delegates).toEqual(["GPU", "CPU"]);
    expect(poses[0]?.landmarks[0]).toMatchObject({ x: 0.4, y: 0.6 });
  });

  it("rejects with AbortError when the processing signal aborts", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const pending = detectHumanPoses(image, {
      timeoutMs: 5_000,
      signal: controller.signal,
      probeWebGL: () => true,
      loadModule: () => new Promise(() => {}),
    });
    setTimeout(() => controller.abort(), 15);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("does not start a load when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let started = false;
    await expect(
      detectHumanPoses(image, {
        signal: controller.signal,
        probeWebGL: () => true,
        loadModule: () => {
          started = true;
          return new Promise(() => {});
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toBe(false);
  });
});
