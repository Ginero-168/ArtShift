import {
  collectClipboardAssetIds,
  embedImageSourcesForClipboard,
  writeObjectsToClipboard,
} from "../clipboard";
import * as imageCache from "./imageCache";
import type { EngineElement } from "./types";

let publishGeneration = 0;

/**
 * Publish the current selection to the system clipboard so another ArtShift
 * tab can paste it.
 *
 * Image bytes come from the in-memory image cache. A fileId that is not itself
 * a data:/blob:/http(s) URL and is missing from that cache is left out of the
 * payload. The element still pastes; the destination tab cannot reconstruct
 * pixels it never received. IndexedDB is not consulted — a bare fileId is not
 * portable across tabs.
 */
export async function publishEngineClipboard(elements: EngineElement[]): Promise<void> {
  if (!elements.length) return;
  const generation = ++publishGeneration;
  const sources: Record<string, string | undefined> = {};
  for (const fileId of collectClipboardAssetIds(elements)) {
    const cached = imageCache.getCached(fileId)?.dataURL;
    if (cached) sources[fileId] = cached;
    else if (/^(data:|blob:|https?:)/i.test(fileId)) sources[fileId] = fileId;
  }
  const assets = await embedImageSourcesForClipboard(sources);
  if (generation !== publishGeneration) return;
  await writeObjectsToClipboard(elements, assets);
}
