import { getCached, preloadDataURL } from "@/lib/engine/imageCache";

const inflight = new Map<string, Promise<void>>();

/**
 * Decode the selected image into the shared image cache before Layer runs.
 * Extract / Remove BG warm their local models only when the action starts;
 * Layer has no local model, so this is the client prep that must be ready
 * before the Replicate consent + request.
 */
export function preloadLayerSource(fileId: string): Promise<void> {
  const pending = inflight.get(fileId);
  if (pending) return pending;

  const cached = getCached(fileId);
  if (!cached?.dataURL) return Promise.resolve();

  const next = preloadDataURL(cached.dataURL, fileId)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      inflight.delete(fileId);
    });
  inflight.set(fileId, next);
  return next;
}
