"use client";

import { fileToDataURL, isSupportedImageFile, loadDataURL } from "./imageCache";

const DB_NAME = "artshift-linked-assets";
const STORE_NAME = "handles";

type PermissionStateLike = "granted" | "denied" | "prompt";

type FileHandleLike = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  queryPermission?(options: { mode: "read" }): Promise<PermissionStateLike>;
  requestPermission?(options: { mode: "read" }): Promise<PermissionStateLike>;
};

type PickerWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple: boolean;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileHandleLike[]>;
};

export type LinkedAssetResult = {
  fileId: string;
  width: number;
  height: number;
  linkedAssetId: string;
  sourceName: string;
  sourceLastModified: number;
  sourceSize: number;
  changed: boolean;
};

export function supportsLinkedAssets(): boolean {
  return typeof window !== "undefined" && !!(window as PickerWindow).showOpenFilePicker;
}

export async function chooseLinkedImage(existingId?: string): Promise<LinkedAssetResult> {
  const picker = (window as PickerWindow).showOpenFilePicker;
  if (!picker) {
    throw new Error("Linked files require a Chromium browser. Use Choose image to embed a copy.");
  }
  const [handle] = await picker({
    multiple: false,
    types: [
      {
        description: "Images",
        accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"] },
      },
    ],
  });
  if (!handle) throw new Error("No image was selected.");
  const linkedAssetId = existingId ?? crypto.randomUUID();
  await saveHandle(linkedAssetId, handle);
  return loadHandleImage(linkedAssetId, handle);
}

export async function refreshLinkedImage(
  linkedAssetId: string,
  previousLastModified?: number,
  previousSize?: number,
): Promise<LinkedAssetResult> {
  const handle = await readHandle(linkedAssetId);
  if (!handle) throw new Error("The source link is unavailable. Choose Relink to locate it again.");
  const permission = await ensureReadPermission(handle);
  if (!permission) throw new Error("Permission to read the linked image was not granted.");
  const result = await loadHandleImage(linkedAssetId, handle);
  return {
    ...result,
    changed:
      result.sourceLastModified !== previousLastModified || result.sourceSize !== previousSize,
  };
}

async function loadHandleImage(
  linkedAssetId: string,
  handle: FileHandleLike,
): Promise<LinkedAssetResult> {
  const file = await handle.getFile();
  if (!isSupportedImageFile(file)) throw new Error("Use a PNG, JPEG or WebP source under 50 MB.");
  const asset = await loadDataURL(await fileToDataURL(file));
  return {
    fileId: asset.fileId,
    width: asset.width,
    height: asset.height,
    linkedAssetId,
    sourceName: file.name,
    sourceLastModified: file.lastModified,
    sourceSize: file.size,
    changed: true,
  };
}

async function ensureReadPermission(handle: FileHandleLike): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: "read" })) === "granted") return true;
  return (await handle.requestPermission?.({ mode: "read" })) === "granted";
}

async function saveHandle(id: string, handle: FileHandleLike): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const done = transactionDone(tx);
  tx.objectStore(STORE_NAME).put({ id, handle });
  await done;
}

async function readHandle(id: string): Promise<FileHandleLike | null> {
  const db = await openDatabase();
  const tx = db.transaction(STORE_NAME, "readonly");
  const done = transactionDone(tx);
  const request = tx.objectStore(STORE_NAME).get(id);
  const record = await requestResult<{ id: string; handle: FileHandleLike } | undefined>(request);
  await done;
  return record?.handle ?? null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Linked asset database failed."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Linked asset request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Linked asset transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Linked asset transaction aborted."));
  });
}
