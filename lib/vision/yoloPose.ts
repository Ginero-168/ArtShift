/**
 * Map Ultralytics YOLO pose JSON into normalized COCO-17 landmarks.
 *
 * `ultralytics/yolo26-pose` with `return_json=true` puts `result.to_json()` in
 * `json_str`. That string is a Polars export of `Results.summary()`: one object
 * per person, with pixel `keypoints.x` / `keypoints.y` / `keypoints.visible`.
 * Coordinates are normalized here so the skeleton raster can stay resolution
 * independent. The annotated photo is ignored.
 */

import type { AiPoseLandmark } from "@/lib/ai-runtime/contracts";

/** COCO-17 person keypoints used by YOLO pose models. */
export const COCO_POSE_KEYPOINT_COUNT = 17;
/** Keep the payload small. The raster still draws at most four people. */
const MAX_MAPPED_POSES = 12;
/** Values at or below this are treated as already-normalized coordinates. */
const NORMALIZED_COORD_LIMIT = 1.5;

export type YoloPoseDetection = {
  landmarks: AiPoseLandmark[];
  confidence: number;
};

type RawPoint = { x: number; y: number; visibility: number };

export class YoloPoseJsonError extends Error {
  constructor(message = "Pose JSON is not valid.") {
    super(message);
    this.name = "YoloPoseJsonError";
  }
}

export function mapYoloPoseJson(
  payload: unknown,
  imageWidth: number,
  imageHeight: number,
): YoloPoseDetection[] {
  const parsed = typeof payload === "string" ? parsePoseJson(payload) : payload;
  const detections: YoloPoseDetection[] = [];
  for (const row of detectionRows(parsed)) {
    const detection = detectionFromRow(row, imageWidth, imageHeight);
    if (detection) detections.push(detection);
  }
  detections.sort((left, right) => right.confidence - left.confidence);
  return detections.slice(0, MAX_MAPPED_POSES);
}

function parsePoseJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const lines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) throw new YoloPoseJsonError();
    try {
      return lines.map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new YoloPoseJsonError();
    }
  }
}

function detectionRows(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      return detectionRows(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of ["detections", "predictions", "results", "objects"]) {
    if (Array.isArray(record[key])) return record[key];
  }
  if (Array.isArray(record.columns)) return rowsFromPolarsColumns(record.columns);
  if (Array.isArray(record.keypoints) && isColumnarPose(record)) {
    return rowsFromParallelColumns(record);
  }
  if ("keypoints" in record) return [record];
  return [];
}

function isColumnarPose(record: Record<string, unknown>): boolean {
  return (
    Array.isArray(record.name) || Array.isArray(record.confidence) || Array.isArray(record.class)
  );
}

function rowsFromParallelColumns(record: Record<string, unknown>): Record<string, unknown>[] {
  const keypoints = record.keypoints as unknown[];
  return keypoints.map((points, index) => ({
    name: arrayAt(record.name, index),
    class: arrayAt(record.class, index),
    confidence: arrayAt(record.confidence, index) ?? arrayAt(record.conf, index),
    keypoints: points,
  }));
}

function arrayAt(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : value;
}

function rowsFromPolarsColumns(columns: unknown[]): Record<string, unknown>[] {
  const byName = new Map<string, unknown[]>();
  let length = 0;
  for (const column of columns) {
    if (!column || typeof column !== "object") continue;
    const name = (column as { name?: unknown }).name;
    const values = (column as { values?: unknown }).values;
    if (typeof name !== "string" || !Array.isArray(values)) continue;
    byName.set(name, values);
    length = Math.max(length, values.length);
  }
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < length; index += 1) {
    const row: Record<string, unknown> = {};
    for (const [name, values] of byName) row[name] = values[index];
    rows.push(row);
  }
  return rows;
}

function detectionFromRow(
  row: unknown,
  imageWidth: number,
  imageHeight: number,
): YoloPoseDetection | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (!isPerson(record)) return null;
  const landmarks = landmarksFromKeypoints(record.keypoints, imageWidth, imageHeight);
  if (!landmarks) return null;
  return { landmarks, confidence: finiteNumber(record.confidence ?? record.conf ?? record.score) };
}

