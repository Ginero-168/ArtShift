/**
 * Client-side human pose landmarks.
 *
 * MediaPipe Pose Landmarker (BlazePose, 33 2D landmarks) runs in the browser.
 * The pinned `@mediapipe/tasks-vision@1.0.1` bundle, the SIMD and non-SIMD WASM
 * runtimes it actually requests, and the float16 full model are copied under
 * `public/mediapipe/` and loaded from this origin. Skeleton does not wait on
 * a third-party CDN or the remote model host at click time.
 *
 * `FilesetResolver.forVisionTasks(path)` (second argument omitted) loads
 * `vision_wasm_internal` when SIMD is available and `vision_wasm_nosimd_internal`
 * otherwise. The extra `vision_wasm_module_internal` pair in the npm package is
 * not requested, so it is not vendored.
 *
 * Import, WASM setup, model fetch, and detect share one deadline. A hung
 * third-party fetch or a GPU `createFromOptions` that never throws used to leave
 * the processing job pending, and the queue only clears Preload after `run`
 * settles. The deadline rejects with `PoseModelError` so the card can clear.
 * The job `AbortSignal` races the same work.
 *
 * No API key and no cloud vision call. GPU is tried first; CPU is the fallback.
 */

import { MAX_SKELETON_POSES, MIN_LANDMARK_SCORE, type NormalizedPose } from "./poseSkeleton";

export const POSE_TASKS_VERSION = "1.0.1";
export const POSE_TASKS_ESM = `/mediapipe/tasks-vision/${POSE_TASKS_VERSION}/vision_bundle.mjs`;
export const POSE_TASKS_WASM = `/mediapipe/tasks-vision/${POSE_TASKS_VERSION}/wasm`;
export const POSE_LANDMARKER_MODEL = "/mediapipe/models/pose_landmarker_full_float16.task";

/** Load + detect budget. Stays inside the 20–45s window. */
export const POSE_DETECT_TIMEOUT_MS = 40_000;

export class PoseModelError extends Error {
  readonly timedOut: boolean;

  constructor(cause?: unknown, timedOut = false) {
    const detail = cause instanceof Error && cause.message ? ` ${cause.message}` : "";
    super(`Skeleton model could not be loaded.${detail}`.trim());
    this.name = "PoseModelError";
    this.timedOut = timedOut;
  }
}

type PoseLandmark = { x: number; y: number; visibility?: number; presence?: number };

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
    landmarks?: PoseLandmark[][];
  };
};

export type DetectHumanPosesOptions = {
  signal?: AbortSignal;
  /** Overrides `POSE_DETECT_TIMEOUT_MS`. Tests use a few milliseconds. */
  timeoutMs?: number;
  /** Test double for the dynamic import. Production loads `POSE_TASKS_ESM`. */
  loadModule?: () => Promise<PoseVisionModule>;
  /** Test double for the WebGL probe. Production checks a canvas. */
  probeWebGL?: () => boolean;
};

let sessionPromise: Promise<PoseLandmarkerSession> | null = null;
let forceCpu = false;

/** GPU when WebGL exists, otherwise CPU. CPU is always the fallback. */
export function choosePoseDelegates(webglAvailable: boolean): Array<"GPU" | "CPU"> {
  return webglAvailable ? ["GPU", "CPU"] : ["CPU"];
}

/** Drop a cached session so tests do not leak a hung load into the next case. */
export function resetPoseLandmarkerForTests(): void {
  sessionPromise = null;
  forceCpu = false;
}

export async function detectHumanPoses(
  image: CanvasImageSource,
  options: DetectHumanPosesOptions = {},
): Promise<NormalizedPose[]> {
  if (typeof window === "undefined") {
    throw new PoseModelError(new Error("Pose landmarks run in the browser only."));
  }
  if (options.signal?.aborted) throw createAbortError();
  // MediaPipe uploads the still image through WebGL even when inference is CPU.
  const webgl = (options.probeWebGL ?? browserHasWebGL)();
  if (!webgl) {
    throw new PoseModelError(new Error("WebGL is unavailable (activeTexture)."));
  }
  const timeoutMs = options.timeoutMs ?? POSE_DETECT_TIMEOUT_MS;
  try {
    return await withPoseDeadline(
      () => detectWithFallback(image, options, webgl),
      timeoutMs,
      options.signal,
    );
  } catch (error) {
    // A cancelled or timed-out load must not stay cached. The queue only drops
    // Preload once this promise settles, and the next click needs a fresh attempt.
    if (isAbortError(error) || isPoseTimeout(error)) dropPoseSession();
    // The GPU graph can hang without throwing. Skip it on the next click.
    if (isPoseTimeout(error)) forceCpu = true;
    throw error;
  }
}

