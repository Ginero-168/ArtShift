import { describe, expect, it } from "vitest";
import {
  cameraFromPointerDelta,
  cameraFromWheel,
  DEFAULT_MULTI_ANGLE_CAMERA,
  multiAnglePose,
} from "@/lib/image/multiAngleCamera";

describe("Multi-Angle camera pose", () => {
  it("starts at eye level in front of the subject", () => {
    const pose = multiAnglePose(DEFAULT_MULTI_ANGLE_CAMERA);
    expect(pose.x).toBeCloseTo(0);
    expect(pose.y).toBeCloseTo(0);
    expect(pose.z).toBeGreaterThan(0);
    expect(pose.fov).toBeLessThan(40);
  });

  it("moves the camera left when rotate degrees are positive", () => {
    const pose = multiAnglePose({ ...DEFAULT_MULTI_ANGLE_CAMERA, rotateDegrees: 90 });
    expect(pose.x).toBeLessThan(0);
    expect(pose.z).toBeCloseTo(0);
  });

  it("raises the camera for top-down and lowers it for a low angle", () => {
    const top = multiAnglePose({ ...DEFAULT_MULTI_ANGLE_CAMERA, verticalTilt: -1 });
    const low = multiAnglePose({ ...DEFAULT_MULTI_ANGLE_CAMERA, verticalTilt: 1 });
    expect(top.y).toBeGreaterThan(1);
    expect(low.y).toBeLessThan(-1);
  });

  it("pushes the camera closer as move forward increases", () => {
    const far = multiAnglePose(DEFAULT_MULTI_ANGLE_CAMERA);
    const close = multiAnglePose({ ...DEFAULT_MULTI_ANGLE_CAMERA, moveForward: 10 });
    expect(close.distance).toBeLessThan(far.distance);
  });

  it("widens the lens when wide angle is on", () => {
    const wide = multiAnglePose({ ...DEFAULT_MULTI_ANGLE_CAMERA, useWideAngle: true });
    const normal = multiAnglePose(DEFAULT_MULTI_ANGLE_CAMERA);
    expect(wide.fov).toBeGreaterThan(normal.fov);
  });

  it("maps a sideways drag to rotate and a vertical drag to tilt", () => {
    const next = cameraFromPointerDelta(DEFAULT_MULTI_ANGLE_CAMERA, 100, 80);
    expect(next.rotateDegrees).toBe(55);
    expect(next.verticalTilt).toBe(1);
  });

  it("clamps orbit drag to ±90 and tilt to -1, 0, or 1", () => {
    const spun = cameraFromPointerDelta(DEFAULT_MULTI_ANGLE_CAMERA, 400, -200);
    expect(spun.rotateDegrees).toBe(90);
    expect(spun.verticalTilt).toBe(-1);
    const opposite = cameraFromPointerDelta(DEFAULT_MULTI_ANGLE_CAMERA, -400, 200);
    expect(opposite.rotateDegrees).toBe(-90);
    expect(opposite.verticalTilt).toBe(1);
  });

  it("treats wheel-up as a push-in", () => {
    expect(cameraFromWheel(DEFAULT_MULTI_ANGLE_CAMERA, -120).moveForward).toBe(1);
    expect(
      cameraFromWheel({ ...DEFAULT_MULTI_ANGLE_CAMERA, moveForward: 10 }, -120).moveForward,
    ).toBe(10);
  });
});