function isPerson(record: Record<string, unknown>): boolean {
  if (typeof record.name === "string" && record.name.toLowerCase() !== "person") return false;
  if (typeof record.class === "number" && record.class !== 0) return false;
  return true;
}

function landmarksFromKeypoints(
  keypoints: unknown,
  imageWidth: number,
  imageHeight: number,
): AiPoseLandmark[] | null {
  const parsed = typeof keypoints === "string" ? safeParse(keypoints) : keypoints;
  const raw = rawPoints(parsed);
  if (!raw) return null;
  return normalizePoints(raw, imageWidth, imageHeight);
}

function rawPoints(parsed: unknown): RawPoint[] | null {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return null;
    if (typeof parsed[0] === "number") return pointsFromFlat(parsed);
    if (parsed.length < COCO_POSE_KEYPOINT_COUNT) return null;
    const points: RawPoint[] = [];
    for (let index = 0; index < COCO_POSE_KEYPOINT_COUNT; index += 1) {
      const point = pointFromUnknown(parsed[index]);
      if (!point) return null;
      points.push(point);
    }
    return points;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const xs = numberList(record.x);
  const ys = numberList(record.y);
  if (!xs || !ys || xs.length < COCO_POSE_KEYPOINT_COUNT || ys.length < COCO_POSE_KEYPOINT_COUNT) {
    return null;
  }
  const visible = numberList(record.visible ?? record.confidence ?? record.conf);
  const points: RawPoint[] = [];
  for (let index = 0; index < COCO_POSE_KEYPOINT_COUNT; index += 1) {
    points.push({
      x: xs[index] ?? Number.NaN,
      y: ys[index] ?? Number.NaN,
      visibility: visible?.[index] ?? 1,
    });
  }
  return points;
}

function pointsFromFlat(values: unknown[]): RawPoint[] | null {
  const flat = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (flat.length !== values.length) return null;
  const stride = flat.length / COCO_POSE_KEYPOINT_COUNT;
  if (stride !== 2 && stride !== 3) return null;
  const points: RawPoint[] = [];
  for (let index = 0; index < COCO_POSE_KEYPOINT_COUNT; index += 1) {
    const offset = index * stride;
    points.push({
      x: flat[offset] ?? Number.NaN,
      y: flat[offset + 1] ?? Number.NaN,
      visibility: stride === 3 ? (flat[offset + 2] ?? 0) : 1,
    });
  }
  return points;
}

function pointFromUnknown(value: unknown): RawPoint | null {
  if (Array.isArray(value)) {
    const x = finiteOrNaN(value[0]);
    const y = finiteOrNaN(value[1]);
    const visibility = value.length >= 3 ? finiteOrNaN(value[2]) : 1;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y, visibility: Number.isFinite(visibility) ? visibility : 0 };
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = finiteOrNaN(record.x);
  const y = finiteOrNaN(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const visibility = finiteOrNaN(
    record.visible ?? record.visibility ?? record.confidence ?? record.conf,
  );
  return { x, y, visibility: Number.isFinite(visibility) ? visibility : 1 };
}

function normalizePoints(
  points: readonly RawPoint[],
  imageWidth: number,
  imageHeight: number,
): AiPoseLandmark[] | null {
  const maxAbs = points.reduce(
    (max, point) => Math.max(max, Math.abs(point.x), Math.abs(point.y)),
    0,
  );
  const usePixels = maxAbs > NORMALIZED_COORD_LIMIT;
  if (
    usePixels &&
    (!Number.isFinite(imageWidth) ||
      !Number.isFinite(imageHeight) ||
      imageWidth < 2 ||
      imageHeight < 2)
  ) {
    return null;
  }
  return points.map((point) => ({
    x: usePixels ? point.x / imageWidth : point.x,
    y: usePixels ? point.y / imageHeight : point.y,
    visibility: Number.isFinite(point.visibility) ? point.visibility : 0,
  }));
}

function numberList(value: unknown): number[] | null {
  const parsed = typeof value === "string" ? safeParse(value) : value;
  if (!Array.isArray(parsed)) return null;
  const numbers = parsed.map((item) => (typeof item === "number" ? item : Number(item)));
  if (numbers.some((item) => !Number.isFinite(item))) return null;
  return numbers;
}

function finiteNumber(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteOrNaN(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
