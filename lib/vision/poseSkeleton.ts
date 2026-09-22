/**
 * Draw a 2D human pose skeleton into a transparent PNG.
 *
 * Landmarks are COCO-17 (YOLO pose). This module does not call the model;
 * callers pass landmarks in, including tests.
 */

import { arrayBufferToPngDataUrl } from "@/lib/raster/studio/encodeRevision";

export const POSE_LANDMARK_COUNT = 17;
export const MIN_LANDMARK_SCORE = 0.5;
/** Both shoulders, or both hips, plus enough other visible joints to reach this. */
export const MIN_ACCEPTED_LANDMARKS = 4;
/** The cloud model returns the most confident poses first; we draw each of these. */
export const MAX_SKELETON_POSES = 4;
/** Keep the one-shot raster responsive on very large photos. */
export const MAX_SKELETON_PIXELS = 4_000_000;

export const POSE_SKELETON_NO_PERSON_MESSAGE =
  "ไม่พบท่าทางคนในภาพนี้ หรือความมั่นใจต่ำเกินไป ลองใช้ภาพคนที่เห็นชัด";
export const POSE_SKELETON_API_MESSAGE = "เรียกโมเดล Skeleton ไม่สำเร็จ ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง";
export const POSE_SKELETON_MISSING_KEY_MESSAGE =
  "ยังไม่ได้ตั้งค่า Replicate API key สำหรับบัญชีนี้ เพิ่มคีย์ใน AI Provider Settings แล้วลองอีกครั้ง";
export const POSE_SKELETON_AUTH_MESSAGE = "กรุณาเข้าสู่ระบบก่อนใช้ Skeleton";
export const POSE_SKELETON_INVALID_IMAGE_MESSAGE = "ภาพนี้เล็กหรือเสียจนวาดโครงร่างไม่ได้";

/**
 * COCO-17 skeleton, 0-indexed.
 * 0 nose, 1 left eye, 2 right eye, 3 left ear, 4 right ear,
 * 5 left shoulder, 6 right shoulder, 7 left elbow, 8 right elbow,
 * 9 left wrist, 10 right wrist, 11 left hip, 12 right hip,
 * 13 left knee, 14 right knee, 15 left ankle, 16 right ankle.
 */
export const POSE_BONES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
];

const PERSON_COLORS: readonly Rgba[] = [
  { r: 34, g: 211, b: 238, a: 255 },
  { r: 245, g: 158, b: 11, a: 255 },
  { r: 163, g: 230, b: 53, a: 255 },
  { r: 244, g: 114, b: 182, a: 255 },
];

const HALO: Rgba = { r: 15, g: 23, b: 42, a: 230 };

export type NormalizedLandmark = {
  x: number;
  y: number;
  visibility?: number;
  presence?: number;
};

export type NormalizedPose = {
  landmarks: readonly NormalizedLandmark[];
};

export class PoseSkeletonError extends Error {
  readonly code: "no-pose" | "invalid-image";

  constructor(code: "no-pose" | "invalid-image", message: string) {
    super(message);
    this.name = "PoseSkeletonError";
    this.code = code;
  }
}

type Rgba = { r: number; g: number; b: number; a: number };

export function landmarkScore(landmark: NormalizedLandmark): number {
  const visibility = landmark.visibility ?? 1;
  const presence = landmark.presence ?? 1;
  if (!Number.isFinite(visibility) || !Number.isFinite(presence)) return 0;
  return Math.min(visibility, presence);
}

export function isUsableLandmark(
  landmark: NormalizedLandmark | undefined,
): landmark is NormalizedLandmark {
  if (!landmark) return false;
  if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return false;
  return landmarkScore(landmark) >= MIN_LANDMARK_SCORE;
}

function hasTorso(landmarks: readonly NormalizedLandmark[]): boolean {
  const pairs: readonly (readonly [number, number])[] = [
    [5, 6],
    [11, 12],
    [5, 11],
    [6, 12],
  ];
  return pairs.some(
    ([start, end]) => isUsableLandmark(landmarks[start]) && isUsableLandmark(landmarks[end]),
  );
}

/** Keep every confident person, most confident first, up to `MAX_SKELETON_POSES`. */
export function acceptPoses(poses: readonly NormalizedPose[]): NormalizedPose[] {
  const accepted: NormalizedPose[] = [];
  for (const pose of poses) {
    if (accepted.length >= MAX_SKELETON_POSES) break;
    const usable = pose.landmarks.reduce(
      (count, landmark) => count + (isUsableLandmark(landmark) ? 1 : 0),
      0,
    );
    if (usable < MIN_ACCEPTED_LANDMARKS || !hasTorso(pose.landmarks)) continue;
    accepted.push(pose);
  }
  return accepted;
}

export function skeletonOutputSize(
  width: number,
  height: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) {
    throw new PoseSkeletonError("invalid-image", POSE_SKELETON_INVALID_IMAGE_MESSAGE);
  }
  const roundedWidth = Math.round(width);
  const roundedHeight = Math.round(height);
  const pixels = roundedWidth * roundedHeight;
  if (pixels <= MAX_SKELETON_PIXELS) return { width: roundedWidth, height: roundedHeight };
  const scale = Math.sqrt(MAX_SKELETON_PIXELS / pixels);
  let nextWidth = Math.max(2, Math.floor(roundedWidth * scale));
  let nextHeight = Math.max(2, Math.floor(roundedHeight * scale));
  while (nextWidth * nextHeight > MAX_SKELETON_PIXELS) {
    if (nextWidth >= nextHeight && nextWidth > 2) nextWidth -= 1;
    else nextHeight -= 1;
  }
  return { width: nextWidth, height: nextHeight };
}

