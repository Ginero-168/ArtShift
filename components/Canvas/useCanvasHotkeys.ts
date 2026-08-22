"use client";

import { useEffect } from "react";
import { useEngine } from "@/lib/engine/store";
import { appendRasterMaskStroke, createRasterStroke } from "@/lib/raster/mask";
import { RASTER_TOOL_HOTKEYS } from "./rasterHotkeys";

export function handleCanvasHotkey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  ) {
    return;
  }

  const st = useEngine.getState();
  const selectedIds = st.selectedIds;

  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    const commandKey = event.key.toLowerCase();
    if (commandKey === "z") {
      event.preventDefault();
      if (event.shiftKey) st.redo();
      else st.undo();
      return;
    }
    if (commandKey === "d" && !event.shiftKey) {
      if (st.editorMode === "raster") {
        event.preventDefault();
        st.clearAllRasterSelections();
      }
      return;
    }
    if (commandKey === "y" && event.ctrlKey && !event.shiftKey) {
      event.preventDefault();
      st.redo();
      return;
    }
    return;
  }
  if (event.altKey) return;

  const brushSizeDelta = !event.shiftKey
    ? event.key === "[" || event.code === "BracketLeft"
      ? -1
      : event.key === "]" || event.code === "BracketRight"
        ? 1
        : 0
    : 0;
  if (
    brushSizeDelta !== 0 &&
    (st.tool === "rasterBrush" ||
      st.tool === "rasterPencil" ||
      st.tool === "rasterEraser" ||
      st.tool === "rasterQuickSelection")
  ) {
    event.preventDefault();
    if (st.tool === "rasterQuickSelection") {
      st.setRasterQuickSelectionSize(st.rasterQuickSelectionSize + brushSizeDelta);
    } else {
      st.setRasterBrushSize(st.rasterBrushSize + brushSizeDelta);
    }
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    // Direct Select owns Delete/Backspace while editing vector nodes.
    if (st.tool === "directSelect" || selectedIds.size === 0) return;
    event.preventDefault();

    const slide = st.currentSlide();
    const selectedRasterImages = Array.from(selectedIds).filter((id) => {
      const element = slide?.elements.find((candidate) => candidate.id === id);
      return element?.type === "image" && Boolean(st.rasterSelections[id]);
    });
    if (selectedRasterImages.length > 0) {
      const patches = selectedRasterImages.flatMap((id) => {
        const image = slide?.elements.find(
          (element): element is import("@/lib/engine/types").ImageElement =>
            element.id === id && element.type === "image",
        );
        if (!image) return [];
        const stroke = createRasterStroke(
          [[image.width / 2, image.height / 2]],
          Math.max(1, Math.hypot(image.width, image.height) * 2),
          1,
          { mode: "erase", hardness: 1, selection: st.rasterSelections[id] },
        );
        return [
          {
            id: image.id,
            patch: { rasterMask: appendRasterMaskStroke(image.rasterMask, stroke) },
          },
        ];
      });

      // A Selection must never fall through to object deletion if its mask is
      // temporarily unavailable while a bitmap mask is decoding.
      if (patches.length > 0) st.updateElements(patches, "delete selected pixels");
      return;
    }

    st.deleteElements(Array.from(selectedIds));
    return;
  }

  const key = event.key.toLowerCase();
  const match = RASTER_TOOL_HOTKEYS.find(
    (shortcut) => shortcut.key === key && Boolean(shortcut.shiftKey) === event.shiftKey,
  );
  if (!match) return;

  event.preventDefault();
  st.setTool(match.id);
}

/** Keep keyboard input intentionally scoped to the current Raster toolset. */
export function useCanvasHotkeys() {
  useEffect(() => {
    window.addEventListener("keydown", handleCanvasHotkey);
    return () => window.removeEventListener("keydown", handleCanvasHotkey);
  }, []);
}
