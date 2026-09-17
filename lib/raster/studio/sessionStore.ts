"use client";

import type { Tool } from "@/lib/engine/store";
import {
  buildRasterStudioOpenPayload,
  type RasterStudioOpenPayload,
} from "@/lib/raster/studio/types";
import type { ImageElement } from "@/lib/engine/types";
import { create } from "zustand";

export type StudioRasterTool =
  | "rasterBrush"
  | "rasterPencil"
  | "rasterEraser"
  | "rasterMarquee"
  | "rasterEllipse"
  | "rasterLasso"
  | "rasterPolygonLasso"
  | "rasterMagicWand"
  | "rasterQuickSelection"
  | "rasterHealing"
  | "rasterClone"
  | "hand";

const DEFAULT_STUDIO_TOOL: StudioRasterTool = "rasterBrush";

type RasterStudioSessionState = {
  open: boolean;
  payload: RasterStudioOpenPayload | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  studioTool: StudioRasterTool;
  openFromImage: (image: ImageElement) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setStudioTool: (tool: StudioRasterTool) => void;
  close: () => void;
};

export function isStudioRasterTool(tool: Tool | string): tool is StudioRasterTool {
  return (
    tool === "rasterBrush" ||
    tool === "rasterPencil" ||
    tool === "rasterEraser" ||
    tool === "rasterMarquee" ||
    tool === "rasterEllipse" ||
    tool === "rasterLasso" ||
    tool === "rasterPolygonLasso" ||
    tool === "rasterMagicWand" ||
    tool === "rasterQuickSelection" ||
    tool === "rasterHealing" ||
    tool === "rasterClone" ||
    tool === "hand"
  );
}

/**
 * UI session for Raster Studio. Document truth stays in the engine store;
 * this only tracks whether the studio shell is open.
 */
export const useRasterStudioSession = create<RasterStudioSessionState>((set) => ({
  open: false,
  payload: null,
  dirty: false,
  saving: false,
  error: null,
  studioTool: DEFAULT_STUDIO_TOOL,
  openFromImage: (image) => {
    const payload = buildRasterStudioOpenPayload(image);
    const hasOverlays = Boolean(
      (payload.rasterMask?.length ?? 0) > 0 ||
        (payload.rasterEdits?.length ?? 0) > 0 ||
        (payload.adjustments && Object.keys(payload.adjustments).length > 0) ||
        (payload.filterBlur ?? 0) > 0,
    );
    set({
      open: true,
      payload,
      dirty: hasOverlays,
      saving: false,
      error: null,
      studioTool: DEFAULT_STUDIO_TOOL,
    });
  },
  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  setStudioTool: (studioTool) => set({ studioTool }),
  close: () =>
    set({
      open: false,
      payload: null,
      dirty: false,
      saving: false,
      error: null,
      studioTool: DEFAULT_STUDIO_TOOL,
    }),
}));

export function openRasterStudioForElement(image: ImageElement) {
  useRasterStudioSession.getState().openFromImage(image);
}