export function skeletonStrokeRadius(width: number, height: number): number {
  return Math.max(2, Math.round(Math.min(width, height) * 0.012));
}

export function rasterizePoseSkeleton(
  width: number,
  height: number,
  poses: readonly NormalizedPose[],
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const stroke = skeletonStrokeRadius(width, height);
  const halo = stroke + Math.max(2, Math.round(stroke * 0.65));
  poses.forEach((pose, index) => {
    const color = PERSON_COLORS[index % PERSON_COLORS.length] ?? PERSON_COLORS[0];
    drawPose(pixels, width, height, pose, halo, HALO);
    drawPose(pixels, width, height, pose, stroke, color);
  });
  return pixels;
}

export async function renderPoseSkeletonPng(
  width: number,
  height: number,
  poses: readonly NormalizedPose[],
): Promise<{ dataUrl: string; poseCount: number; width: number; height: number }> {
  const accepted = acceptPoses(poses);
  if (accepted.length === 0) {
    throw new PoseSkeletonError("no-pose", POSE_SKELETON_NO_PERSON_MESSAGE);
  }
  const size = skeletonOutputSize(width, height);
  const rgba = rasterizePoseSkeleton(size.width, size.height, accepted);
  return {
    dataUrl: await encodeRgbaPng(rgba, size.width, size.height),
    poseCount: accepted.length,
    width: size.width,
    height: size.height,
  };
}

export function poseSkeletonFailureMessage(error: unknown): string {
  if (error instanceof PoseSkeletonError) {
    return error.code === "no-pose"
      ? POSE_SKELETON_NO_PERSON_MESSAGE
      : POSE_SKELETON_INVALID_IMAGE_MESSAGE;
  }
  const code = errorCode(error);
  if (code === "PROVIDER_AUTH" || code === "NO_PROVIDER") return POSE_SKELETON_MISSING_KEY_MESSAGE;
  if (code === "AUTH_REQUIRED") return POSE_SKELETON_AUTH_MESSAGE;
  if (code) return POSE_SKELETON_API_MESSAGE;
  if (
    error instanceof Error &&
    /not configured|api key|replicate credential/i.test(error.message)
  ) {
    return POSE_SKELETON_MISSING_KEY_MESSAGE;
  }
  if (error instanceof Error) return POSE_SKELETON_API_MESSAGE;
  return "Skeleton ไม่สำเร็จ";
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : undefined;
}

function drawPose(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  pose: NormalizedPose,
  radius: number,
  color: Rgba,
): void {
  for (const [start, end] of POSE_BONES) {
    const from = pose.landmarks[start];
    const to = pose.landmarks[end];
    if (!isUsableLandmark(from) || !isUsableLandmark(to)) continue;
    drawSegment(
      pixels,
      width,
      height,
      from.x * width,
      from.y * height,
      to.x * width,
      to.y * height,
      radius,
      color,
    );
  }
  pose.landmarks.forEach((landmark) => {
    if (!isUsableLandmark(landmark)) return;
    stampDisc(pixels, width, height, landmark.x * width, landmark.y * height, radius * 1.35, color);
  });
}

function drawSegment(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  color: Rgba,
): void {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(length / 0.75));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    stampDisc(pixels, width, height, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, color);
  }
}

function stampDisc(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  color: Rgba,
): void {
  const reach = Math.ceil(radius);
  const xStart = Math.max(0, Math.floor(cx - reach));
  const yStart = Math.max(0, Math.floor(cy - reach));
  const xEnd = Math.min(width - 1, Math.ceil(cx + reach));
  const yEnd = Math.min(height - 1, Math.ceil(cy + reach));
  const outer = radius * radius;
  const inner = Math.max(0, radius - 1.25);
  const innerSquared = inner * inner;
  for (let y = yStart; y <= yEnd; y++) {
    for (let x = xStart; x <= xEnd; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distance = dx * dx + dy * dy;
      if (distance > outer) continue;
      let alpha = color.a;
      if (distance > innerSquared && radius > inner) {
        const fade = (radius - Math.sqrt(distance)) / (radius - inner);
        alpha = Math.round(color.a * Math.max(0, Math.min(1, fade)));
      }
      blendPixel(pixels, width, x, y, color.r, color.g, color.b, alpha);
    }
  }
}

function blendPixel(
  pixels: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  red: number,
  green: number,
  blue: number,
  alpha: number,
): void {
  const index = (y * width + x) * 4;
  const srcA = alpha / 255;
  const dstA = pixels[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  const keep = dstA * (1 - srcA);
  pixels[index] = Math.round((red * srcA + pixels[index] * keep) / outA);
  pixels[index + 1] = Math.round((green * srcA + pixels[index + 1] * keep) / outA);
  pixels[index + 2] = Math.round((blue * srcA + pixels[index + 2] * keep) / outA);
  pixels[index + 3] = Math.round(outA * 255);
}

async function encodeRgbaPng(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string> {
  const stride = width * 4;
  const scanlines = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    scanlines[row] = 0;
    scanlines.set(rgba.subarray(y * stride, y * stride + stride), row + 1);
  }
  const compressed = await zlibDeflate(scanlines);
  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, width);
  header.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = concatBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array()),
  ]);
  const bytes = new Uint8Array(png.byteLength);
  bytes.set(png);
  return arrayBufferToPngDataUrl(bytes.buffer);
}

async function zlibDeflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  await writer.write(data as BufferSource);
  await writer.close();
  const compressed = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(compressed);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
