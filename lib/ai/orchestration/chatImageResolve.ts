import type { CoPilotMessageImage } from "@/lib/ai/coPilot";
import { getCached } from "@/lib/engine/imageCache";

/** Prefer live URL; after history restore fall back to canvas imageCache via fileId. */
export function resolveChatImageSrc(image: CoPilotMessageImage): string {
  const url = (image.url || "").trim();
  if (url && !url.startsWith("blob:")) return url;
  if (image.fileId) {
    const cached = getCached(image.fileId)?.dataURL;
    if (cached) return cached;
  }
  return "";
}
