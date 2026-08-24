export type CachedImageAsset = {
  fileId: string;
  width: number;
  height: number;
};

/** Convert a decoded cache entry into the image fields expected by the engine. */
export function createCachedImageAsset(cached: CachedImageAsset): {
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
} {
  return {
    fileId: cached.fileId,
    naturalWidth: cached.width,
    naturalHeight: cached.height,
  };
}
