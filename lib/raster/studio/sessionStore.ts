"use client";

import { create } from "zustand";
import {
  buildRasterStudioOpenPayload,
  type RasterStudioOpenPayload,
} from "@/lib/raster/studio/types";
import type { ImageElement } from "@/lib/engine/types";

type RasterStudioSessionState = {
  open: boolean;
  payload: RasterStudioOpenPayload | null;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  openFromImage: (image: ImageElement) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  close: () => void;
};

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
    });
  },
  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  close: () =>
    set({
      open: false,
      payload: null,
      dirty: false,
      saving: false,
      error: null,
    }),
}));

export function openRasterStudioForElement(image: ImageElement) {
  useRasterStudioSession.getState().openFromImage(image);
}
