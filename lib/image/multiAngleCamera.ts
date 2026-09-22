/**
 * Camera pose for the Multi-Angle control surface.
 * This is not a preview of the model output. It maps the same numbers the
 * Replicate `qwen/qwen-edit-multiangle` input uses:
 * positive rotate_degrees orbits the camera left within ±90, move_forward
 * pushes in, and vertical_tilt is only -1 (top-down), 0, or +1 (low angle).
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

export type MultiAnglePose = {
  x: number;
  y: number;
  z: number;
  fov: number;
  distance: number;
};

export function clampMultiAngleCamera(camera: MultiAngleCamera): MultiAngleCamera {
  return {
    rotateDegrees: clamp(Math.round(camera.rotateDegrees), -90, 90),
    moveForward: clamp(Math.round(camera.moveForward), 0, 10),
    verticalTilt: clamp(Math.round(camera.verticalTilt), -1, 1),
    useWideAngle: camera.useWideAngle,
  };
}

/** World-space camera. +Y is up. Positive rotate moves the camera to -X (left). */
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

export function cameraFromPointerDelta(
  start: MultiAngleCamera,
  deltaX: number,
  deltaY: number,
): MultiAngleCamera {
  return clampMultiAngleCamera({
    ...start,
    rotateDegrees: start.rotateDegrees + deltaX * 0.55,
    verticalTilt: start.verticalTilt + deltaY / 72,
  });
}

/** Wheel up (negative deltaY) pushes the camera closer. */
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
