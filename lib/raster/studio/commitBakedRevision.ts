/**
 * Shared Photopea / Raster Studio commit: load a PNG into the image cache,
 * swap fileId + natural size, flatten overlays, assert placementUnchanged.
 *
 * This is the PR #15 Smart Object invariant used by Photopea Apply and
 * hidden Studio Save. Do not write x/y/width/height/angle/opacity.
 */

import type { EditorController } from "@/lib/engine/editorController";
import { loadDataURL } from "@/lib/engine/imageCache";
import type { EngineSlide, ImageElement } from "@/lib/engine/types";
import { type ImagePlacementSnapshot, placementUnchanged } from "./types";

export async function commitPngRevisionToSmartObject(args: {
  elementId: string;
  placement: ImagePlacementSnapshot;
  dataURL: string;
  naturalWidth?: number;
  naturalHeight?: number;
  controller: EditorController;
  currentSlide: () => EngineSlide | undefined;
  historyLabel?: string;
}): Promise<ImageElement> {
  const cached = await loadDataURL(args.dataURL);
  const naturalWidth = args.naturalWidth ?? cached.width;
  const naturalHeight = args.naturalHeight ?? cached.height;
  const ok = args.controller.commitRasterRevision(
    args.elementId,
    {
      fileId: cached.fileId,
      naturalWidth,
      naturalHeight,
      bakePolicy: "flatten-overlays",
    },
    args.historyLabel ?? "update raster revision",
  );
  if (!ok) throw new Error("Failed to commit raster revision");

  const after = args
    .currentSlide()
    ?.elements.find((el): el is ImageElement => el.id === args.elementId && el.type === "image");
  if (!after || !placementUnchanged(args.placement, after)) {
    throw new Error("Raster edit Save changed placement — Smart Object invariant failed");
  }
  return after;
}
