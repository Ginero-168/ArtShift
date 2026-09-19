"use client";

import { create } from "zustand";
import type { Tool } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";
import {
  buildRasterStudioOpenPayload,
  type RasterStudioOpenPayload,
} from "@/lib/raster/studio/types";

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

export const DEFAULT_STUDIO_TOOL: StudioRasterTool = "rasterBrush";
export const STUDIO_MIN_ZOOM = 0.05;
export const STUDIO_MAX_ZOOM = 16;

export function clampStudioZoom(zoom: number): number {
  return Math.min(STUDIO_MAX_ZOOM, Math.max(STUDIO_MIN_ZOOM, zoom));
}

export function fitZoomForStage(
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
  padding = 0.92,
): number {
  const width = Math.max(1, imageWidth);
  const height = Math.max(1, imageHeight);
  const availableW = Math.max(1, stageWidth);
  const availableH = Math.max(1, stageHeight);
  return clampStudioZoom(Math.min(availableW / width, availableH / height) * padding);
}

const DEFAULT_STUDIO_TOOL_HINTS: Record<StudioRasterTool, string> = {
  hand: "Drag to pan · Space also pans while held",
  rasterBrush: "Paint pixels (B) · [ / ] size",
  rasterPencil: "Hard pixels (Shift+B) · [ / ] size",
  rasterEraser: "Erase pixels (E) · [ / ] size",
  rasterMarquee: "Drag a rectangle (M) · Shift add · Alt subtract · Shift+Alt intersect",
  rasterEllipse: "Drag an ellipse (Shift+M) · Shift add · Alt subtract",
  rasterLasso: "Draw a freehand selection (L) · Shift add · Alt subtract",
  rasterPolygonLasso: "Click points · Enter or double-click to close (Shift+L)",
  rasterMagicWand: "Click similar colors (W) · Shift add · Alt subtract",
  rasterQuickSelection: "Brush-select similar pixels (Q) · [ / ] size",
  rasterHealing: "Paint to heal (J) · [ / ] size",
  rasterClone: "Alt-click to set clone source, then paint (S)",
};

export function studioToolHint(tool: StudioRasterTool): string {
  return DEFAULT_STUDIO_TOOL_HINTS[tool];
}

const RESET_VIEW = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  stageSize: { width: 0, height: 0 },
  imageSize: { width: 0, height: 0 },
  didInitialFit: false,
};

type RasterStudioSessionState = {
  open: boolean;
  payload: RasterStudioOpenPayload | null;
  dirty: boolean;
  sessionEdited: boolean;
  saving: boolean;
  error: string | null;
  studioTool: StudioRasterTool;
  zoom: number;
  pan: { x: number; y: number };
  stageSize: { width: number; height: number };
  imageSize: { width: number; height: number };
  didInitialFit: boolean;
  openFromImage: (image: ImageElement) => void;
  setDirty: (dirty: boolean) => void;
  markSessionEdited: () => void;
  setSaving: (saving: boolean) => void;
  setError: (error: string | null) => void;
  setStudioTool: (tool: StudioRasterTool) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setStageSize: (size: { width: number; height: number }) => void;
  setImageSize: (size: { width: number; height: number }) => void;
  fitView: () => void;
  actualSize: () => void;
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
 * this only tracks whether the studio shell is open and viewport chrome.
 */
export const useRasterStudioSession = create<RasterStudioSessionState>((set, get) => ({
  open: false,
  payload: null,
  dirty: false,
  sessionEdited: false,
  saving: false,
  error: null,
  studioTool: DEFAULT_STUDIO_TOOL,
  ...RESET_VIEW,
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
      sessionEdited: false,
      saving: false,
      error: null,
      studioTool: DEFAULT_STUDIO_TOOL,
      ...RESET_VIEW,
      imageSize: { width: image.width, height: image.height },
    });
  },
  setDirty: (dirty) => set({ dirty }),
  markSessionEdited: () => set({ dirty: true, sessionEdited: true }),
  setSaving: (saving) => set({ saving }),
  setError: (error) => set({ error }),
  setStudioTool: (studioTool) => set({ studioTool }),
  setZoom: (zoom) => set({ zoom: clampStudioZoom(zoom) }),
  setPan: (pan) => set({ pan }),
  setStageSize: (stageSize) => set({ stageSize }),
  setImageSize: (imageSize) => set({ imageSize }),
  fitView: () => {
    const { stageSize, imageSize } = get();
    if (
      stageSize.width < 8 ||
      stageSize.height < 8 ||
      imageSize.width < 1 ||
      imageSize.height < 1
    ) {
      return;
    }
    set({
      zoom: fitZoomForStage(stageSize.width, stageSize.height, imageSize.width, imageSize.height),
      pan: { x: 0, y: 0 },
      didInitialFit: true,
    });
  },
  actualSize: () => set({ zoom: 1, pan: { x: 0, y: 0 }, didInitialFit: true }),
  close: () =>
    set({
      open: false,
      payload: null,
      dirty: false,
      sessionEdited: false,
      saving: false,
      error: null,
      studioTool: DEFAULT_STUDIO_TOOL,
      ...RESET_VIEW,
    }),
}));

export function openRasterStudioForElement(image: ImageElement) {
  useRasterStudioSession.getState().openFromImage(image);
}
