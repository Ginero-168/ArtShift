import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  acceptPoses,
  MAX_SKELETON_PIXELS,
  type NormalizedPose,
  POSE_BONES,
  POSE_SKELETON_INVALID_IMAGE_MESSAGE,
  POSE_SKELETON_MODEL_MESSAGE,
  POSE_SKELETON_NO_PERSON_MESSAGE,
  PoseSkeletonError,
  poseSkeletonFailureMessage,
  renderPoseSkeletonPng,
  skeletonOutputSize,
} from "@/lib/vision/poseSkeleton";

function pose(points: Record<number, [number, number, number?]>): NormalizedPose {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  for (const [index, value] of Object.entries(points)) {
    const [x, y, visibility = 1] = value;
    landmarks[Number(index)] = { x, y, visibility };
  }
  return { landmarks };
}

function standingPose(
  yShift = 0,
  overrides: Record<number, [number, number, number?]> = {},
): NormalizedPose {
  return pose({
    0: [0.5, 0.12 + yShift],
    11: [0.35, 0.28 + yShift],
    12: [0.65, 0.28 + yShift],
    13: [0.28, 0.48 + yShift],
    14: [0.72, 0.48 + yShift],
    23: [0.4, 0.62 + yShift],
    24: [0.6, 0.62 + yShift],
    ...overrides,
  });
}

function readPng(dataUrl: string) {
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idats: Buffer[] = [];
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8]).toBe(8);
      expect(data[9]).toBe(6);
    }
    if (type === "IDAT") idats.push(Buffer.from(data));
    offset += 12 + length;
  }
  const inflated = inflateSync(Buffer.concat(idats));
  const rowSize = width * 4;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(inflated[y * (rowSize + 1)]).toBe(0);
    rgba.set(inflated.subarray(y * (rowSize + 1) + 1, (y + 1) * (rowSize + 1)), y * rowSize);
  }
  return { width, height, rgba };
}

function pixelAt(
  image: { width: number; rgba: Uint8Array },
  x: number,
  y: number,
): [number, number, number, number] {
  const index = (y * image.width + x) * 4;
  return [image.rgba[index], image.rgba[index + 1], image.rgba[index + 2], image.rgba[index + 3]];
}

describe("pose skeleton raster", () => {
  it("uses the MediaPipe pose connection list", () => {
    expect(POSE_BONES).toContainEqual([11, 12]);
    expect(POSE_BONES).toContainEqual([13, 15]);
    expect(POSE_BONES).toContainEqual([23, 25]);
    expect(POSE_BONES.length).toBe(35);
  });

  it("draws a transparent PNG with a readable shoulder bone", async () => {
    const rendered = await renderPoseSkeletonPng(100, 100, [standingPose()]);
    expect(rendered.poseCount).toBe(1);
    const image = readPng(rendered.dataUrl);
    expect(image.width).toBe(100);
    expect(image.height).toBe(100);
    expect(pixelAt(image, 0, 0)[3]).toBe(0);
    const shoulder = pixelAt(image, 50, 28);
    expect(shoulder[3]).toBeGreaterThan(200);
    expect(shoulder[0]).toBeLessThan(80);
    expect(shoulder[1]).toBeGreaterThan(180);
    expect(shoulder[2]).toBeGreaterThan(180);
  });

  it("draws each accepted person in a different color", async () => {
    const rendered = await renderPoseSkeletonPng(200, 200, [standingPose(0), standingPose(0.3)]);
    expect(rendered.poseCount).toBe(2);
    const image = readPng(rendered.dataUrl);
    const first = pixelAt(image, 100, 56);
    const second = pixelAt(image, 100, 116);
    expect(first[2]).toBeGreaterThan(second[2] + 40);
    expect(second[0]).toBeGreaterThan(first[0] + 40);
  });

  it("skips a low-confidence limb without rejecting the torso", async () => {
    const faintArm = standingPose(0, { 13: [0.02, 0.9, 0.1] });
    const rendered = await renderPoseSkeletonPng(80, 80, [faintArm]);
    const image = readPng(rendered.dataUrl);
    expect(pixelAt(image, 2, 72)[3]).toBe(0);
  });

  it("refuses an image with no confident person", async () => {
    const hidden = pose({
      11: [0.3, 0.3, 0.2],
      12: [0.7, 0.3, 0.2],
      23: [0.4, 0.7, 0.2],
      24: [0.6, 0.7, 0.2],
    });
    await expect(renderPoseSkeletonPng(64, 64, [hidden])).rejects.toMatchObject({
      name: "PoseSkeletonError",
      code: "no-pose",
      message: POSE_SKELETON_NO_PERSON_MESSAGE,
    });
    expect(acceptPoses([hidden])).toEqual([]);
  });

  it("scales very large photos down under the pixel cap", () => {
    const size = skeletonOutputSize(4000, 3000);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_SKELETON_PIXELS);
    expect(size.width / size.height).toBeCloseTo(4000 / 3000, 1);
    expect(() => skeletonOutputSize(1, 40)).toThrow(PoseSkeletonError);
  });

  it("maps model and pose failures to clear messages", () => {
    expect(poseSkeletonFailureMessage(new PoseSkeletonError("no-pose", "ignored"))).toBe(
      POSE_SKELETON_NO_PERSON_MESSAGE,
    );
    expect(poseSkeletonFailureMessage(new PoseSkeletonError("invalid-image", "ignored"))).toBe(
      POSE_SKELETON_INVALID_IMAGE_MESSAGE,
    );
    const modelError = new Error("network");
    modelError.name = "PoseModelError";
    expect(poseSkeletonFailureMessage(modelError)).toBe(POSE_SKELETON_MODEL_MESSAGE);
  });
});
