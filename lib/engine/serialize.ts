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
import { ENGINE_SCHEMA_VERSION, type EngineDoc, type EngineSlide } from "./types";

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

export function serializeWithImages(doc: EngineDoc): SerializedDoc {
  const files: Record<string, string> = {};
  for (const sl of doc.slides) {
    for (const el of sl.elements) {
      if (el.isDeleted) continue;
      if (el.type === "image" || el.type === "bookMockup") {
        const cached = getCached(el.fileId);
        if (cached?.dataURL) {
          files[el.fileId] = cached.dataURL;
        } else if (
          typeof el.fileId === "string" &&
          (el.fileId.startsWith("data:") || el.fileId.startsWith("http://") || el.fileId.startsWith("https://"))
        ) {
          files[el.fileId] = el.fileId;
        }
      } else if (el.type === "frame" && el.imageFileId) {
        const cached = getCached(el.imageFileId);
        if (cached?.dataURL) {
          files[el.imageFileId] = cached.dataURL;
        } else if (
          typeof el.imageFileId === "string" &&
          (el.imageFileId.startsWith("data:") || el.imageFileId.startsWith("http://") || el.imageFileId.startsWith("https://"))
        ) {
          files[el.imageFileId] = el.imageFileId;
        }
      }
    }
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
