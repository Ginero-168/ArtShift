/**
 * Engine document serializer.
 *
 * Plain JSON in/out. The schema is forward-compatible: unknown fields are
 * preserved through `toJSON` and ignored on `fromJSON` if not present in the
 * current `EngineElement` union.
 *
 * Image binaries are *not* embedded in the EngineDoc itself — we keep them
 * in `imageCache` keyed by `fileId`. `serializeWithImages` returns both
 * the doc and a side-table of dataURLs for full-fidelity save.
 */

import { getCached, loadDataURL } from "./imageCache";
import { normalizeDocumentLayers } from "./layers";
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineElement, type EngineSlide } from "./types";

export class MissingSerializedImageError extends Error {
  readonly fileIds: string[];

  constructor(fileIds: string[]) {
    const preview = fileIds.slice(0, 3).join(", ");
    const suffix = fileIds.length > 3 ? "…" : "";
    super(
      `Cannot save: missing image data for ${fileIds.length} live file${
        fileIds.length === 1 ? "" : "s"
      } (${preview}${suffix}).`,
    );
    this.name = "MissingSerializedImageError";
    this.fileIds = fileIds;
  }
}

export type SerializedDoc = {
  doc: EngineDoc;
  /** fileId → dataURL */
  files: Record<string, string>;
};

export function toJSON(doc: EngineDoc): EngineDoc {
  // Strip soft-deleted elements + cached transient fields.
  return {
    ...doc,
    schemaVersion: ENGINE_SCHEMA_VERSION,
    slides: doc.slides.map((sl) => {
      const elements = sl.elements.filter((el) => !el.isDeleted).map(({ ...rest }) => rest);
      const objectIds = new Set(elements.map((element) => element.id));
      return {
        ...sl,
        elements,
        layers: sl.layers.map((layer) => ({
          ...layer,
          objectIds: layer.objectIds.filter((id) => objectIds.has(id)),
          placements: Object.fromEntries(
            Object.entries(layer.placements).filter(([id]) => objectIds.has(id)),
          ),
        })),
      };
    }),
  };
}

export function listLiveImageFileIds(doc: EngineDoc): string[] {
  const ids = new Set<string>();
  for (const sl of doc.slides) {
    for (const el of sl.elements) {
      const fileId = liveImageFileId(el);
      if (fileId) ids.add(fileId);
    }
  }
  return [...ids];
}

export function missingSerializedImageFileIds(
  doc: EngineDoc,
  files: Record<string, string>,
): string[] {
  return listLiveImageFileIds(doc).filter((fileId) => !files[fileId]);
}

function liveImageFileId(el: EngineElement): string | null {
  if (el.isDeleted) return null;
  if (el.type === "image" || el.type === "bookMockup") {
    return typeof el.fileId === "string" && el.fileId.trim() ? el.fileId : null;
  }
  if (el.type === "frame" && typeof el.imageFileId === "string" && el.imageFileId.trim()) {
    return el.imageFileId;
  }
  return null;
}

function resolveImageFile(fileId: string): string | undefined {
  const cached = getCached(fileId);
  if (cached?.dataURL) return cached.dataURL;
  if (fileId.startsWith("data:") || fileId.startsWith("http://") || fileId.startsWith("https://")) {
    return fileId;
  }
  return undefined;
}

export function serializeWithImages(
  doc: EngineDoc,
  extraFiles: Record<string, string> = {},
): SerializedDoc {
  const files: Record<string, string> = { ...extraFiles };
  for (const fileId of listLiveImageFileIds(doc)) {
    if (files[fileId]) continue;
    const resolved = resolveImageFile(fileId);
    if (resolved) files[fileId] = resolved;
  }
  const missing = missingSerializedImageFileIds(doc, files);
  if (missing.length > 0) {
    throw new MissingSerializedImageError(missing);
  }
  return { doc: toJSON(doc), files };
}

export function fromJSON(input: unknown): EngineDoc {
  if (!input || typeof input !== "object") throw new Error("Invalid engine doc");
  const obj = input as Partial<EngineDoc>;
  if (!Array.isArray(obj.slides)) throw new Error("Invalid engine doc: missing slides");
  const slides = obj.slides.map((sl: Partial<EngineSlide>) => ({
    ...sl,
    elements: sl.elements ?? [],
    layers: sl.layers ?? [],
    width: sl.width ?? 1920,
    height: sl.height ?? 1080,
  })) as EngineSlide[];
  return normalizeDocumentLayers({
    id: obj.id ?? crypto.randomUUID(),
    title: obj.title ?? "Untitled",
    width: obj.width ?? 1920,
    height: obj.height ?? 1080,
    slides,
    snapGrid: obj.snapGrid ?? null,
    workspaceStrictness: obj.workspaceStrictness ?? 1,
    strictnessLevel:
      obj.strictnessLevel ??
      (obj.workspaceStrictness === 1 ? 1 : obj.workspaceStrictness === 2 ? 2 : 3),
    strictnessValues: obj.strictnessValues ?? { 2: 1, 3: 2 },
    updatedAt: obj.updatedAt ?? Date.now(),
    // A missing version is a schema-v1 document. Preserve that fact so
    // normalizeDocumentLayers can run every required migration.
    schemaVersion: obj.schemaVersion ?? 1,
  });
}

export async function deserializeWithImages(payload: SerializedDoc): Promise<EngineDoc> {
  const doc = fromJSON(payload.doc);
  // Pre-warm image cache so the first render has bitmaps ready.
  await Promise.all(
    Object.entries(payload.files ?? {}).map(([fileId, dataURL]) =>
      loadDataURL(dataURL, fileId).catch(() => null),
    ),
  );
  return doc;
}
