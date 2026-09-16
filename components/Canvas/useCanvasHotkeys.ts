"use client";

import { useEffect } from "react";
import { useEngine } from "@/lib/engine/store";
import { selectionForImage } from "@/lib/raster/activeSelection";
import { appendRasterMaskStroke, createRasterStroke } from "@/lib/raster/mask";
import { RASTER_TOOL_HOTKEYS, VECTOR_TOOL_HOTKEYS } from "./rasterHotkeys";

/** True when the event target is (or is inside) a text-editing field. */
export function isEditableHotkeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
    return true;
  }
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

/**
 * Layout-independent letter from KeyboardEvent.code (KeyZ -> "z").
 * Prefer this over event.key so Thai/other IME layouts still trigger shortcuts.
 */
export function letterFromKeyboardEvent(event: KeyboardEvent): string | null {
  const match = /^Key([A-Z])$/.exec(event.code);
  return match ? match[1].toLowerCase() : null;
}

export function handleCanvasHotkey(event: KeyboardEvent) {
  if (isEditableHotkeyTarget(event.target)) return;

  const st = useEngine.getState();
  const selectedIds = st.selectedIds;
  const mod = event.metaKey || event.ctrlKey;
  const letter = letterFromKeyboardEvent(event);

  if (mod && !event.altKey) {
    // Undo / Redo — always use physical KeyZ / KeyY (IME-safe).
    if (event.code === "KeyZ") {
      event.preventDefault();
      if (event.shiftKey) st.redo();
      else st.undo();
      return;
    }
    if (event.code === "KeyY" && event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      st.redo();
      return;
    }
    if (event.code === "KeyA" && !event.shiftKey) {
      event.preventDefault();
      st.selectAll();
      return;
    }
    if (event.code === "KeyC" && !event.shiftKey) {
      if (selectedIds.size === 0) return;
      event.preventDefault();
      st.copyElements(Array.from(selectedIds));
      return;
    }
    if (event.code === "KeyX" && !event.shiftKey) {
      if (selectedIds.size === 0) return;
      event.preventDefault();
      st.cutElements(Array.from(selectedIds));
      return;
    }
    if (event.code === "KeyV" && !event.shiftKey) {
      event.preventDefault();
      st.pasteElements();
      return;
    }
    if (event.code === "KeyD" && !event.shiftKey) {
      event.preventDefault();
      if (st.editorMode === "raster") {
        st.clearAllRasterSelections();
      } else if (selectedIds.size > 0) {
        st.copyElements(Array.from(selectedIds));
        st.pasteElements();
      }
      return;
    }
    return;
  }

  if (event.altKey) return;

  const brushSizeDelta = !event.shiftKey
    ? event.code === "BracketLeft" || event.key === "["
      ? -1
      : event.code === "BracketRight" || event.key === "]"
        ? 1
        : 0
    : 0;
  if (
    brushSizeDelta !== 0 &&
    (st.tool === "rasterBrush" ||
      st.tool === "rasterPencil" ||
      st.tool === "rasterEraser" ||
      st.tool === "rasterQuickSelection" ||
      st.tool === "rasterHealing" ||
      st.tool === "rasterClone")
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
      return element?.type === "image" && Boolean(selectionForImage(st.activeRasterSelection, id));
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
          {
            mode: "erase",
            hardness: 1,
            selection: selectionForImage(st.activeRasterSelection, id),
          },
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

  if (event.code === "Escape") {
    if (selectedIds.size === 0 && !st.activeRasterSelection) return;
    event.preventDefault();
    if (st.activeRasterSelection) st.clearAllRasterSelections();
    st.selectOnly([]);
    return;
  }

  if (!letter) return;
  const toolHotkeys = st.editorMode === "raster" ? RASTER_TOOL_HOTKEYS : VECTOR_TOOL_HOTKEYS;
  const match = toolHotkeys.find(
    (shortcut) => shortcut.key === letter && Boolean(shortcut.shiftKey) === event.shiftKey,
  );
  if (!match) return;

  event.preventDefault();
  st.setTool(match.id);
}

/** Canvas / editor keyboard shortcuts (undo, clipboard, tools, delete). */
export function useCanvasHotkeys() {
  useEffect(() => {
    window.addEventListener("keydown", handleCanvasHotkey);
    return () => window.removeEventListener("keydown", handleCanvasHotkey);
  }, []);
}
