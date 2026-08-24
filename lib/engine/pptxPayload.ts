import * as v from "valibot";
import type { EngineDoc, EngineElement, EngineSlide } from "./types";

/**
 * Resource limits for the server-side PPTX adapter.
 *
 * The editor normally sends a small, already-rasterized payload. These limits
 * keep malformed or deliberately oversized requests from turning the export
 * route into an unbounded memory/CPU operation.
 */
export const PPTX_EXPORT_LIMITS = {
  bodyBytes: 50 * 1024 * 1024,
  maxSlides: 100,
  maxElementsPerSlide: 1_000,
  maxRasterizedImages: 2_000,
  maxDataUrlBytes: 20 * 1024 * 1024,
  maxTotalDataUrlBytes: 40 * 1024 * 1024,
  maxDimension: 20_000,
  maxStringLength: 4_096,
} as const;

const PayloadEnvelopeSchema = v.object({
  doc: v.unknown(),
  rasterizedImages: v.optional(v.record(v.string(), v.string())),
});

const EXPORTABLE_ELEMENT_TYPES = new Set([
  "rect",
  "ellipse",
  "diamond",
  "triangle",
  "star",
  "hexagon",
  "heart",
  "plus",
  "line",
  "arrow",
  "freedraw",
  "path",
  "text",
  "image",
  "bookMockup",
  "frame",
]);

export type PptxExportPayload = {
  doc: EngineDoc;
  rasterizedImages?: Record<string, string>;
};

/**
 * Validate the untrusted request body before it reaches PptxGenJS.
 *
 * This is intentionally a narrow structural validator, not a second document
 * serializer. Persisted documents remain the source of truth; this adapter
 * only verifies the fields that the export implementation can traverse and
 * enforces budgets around the expensive inputs.
 */
export function parsePptxExportPayload(input: unknown): PptxExportPayload | null {
  const envelope = v.safeParse(PayloadEnvelopeSchema, input);
  if (!envelope.success) return null;

  const { doc, rasterizedImages } = envelope.output;
  if (!isEngineDocForExport(doc)) return null;

  let totalDataUrlBytes = 0;
  if (rasterizedImages) {
    const entries = Object.entries(rasterizedImages);
    if (entries.length > PPTX_EXPORT_LIMITS.maxRasterizedImages) return null;
    for (const [key, dataUrl] of entries) {
      if (!isBoundedString(key) || !isAllowedRasterDataUrl(dataUrl)) return null;
      if (dataUrl.length > PPTX_EXPORT_LIMITS.maxDataUrlBytes) return null;
      totalDataUrlBytes += dataUrl.length;
      if (totalDataUrlBytes > PPTX_EXPORT_LIMITS.maxTotalDataUrlBytes) return null;
    }
  }

  return {
    doc: doc as EngineDoc,
    rasterizedImages,
  };
}

export function isAllowedRasterDataUrl(value: string): boolean {
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return false;

  const bytes = decodeBase64(match[2]);
  if (!bytes) return false;

  switch (match[1].toLowerCase()) {
    case "png":
      return hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
    case "jpg":
      return hasBytes(bytes, [0xff, 0xd8, 0xff]);
    case "webp":
      return hasAscii(bytes, 0, "RIFF") && hasAscii(bytes, 8, "WEBP");
    default:
      return false;
  }
}

/**
 * Decode only the small header needed for a type/signature check. Keeping this
 * independent from Buffer makes the payload contract safe to share with the
 * browser while still working in the Node export route.
 */
function decodeBase64(value: string): Uint8Array | null {
  if (value.length % 4 === 1) return null;
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function hasBytes(bytes: Uint8Array, expected: readonly number[]): boolean {
  if (bytes.length < expected.length) return false;
  return expected.every((byte, index) => bytes[index] === byte);
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (bytes.length < offset + expected.length) return false;
  return [...expected].every(
    (character, index) => bytes[offset + index] === character.charCodeAt(0),
  );
}

function isEngineDocForExport(value: unknown): value is EngineDoc {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id) || !isBoundedString(value.title)) return false;
  if (!isDimension(value.width) || !isDimension(value.height)) return false;
  if (!Number.isFinite(value.updatedAt) || !Number.isFinite(value.schemaVersion)) return false;
  if (!Array.isArray(value.slides) || value.slides.length === 0) return false;
  if (value.slides.length > PPTX_EXPORT_LIMITS.maxSlides) return false;
  return value.slides.every(isEngineSlideForExport);
}

function isEngineSlideForExport(value: unknown): value is EngineSlide {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id) || !isBoundedString(value.name)) return false;
  if (!isBoundedString(value.background)) return false;
  if (!isDimension(value.width) || !isDimension(value.height)) return false;
  if (
    !Array.isArray(value.elements) ||
    value.elements.length > PPTX_EXPORT_LIMITS.maxElementsPerSlide
  )
    return false;
  if (!Array.isArray(value.layers)) return false;
  if (!value.elements.every(isEngineElementForExport)) return false;
  return value.layers.every(isEngineLayerForExport);
}

function isEngineLayerForExport(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id) || !isBoundedString(value.name)) return false;
  if (value.mode !== "block" && value.mode !== "free") return false;
  if (typeof value.visible !== "boolean" || typeof value.locked !== "boolean") return false;
  if (!Number.isFinite(value.z) || !Array.isArray(value.objectIds)) return false;
  return value.objectIds.every((id) => isBoundedString(id));
}

function isEngineElementForExport(value: unknown): value is EngineElement {
  if (!isRecord(value)) return false;
  if (
    !isBoundedString(value.id) ||
    typeof value.type !== "string" ||
    !EXPORTABLE_ELEMENT_TYPES.has(value.type)
  ) {
    return false;
  }
  if (
    !isCoordinate(value.x) ||
    !isCoordinate(value.y) ||
    !isDimension(value.width) ||
    !isDimension(value.height) ||
    !Number.isFinite(value.angle) ||
    !Number.isFinite(value.opacity) ||
    !Number.isFinite(value.strokeWidth) ||
    !Number.isFinite(value.z) ||
    typeof value.isDeleted !== "boolean" ||
    !isBoundedString(value.strokeColor) ||
    !isBoundedString(value.backgroundColor)
  ) {
    return false;
  }

  if (value.type === "text") {
    return (
      isBoundedString(value.text) &&
      isBoundedString(value.fontFamily) &&
      isBoundedString(value.fontStyle) &&
      isBoundedString(value.textAlign) &&
      isBoundedString(value.verticalAlign) &&
      Number.isFinite(value.fontSize)
    );
  }
  if (value.type === "image" || value.type === "bookMockup") {
    return isBoundedString(value.fileId);
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= PPTX_EXPORT_LIMITS.maxStringLength;
}

function isCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= PPTX_EXPORT_LIMITS.maxDimension
  );
}

function isDimension(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= PPTX_EXPORT_LIMITS.maxDimension
  );
}
