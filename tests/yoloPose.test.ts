import { describe, expect, it } from "vitest";
import { POSE_LANDMARK_COUNT } from "@/lib/vision/poseSkeleton";
import {
  COCO_POSE_KEYPOINT_COUNT,
  mapYoloPoseJson,
  YoloPoseJsonError,
} from "@/lib/vision/yoloPose";

function pixelKeypoints(originX: number, originY: number) {
  return {
    x: Array.from({ length: 17 }, (_, index) => originX + index * 4),
    y: Array.from({ length: 17 }, (_, index) => originY + index * 3),
    visible: Array.from({ length: 17 }, (_, index) => (index === 9 ? 0.1 : 0.95)),
  };
}

describe("YOLO pose JSON mapping", () => {
  it("uses the COCO-17 keypoint count the raster draws", () => {
    expect(COCO_POSE_KEYPOINT_COUNT).toBe(17);
    expect(POSE_LANDMARK_COUNT).toBe(COCO_POSE_KEYPOINT_COUNT);
  });

  it("normalizes Ultralytics summary pixels and keeps keypoint confidence", () => {
    const keypoints = pixelKeypoints(40, 20);
    const poses = mapYoloPoseJson(
      JSON.stringify([
        {
          name: "person",
          class: 0,
          confidence: 0.42,
          keypoints,
        },
        {
          name: "person",
          class: 0,
          confidence: 0.88,
          keypoints: pixelKeypoints(10, 8),
        },
      ]),
      200,
      100,
    );

    expect(poses.map((pose) => pose.confidence)).toEqual([0.88, 0.42]);
    expect(poses[0]?.landmarks).toHaveLength(17);
    expect(poses[0]?.landmarks[0]).toEqual({ x: 10 / 200, y: 8 / 100, visibility: 0.95 });
    expect(poses[1]?.landmarks[9]?.visibility).toBe(0.1);
  });

  it("keeps coordinates that are already normalized", () => {
    const poses = mapYoloPoseJson(
      {
        detections: [
          {
            name: "person",
            confidence: 0.7,
            keypoints: {
              x: Array.from({ length: 17 }, () => 0.25),
              y: Array.from({ length: 17 }, () => 0.5),
              visible: Array.from({ length: 17 }, () => 0.8),
            },
          },
        ],
      },
      800,
      600,
    );

    expect(poses[0]?.landmarks[5]).toEqual({ x: 0.25, y: 0.5, visibility: 0.8 });
  });

  it("reads flat triplets and stringified keypoint objects", () => {
    const flat = Array.from({ length: 17 }, (_, index) => [index * 10, index * 5, 0.6]).flat();
    const fromFlat = mapYoloPoseJson([{ keypoints: flat, confidence: 0.5 }], 170, 85);
    expect(fromFlat[0]?.landmarks[1]).toEqual({ x: 10 / 170, y: 5 / 85, visibility: 0.6 });

    const packed = JSON.stringify({
      x: Array.from({ length: 17 }, () => 20),
      y: Array.from({ length: 17 }, () => 30),
    });
    const fromString = mapYoloPoseJson([{ keypoints: packed, score: "0.66" }], 100, 100);
    expect(fromString[0]?.confidence).toBe(0.66);
    expect(fromString[0]?.landmarks[0]).toEqual({ x: 0.2, y: 0.3, visibility: 1 });
  });

  it("skips non-people and returns none when the frame is empty", () => {
    expect(
      mapYoloPoseJson(
        [{ name: "dog", class: 16, confidence: 0.99, keypoints: pixelKeypoints(1, 1) }],
        100,
        100,
      ),
    ).toEqual([]);
    expect(mapYoloPoseJson("[]", 100, 100)).toEqual([]);
  });

  it("rejects JSON that is not a pose payload", () => {
    expect(() => mapYoloPoseJson("not-json", 100, 100)).toThrow(YoloPoseJsonError);
  });
});
