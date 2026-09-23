"use client";

import { useEffect } from "react";
import { useEngine } from "@/lib/engine/store";
import { useRasterStudioSession } from "@/lib/raster/studio/sessionStore";
import { VECTOR_TOOL_HOTKEYS } from "./rasterHotkeys";

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
    if (useRasterStudioSession.getState().open) return;
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
      // In-app Copy/Cut clipboard wins so paste works after switching slides.
      // When empty, do not preventDefault — usePasteDrop reads the system
      // clipboard (another ArtShift tab, or Docs/Figma/OS images and text).
      if (st.clipboard?.length) {
        event.preventDefault();
        st.pasteElements();
      }
      return;
    }
    if (event.code === "KeyD" && !event.shiftKey) {
      event.preventDefault();
      if (selectedIds.size > 0) {
        st.copyElements(Array.from(selectedIds), { systemClipboard: false });
        st.pasteElements();
      }
      return;
    }
    return;
  }

  if (event.altKey) return;

  if (useRasterStudioSession.getState().open) return;

  if (event.key === "Delete" || event.key === "Backspace") {
    // Direct Select owns Delete/Backspace while editing vector nodes.
    if (st.tool === "directSelect" || selectedIds.size === 0) return;
    event.preventDefault();
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
  // Photopea owns pixel edit while a raster session is open. Main-canvas raster letters no-op.
  if (useRasterStudioSession.getState().open) return;

  const vectorMatch = VECTOR_TOOL_HOTKEYS.find(
    (shortcut) => shortcut.key === letter && Boolean(shortcut.shiftKey) === event.shiftKey,
  );
  if (vectorMatch) {
    event.preventDefault();
    st.setTool(vectorMatch.id);
  }
}

/** Canvas / editor keyboard shortcuts (undo, clipboard, tools, delete). */
export function useCanvasHotkeys() {
  useEffect(() => {
    window.addEventListener("keydown", handleCanvasHotkey);
    return () => window.removeEventListener("keydown", handleCanvasHotkey);
  }, []);
}