async function detectWithFallback(
  image: CanvasImageSource,
  options: DetectHumanPosesOptions,
  webgl: boolean,
): Promise<NormalizedPose[]> {
  try {
    return readPoses(await detectWithSession(image, options, webgl));
  } catch (error) {
    if (isAbortError(error) || isPoseTimeout(error)) throw error;
    if (forceCpu || !webgl) {
      throw error instanceof PoseModelError ? error : new PoseModelError(error);
    }
    forceCpu = true;
    dropPoseSession();
    try {
      return readPoses(await detectWithSession(image, options, webgl));
    } catch (cpuError) {
      dropPoseSession();
      if (isAbortError(cpuError) || isPoseTimeout(cpuError)) throw cpuError;
      throw cpuError instanceof PoseModelError ? cpuError : new PoseModelError(cpuError);
    }
  }
}

async function detectWithSession(
  image: CanvasImageSource,
  options: DetectHumanPosesOptions,
  webgl: boolean,
) {
  const session = await getPoseSession(options, webgl);
  return session.detect(image);
}

function readPoses(result: ReturnType<PoseLandmarkerSession["detect"]>): NormalizedPose[] {
  return (result.landmarks ?? []).map((landmarks) => ({ landmarks }));
}

async function getPoseSession(
  options: DetectHumanPosesOptions,
  webgl: boolean,
): Promise<PoseLandmarkerSession> {
  if (!sessionPromise) {
    let pending!: Promise<PoseLandmarkerSession>;
    pending = openPoseSession(options, webgl).then(
      (session) => session,
      (error: unknown) => {
        if (sessionPromise === pending) dropPoseSession();
        throw error;
      },
    );
    sessionPromise = pending;
  }
  return sessionPromise;
}

async function openPoseSession(
  options: DetectHumanPosesOptions,
  webgl: boolean,
): Promise<PoseLandmarkerSession> {
  let vision: PoseVisionModule;
  try {
    vision = await (options.loadModule ?? loadPoseVisionModule)();
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
  const delegates = forceCpu ? (["CPU"] as const) : choosePoseDelegates(webgl);
  let lastError: unknown;
  for (const delegate of delegates) {
    if (options.signal?.aborted) throw createAbortError();
    try {
      return await vision.PoseLandmarker.createFromOptions(fileset, {
        ...shared,
        baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL, delegate },
        ...(delegate === "GPU" ? { canvas: createPoseCanvas() } : {}),
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
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
  // The URL is the pinned same-origin constant above, not user input.
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

function dropPoseSession(): void {
  sessionPromise = null;
}

function withPoseDeadline<T>(
  start: () => Promise<T>,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<T> {
  if (userSignal?.aborted) return Promise.reject(createAbortError());
  // Settle the inner promise either way so a late failure is not unhandled
  // after the deadline has already rejected the caller.
  const work = start().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(createPoseTimeoutError()), timeoutMs);
    if (!userSignal) return;
    onAbort = () => reject(createAbortError());
    userSignal.addEventListener("abort", onAbort, { once: true });
  });
  const finish = () => {
    if (timer !== undefined) clearTimeout(timer);
    if (userSignal && onAbort) userSignal.removeEventListener("abort", onAbort);
  };
  return Promise.race([work, deadline]).then(
    (result) => {
      finish();
      if (result.ok) return result.value;
      throw result.error;
    },
    (error: unknown) => {
      finish();
      throw error;
    },
  );
}

function createPoseTimeoutError(): PoseModelError {
  return new PoseModelError(new Error("Pose detection timed out."), true);
}

function createAbortError(): Error {
  const error = new Error("Skeleton was cancelled.");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function isPoseTimeout(error: unknown): boolean {
  return error instanceof PoseModelError && error.timedOut;
}
