/**
 * Raster Studio Smart Object contracts (Phase 0).
 *
 * Open receives image *content* only. Save writes a baked revision and must
 * leave placement / Appearance fields untouched on the placed element.
 */

import type { ColorAdjustments } from "@/lib/color/adjustments";
import type { ImageElement } from "@/lib/engine/types";
import type { RasterMaskStroke, RasterRetouchEdit } from "@/lib/raster/types";

/** Placement + appearance fields that Raster Studio Save must never change. */
export type ImagePlacementSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  flipX?: boolean;
  flipY?: boolean;
};

/** Content payload handed to Raster Studio on open. */
export type RasterStudioOpenPayload = {
  elementId: string;
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: ImageElement["crop"];
  adjustments?: Partial<ColorAdjustments>;
  filterBlur?: number;
  mask?: ImageElement["mask"];
  rasterMask?: RasterMaskStroke[];
  rasterEdits?: RasterRetouchEdit[];
  sourceName?: string;
  /** Captured so Save can assert the Smart Object placement invariant. */
  placement: ImagePlacementSnapshot;
};

export type RasterStudioBakePolicy = "flatten-overlays";

export type RasterStudioCommitInput = {
  elementId: string;
  /** New cache/side-table id for the baked composite. */
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Phase-0/1 policy: bake overlays into pixels and clear them on the element. */
  bakePolicy: RasterStudioBakePolicy;
};

export type RasterStudioCommitPatch = {
  fileId: string;
  naturalWidth: number;
  naturalHeight: number;
  crop: null;
  rasterMask: undefined;
  rasterEdits: undefined;
  adjustments: undefined;
  filterBlur: undefined;
};

export function snapshotImagePlacement(image: ImageElement): ImagePlacementSnapshot {
  return {
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
    angle: image.angle,
    opacity: image.opacity,
    flipX: image.flipX,
    flipY: image.flipY,
  };
}

export function buildRasterStudioOpenPayload(image: ImageElement): RasterStudioOpenPayload {
  return {
    elementId: image.id,
    fileId: image.fileId,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    crop: image.crop,
    adjustments: image.adjustments,
    filterBlur: image.filterBlur,
    mask: image.mask,
    rasterMask: image.rasterMask,
    rasterEdits: image.rasterEdits,
    sourceName: image.sourceName,
    placement: snapshotImagePlacement(image),
  };
}

/**
 * Build the element patch for a baked revision.
 * Callers must apply this via a single history-labeled updateElements call.
 *
 * Policy A (v1): flatten overlays into the new fileId and clear them on the
 * element. Image binaries already live in the persist/IDB fileId side table;
 * this is what keeps fat rasterEdits dataUrls out of saved JSON after Save.
 * Do not strip overlays on document load — old projects stay readable until
 * the user Saves in Raster Studio.
 */
export function buildRasterStudioCommitPatch(
  input: RasterStudioCommitInput,
): RasterStudioCommitPatch {
  if (input.bakePolicy !== "flatten-overlays") {
    throw new Error(`Unsupported Raster Studio bake policy: ${String(input.bakePolicy)}`);
  }
  return {
    fileId: input.fileId,
    naturalWidth: input.naturalWidth,
    naturalHeight: input.naturalHeight,
    // Bake uses the same composite path as on-canvas display (crop applied),
    // so crop must reset to avoid double-cropping after Save.
    crop: null,
    rasterMask: undefined,
    rasterEdits: undefined,
    adjustments: undefined,
    filterBlur: undefined,
  };
}

/** True when every placement field matches the snapshot taken at Open. */
export function placementUnchanged(
  before: ImagePlacementSnapshot,
  after: Pick<
    ImageElement,
    "x" | "y" | "width" | "height" | "angle" | "opacity" | "flipX" | "flipY"
  >,
): boolean {
  return (
    before.x === after.x &&
    before.y === after.y &&
    before.width === after.width &&
    before.height === after.height &&
    before.angle === after.angle &&
    before.opacity === after.opacity &&
    before.flipX === after.flipX &&
    before.flipY === after.flipY
  );
}
