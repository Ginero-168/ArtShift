/**
 * Object-turntable pose for the Multi-Angle control.
 * This is not a preview of the model output. The Replicate model
 * `qwen/qwen-edit-multiangle` still expects camera inputs, so the UI maps
 * object rotation onto those fields:
 * - Horizontal drag / Angle slider is object yaw. Dragging right spins the
 *   front face to the right and sends positive `rotate_degrees` (the same
 *   view as orbiting the camera left).
 * - Vertical drag tips the object with the pointer and snaps `vertical_tilt`
 *   to −1 (top toward the viewer), 0, or +1 (underside toward the viewer).
 * - `move_forward` stays at the default. The simplified panel does not dolly.
 * `use_wide_angle` is a lens flag and does not move the object.
 */

export type MultiAngleCamera = {
  rotateDegrees: number;
  moveForward: number;
  verticalTilt: number;
  useWideAngle: boolean;
};

export const DEFAULT_MULTI_ANGLE_CAMERA: MultiAngleCamera = {
  rotateDegrees: 0,
  moveForward: 0,
  verticalTilt: 0,
  useWideAngle: false,
};

const FAR_DISTANCE = 4.6;
const NEAR_DISTANCE = 1.65;
const TILT_DEGREES = 68;
/** How far the preview box tips at vertical_tilt ±1. Not sent to the model. */
const OBJECT_TIP_DEGREES = 32;

export type MultiAnglePose = {
  x: number;
  y: number;
  z: number;
  fov: number;
  distance: number;
};

export type ObjectTurn = {
  /** Radians around Y. Positive yaw matches positive rotate_degrees. */
  yaw: number;
  /** Radians around X. Positive pitch brings the top toward +Z. */
  pitch: number;
};

type Vec3 = { x: number; y: number; z: number };

export function clampMultiAngleCamera(camera: MultiAngleCamera): MultiAngleCamera {
  return {
    rotateDegrees: clamp(Math.round(camera.rotateDegrees), -90, 90),
    moveForward: clamp(Math.round(camera.moveForward), 0, 10),
    verticalTilt: clamp(Math.round(camera.verticalTilt), -1, 1),
    useWideAngle: camera.useWideAngle,
  };
}

/**
 * Yaw/pitch used to draw the object. Yaw is `rotate_degrees`. Pitch is the
 * negation of `vertical_tilt` so a top-down camera (−1) tips the top forward.
 */
export function objectTurnFromCamera(camera: MultiAngleCamera): ObjectTurn {
  const safe = clampMultiAngleCamera(camera);
  return {
    yaw: (safe.rotateDegrees * Math.PI) / 180,
    pitch: (-safe.verticalTilt * OBJECT_TIP_DEGREES * Math.PI) / 180,
  };
}

/** Rotates a point around `origin` by the object turn for `camera`. */
export function rotateObjectPoint(point: Vec3, origin: Vec3, camera: MultiAngleCamera): Vec3 {
  const { yaw, pitch } = objectTurnFromCamera(camera);
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const z = point.z - origin.z;
  const yawCos = Math.cos(yaw);
  const yawSin = Math.sin(yaw);
  const xYaw = x * yawCos + z * yawSin;
  const zYaw = -x * yawSin + z * yawCos;
  const pitchCos = Math.cos(pitch);
  const pitchSin = Math.sin(pitch);
  return {
    x: origin.x + xYaw,
    y: origin.y + y * pitchCos - zYaw * pitchSin,
    z: origin.z + y * pitchSin + zYaw * pitchCos,
  };
}

/** Equivalent camera pose. Kept so model-space tests still describe the API. +Y is up. */
export function multiAnglePose(camera: MultiAngleCamera): MultiAnglePose {
  const safe = clampMultiAngleCamera(camera);
  const distance = FAR_DISTANCE + ((NEAR_DISTANCE - FAR_DISTANCE) * safe.moveForward) / 10;
  const yaw = (safe.rotateDegrees * Math.PI) / 180;
  const elevation = (-safe.verticalTilt * TILT_DEGREES * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * distance;
  return {
    x: -Math.sin(yaw) * horizontal,
    y: Math.sin(elevation) * distance,
    z: Math.cos(yaw) * horizontal,
    fov: safe.useWideAngle ? 64 : 34,
    distance,
  };
}

/**
 * Pointer drag turns the object. `deltaX` yaws (`rotate_degrees`). `deltaY`
 * tips it and snaps `vertical_tilt`: drag up raises the front (low angle, +1),
 * drag down brings the top forward (top-down, −1). `move_forward` is unchanged.
 */
export function cameraFromPointerDelta(
  start: MultiAngleCamera,
  deltaX: number,
  deltaY: number,
): MultiAngleCamera {
  return clampMultiAngleCamera({
    ...start,
    rotateDegrees: start.rotateDegrees + deltaX * 0.55,
    verticalTilt: start.verticalTilt - deltaY / 72,
  });
}

/** Wheel dolly. The simplified panel does not call this; `move_forward` stays put. */
export function cameraFromWheel(camera: MultiAngleCamera, deltaY: number): MultiAngleCamera {
  if (deltaY === 0) return clampMultiAngleCamera(camera);
  const step = deltaY < 0 ? 1 : -1;
  return clampMultiAngleCamera({
    ...camera,
    moveForward: camera.moveForward + step,
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
