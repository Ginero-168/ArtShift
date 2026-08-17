"use client";

import type { TemplateResult } from "../templates";
import { getCached, loadDataURL } from "./imageCache";
import type { EngineElement } from "./types";

/**
 * Resolve template image sources into stable cache ids before document state
 * references them. Failed optional images remain editable placeholders.
 */
export async function materializeTemplateAssets(result: TemplateResult): Promise<TemplateResult> {
  const objects = await Promise.all(
    result.objects.map(async (element): Promise<EngineElement> => {
      if (element.type !== "image" && element.type !== "bookMockup") return element;
      if (!element.fileId || getCached(element.fileId)) {
        return element.type === "image" && !element.fileId
          ? { ...element, status: "error" }
          : element;
      }
      try {
        const asset = await loadDataURL(element.fileId);
        return {
          ...element,
          fileId: asset.fileId,
          naturalWidth: asset.width,
          naturalHeight: asset.height,
          ...(element.type === "image" ? { status: "loaded" as const } : {}),
          version: element.version + 1,
        } as EngineElement;
      } catch {
        return element.type === "image" ? { ...element, status: "error" } : element;
      }
    }),
  );
  return { ...result, objects };
}
