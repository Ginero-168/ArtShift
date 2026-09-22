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
let forceCpu = false;

/** GPU when WebGL exists, otherwise CPU. CPU is always the fallback. */
export function choosePoseDelegates(webglAvailable: boolean): Array<"GPU" | "CPU"> {
  return webglAvailable ? ["GPU", "CPU"] : ["CPU"];
}

export async function detectHumanPoses(image: CanvasImageSource): Promise<NormalizedPose[]> {
  if (typeof window === "undefined") {
    throw new PoseModelError(new Error("Pose landmarks run in the browser only."));
  }
  // MediaPipe uploads the still image through WebGL even when inference is CPU.
  if (!browserHasWebGL()) {
    throw new PoseModelError(new Error("WebGL is unavailable (activeTexture)."));
  }
  try {
    return readPoses(await detectWithSession(image));
  } catch (error) {
    if (forceCpu || !browserHasWebGL()) {
      throw error instanceof PoseModelError ? error : new PoseModelError(error);
    }
    forceCpu = true;
    sessionPromise = null;
    try {
      return readPoses(await detectWithSession(image));
    } catch (cpuError) {
      sessionPromise = null;
      throw cpuError instanceof PoseModelError ? cpuError : new PoseModelError(cpuError);
    }
  }
}

async function detectWithSession(image: CanvasImageSource) {
  const session = await getPoseSession();
  return session.detect(image);
}

function readPoses(result: ReturnType<PoseLandmarkerSession["detect"]>): NormalizedPose[] {
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
  const delegates = forceCpu ? (["CPU"] as const) : choosePoseDelegates(browserHasWebGL());
  let lastError: unknown;
  for (const delegate of delegates) {
    try {
      return await vision.PoseLandmarker.createFromOptions(fileset, {
        ...shared,
        baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL, delegate },
        ...(delegate === "GPU" ? { canvas: createPoseCanvas() } : {}),
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw new PoseModelError(lastError);
}

function browserHasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
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
