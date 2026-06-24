"use client";

import { useEffect } from "react";
import { useEngine } from "@/lib/engine/store";
import { ALL_TOOLS } from "./toolDefinitions";

export function useCanvasHotkeys(onSearchOpen: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

      const st = useEngine.getState();
      const selectedIds = st.selectedIds;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "c") {
        e.preventDefault();
        st.copyElements(Array.from(selectedIds));
        return;
      }
      if (meta && e.key.toLowerCase() === "v") {
        e.preventDefault();
        st.pasteElements();
        return;
      }
      if (meta && e.key.toLowerCase() === "x") {
        if (selectedIds.size) {
          e.preventDefault();
          st.cutElements(Array.from(selectedIds));
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        st.selectAll();
        return;
      }
      if (meta && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onSearchOpen();
        return;
      }
      if (e.key === "]" || e.key === "[") {
        if (!selectedIds.size) return;
        e.preventDefault();
        const ids = Array.from(selectedIds);
        if (meta) {
          if (e.key === "]") st.bringToFront(ids);
          else st.sendToBack(ids);
        } else {
          if (e.key === "]") st.bringForward(ids);
          else st.sendBackward(ids);
        }
        return;
      }
      if (meta && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) st.ungroupElements(Array.from(selectedIds));
        else st.groupElements(Array.from(selectedIds));
        return;
      }
      if (meta && e.key === "'") {
        e.preventDefault();
        const next = st.doc.snapGrid ? null : 20;
        st.setGridSnap(next);
        return;
      }
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.copyElements(Array.from(selectedIds));
        st.pasteElements();
        return;
      }
      if (e.key.startsWith("Arrow") && selectedIds.size) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const slide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
        if (slide) {
          const patches = slide.elements
            .filter((el) => selectedIds.has(el.id) && !el.locked)
            .map((el) => ({ id: el.id, patch: { x: el.x + dx, y: el.y + dy } }));
          if (patches.length) st.updateElements(patches, "nudge");
        }
        return;
      }
      if (e.shiftKey && (e.key === "H" || e.key === "h") && selectedIds.size) {
        e.preventDefault();
        st.flipHorizontal(Array.from(selectedIds));
        return;
      }
      if (e.shiftKey && (e.key === "V" || e.key === "v") && selectedIds.size) {
        e.preventDefault();
        st.flipVertical(Array.from(selectedIds));
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.size) {
          e.preventDefault();
          st.deleteElements(Array.from(selectedIds));
        }
        return;
      }
      const k = e.key.toLowerCase();
      const found = ALL_TOOLS.find((tt) => tt.hotkey.toLowerCase() === k);
      if (found) st.setTool(found.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearchOpen]);
}
