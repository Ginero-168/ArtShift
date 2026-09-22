/**
 * Client-side human pose landmarks.
 *
 * MediaPipe Pose Landmarker (BlazePose, 33 2D landmarks) runs in the browser.
 * The JS and WASM stay on jsDelivr and the float16 full model stays on Google's
 * model host, both version-pinned. They are loaded on the first Skeleton click
 * instead of being added as an npm dependency: `@mediapipe/tasks-vision` unpacks
 * to about 20MB of WASM and would be pulled into the Next bundle.
 *
 * No API key and no cloud vision call. GPU is tried first; CPU is the fallback.
 */

import { MAX_SKELETON_POSES, MIN_LANDMARK_SCORE, type NormalizedPose } from "./poseSkeleton";

export const POSE_TASKS_VERSION = "1.0.1";
export const POSE_TASKS_ESM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${POSE_TASKS_VERSION}/+esm`;
export const POSE_TASKS_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${POSE_TASKS_VERSION}/wasm`;
export const POSE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";

export class PoseModelError extends Error {
  constructor(cause?: unknown) {
    const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
    super(`Skeleton model could not be loaded.${detail}`.trim());
    this.name = "PoseModelError";
  }
}

type PoseVisionModule = {
  FilesetResolver: {
    forVisionTasks(basePath: string): Promise<unknown>;
  };
  PoseLandmarker: {
    createFromOptions(
      wasmFileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string; delegate: "CPU" | "GPU" };
        runningMode: "IMAGE";
        numPoses: number;
        minPoseDetectionConfidence: number;
        minPosePresenceConfidence: number;
        minTrackingConfidence: number;
        canvas?: HTMLCanvasElement | OffscreenCanvas;
      },
    ): Promise<PoseLandmarkerSession>;
  };
};

type PoseLandmarkerSession = {
  detect(image: CanvasImageSource): {
    landmarks?: Array<Array<{ x: number; y: number; visibility?: number; presence?: number }>>;
  };
};

let sessionPromise: Promise<PoseLandmarkerSession> | null = null;

export async function detectHumanPoses(image: CanvasImageSource): Promise<NormalizedPose[]> {
  if (typeof window === "undefined") {
    throw new PoseModelError(new Error("Pose landmarks run in the browser only."));
  }
  let session: PoseLandmarkerSession;
  try {
    session = await getPoseSession();
  } catch (error) {
    if (error instanceof PoseModelError) throw error;
    throw new PoseModelError(error);
  }
  let result: ReturnType<PoseLandmarkerSession["detect"]>;
  try {
    result = session.detect(image);
  } catch (error) {
    throw new PoseModelError(error);
  }
  return (result.landmarks ?? []).map((landmarks) => ({ landmarks }));
}

async function getPoseSession(): Promise<PoseLandmarkerSession> {
  if (!sessionPromise) {
    sessionPromise = openPoseSession().catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

async function openPoseSession(): Promise<PoseLandmarkerSession> {
  let vision: PoseVisionModule;
  try {
    vision = await loadPoseVisionModule();
  } catch (error) {
    throw new PoseModelError(error);
  }
  const fileset = await vision.FilesetResolver.forVisionTasks(POSE_TASKS_WASM);
  const shared = {
    runningMode: "IMAGE" as const,
    numPoses: MAX_SKELETON_POSES,
    minPoseDetectionConfidence: MIN_LANDMARK_SCORE,
    minPosePresenceConfidence: MIN_LANDMARK_SCORE,
    minTrackingConfidence: MIN_LANDMARK_SCORE,
  };
  try {
    return await vision.PoseLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL, delegate: "GPU" },
      canvas: createPoseCanvas(),
    });
  } catch {
    return vision.PoseLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL, delegate: "CPU" },
    });
  }
}

function createPoseCanvas(): HTMLCanvasElement | OffscreenCanvas | undefined {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas;
  }
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(1, 1);
  return undefined;
}

async function loadPoseVisionModule(): Promise<PoseVisionModule> {
  // Import through a runtime specifier so Next does not bundle the WASM package.
  // The URL is the pinned constant above, not user input.
  const load = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<PoseVisionModule>;
  const loaded = await load(POSE_TASKS_ESM);
  if (
    typeof loaded.FilesetResolver?.forVisionTasks !== "function" ||
    typeof loaded.PoseLandmarker?.createFromOptions !== "function"
  ) {
    throw new PoseModelError(new Error("Pose Landmarker module was missing."));
  }
  return loaded;
}
