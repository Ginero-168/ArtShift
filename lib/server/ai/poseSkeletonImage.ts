import { AiRuntimeError } from "@/lib/ai-runtime/errors";

const MAX_POSE_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

export type PoseImageUpload = {
  bytes: Uint8Array;
  filename: "pose.jpg" | "pose.png" | "pose.webp";
  contentType: "image/jpeg" | "image/png" | "image/webp";
};

/**
 * Bytes and a filename Cog will keep. Ultralytics only opens paths whose suffix
 * is a known image extension. A data URL is stored as `file` (no suffix) and
 * becomes `/tmp/…file`, which YOLO26 rejects.
 */
export function poseImageUploadFromDataUrl(dataUrl: string): PoseImageUpload {
  const match = DATA_URL.exec(dataUrl);
  if (!match || match[1].length % 4 === 1) {
    throw new AiRuntimeError("INVALID_INPUT", "Expected a valid JPEG, PNG or WebP image.", {
      provider: "replicate",
    });
  }
  const padding = match[1].endsWith("==") ? 2 : match[1].endsWith("=") ? 1 : 0;
  const byteLength = Math.floor((match[1].length * 3) / 4) - padding;
  if (byteLength <= 0 || byteLength > MAX_POSE_IMAGE_BYTES) {
    throw new AiRuntimeError("INVALID_INPUT", "Replicate accepts images up to 5 MB.", {
      provider: "replicate",
    });
  }
  const bytes = new Uint8Array(Buffer.from(match[1], "base64"));
  const sniffed = sniffPoseImage(bytes);
  if (!sniffed) {
    throw new AiRuntimeError(
      "INVALID_INPUT",
      "Skeleton image bytes are not a JPEG, PNG, or WebP file.",
      { provider: "replicate" },
    );
  }
  return { bytes, ...sniffed };
}

export function replicatePoseFileUrl(value: unknown): string {
  if (typeof value !== "string") {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate did not return a pose image URL.", {
      provider: "replicate",
    });
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate did not return a pose image URL.", {
      provider: "replicate",
    });
  }
  const fileApi =
    url.protocol === "https:" &&
    url.hostname === "api.replicate.com" &&
    url.pathname.startsWith("/v1/files/");
  if (!fileApi) {
    throw new AiRuntimeError("PROVIDER_SCHEMA", "Replicate did not return a pose image URL.", {
      provider: "replicate",
    });
  }
  return url.toString();
}

function sniffPoseImage(
  bytes: Uint8Array,
): Pick<PoseImageUpload, "filename" | "contentType"> | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { filename: "pose.jpg", contentType: "image/jpeg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { filename: "pose.png", contentType: "image/png" };
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { filename: "pose.webp", contentType: "image/webp" };
  }
  return undefined;
}
