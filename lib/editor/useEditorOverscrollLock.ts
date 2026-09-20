"use client";

import { useLayoutEffect } from "react";
import {
  applyEditorOverscrollLock,
  onEditorChromeWheel,
  releaseEditorOverscrollLock,
} from "./overscrollLock";

/**
 * While the editor (or present) route is mounted, lock html/body overscroll
 * and absorb horizontal trackpad wheels so they cannot navigate history.
 * Removed on unmount so marketing / project list keep normal Back/Forward.
 */
export function useEditorOverscrollLock(): void {
  useLayoutEffect(() => {
    applyEditorOverscrollLock();
    // Non-passive: Chrome treats document/window wheel as passive by default.
    document.addEventListener("wheel", onEditorChromeWheel, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", onEditorChromeWheel, { capture: true });
      releaseEditorOverscrollLock();
    };
  }, []);
}
