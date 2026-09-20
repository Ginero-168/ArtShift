import { readFileSync } from "node:fs";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyEditorOverscrollLock,
  canConsumeHorizontalWheel,
  EDITOR_OVERSCROLL_LOCK_CLASS,
  isHistoryNavigationWheel,
  preventHistoryNavigationWheel,
  releaseEditorOverscrollLock,
  shouldPreventHistoryNavigationWheel,
} from "@/lib/editor/overscrollLock";
import { useEditorOverscrollLock } from "@/lib/editor/useEditorOverscrollLock";

describe("editor overscroll lock helpers", () => {
  afterEach(() => {
    releaseEditorOverscrollLock();
    document.documentElement.className = "";
    document.body.className = "";
  });

  it("applies and releases the lock class on html and body", () => {
    applyEditorOverscrollLock();
    expect(document.documentElement.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(true);
    expect(document.body.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(true);

    releaseEditorOverscrollLock();
    expect(document.documentElement.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(false);
    expect(document.body.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(false);
  });

  it("treats dominant horizontal wheels as history-navigation candidates", () => {
    expect(
      isHistoryNavigationWheel({ deltaX: 80, deltaY: 4, ctrlKey: false, metaKey: false }),
    ).toBe(true);
    expect(
      isHistoryNavigationWheel({ deltaX: 4, deltaY: 80, ctrlKey: false, metaKey: false }),
    ).toBe(false);
    expect(isHistoryNavigationWheel({ deltaX: 80, deltaY: 0, ctrlKey: true, metaKey: false })).toBe(
      false,
    );
    expect(
      isHistoryNavigationWheel({ deltaX: 0, deltaY: 12, ctrlKey: false, metaKey: false }),
    ).toBe(false);
  });

  it("preventDefault absorbs a cancelable wheel", () => {
    const preventDefault = vi.fn();
    expect(preventHistoryNavigationWheel({ cancelable: true, preventDefault })).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();

    preventDefault.mockClear();
    expect(preventHistoryNavigationWheel({ cancelable: false, preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("lets a still-scrollable overflow-x panel consume deltaX", () => {
    const scroller = document.createElement("div");
    Object.assign(scroller.style, { overflowX: "auto", width: "80px" });
    const inner = document.createElement("div");
    inner.style.width = "400px";
    scroller.appendChild(inner);
    document.body.appendChild(scroller);

    Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 80 });
    Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 400 });
    scroller.scrollLeft = 40;

    expect(canConsumeHorizontalWheel(inner, 20)).toBe(true);
    expect(canConsumeHorizontalWheel(inner, -20)).toBe(true);

    scroller.scrollLeft = 0;
    expect(canConsumeHorizontalWheel(inner, -20)).toBe(false);
    expect(
      shouldPreventHistoryNavigationWheel({
        deltaX: -40,
        deltaY: 0,
        ctrlKey: false,
        metaKey: false,
        target: inner,
      }),
    ).toBe(true);

    scroller.remove();
  });
});

describe("useEditorOverscrollLock", () => {
  afterEach(() => {
    cleanup();
    releaseEditorOverscrollLock();
    document.documentElement.classList.remove(EDITOR_OVERSCROLL_LOCK_CLASS);
    document.body.classList.remove(EDITOR_OVERSCROLL_LOCK_CLASS);
  });

  it("adds the lock class on mount and removes it on unmount", () => {
    const { unmount } = renderHook(() => useEditorOverscrollLock());

    expect(document.documentElement.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(true);
    expect(document.body.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(true);

    unmount();

    expect(document.documentElement.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(false);
    expect(document.body.classList.contains(EDITOR_OVERSCROLL_LOCK_CLASS)).toBe(false);
  });

  it("preventDefaults a horizontal wheel on the document while mounted", () => {
    const { unmount } = renderHook(() => useEditorOverscrollLock());
    const event = new WheelEvent("wheel", {
      deltaX: 60,
      deltaY: 0,
      bubbles: true,
      cancelable: true,
    });
    const prevented = !document.dispatchEvent(event);
    expect(prevented || event.defaultPrevented).toBe(true);
    unmount();
  });
});

describe("editor overscroll wiring", () => {
  it("scopes the lock to the editor and present routes", () => {
    const editor = readFileSync("app/projects/[projectId]/editor/page.tsx", "utf8");
    const present = readFileSync("app/present/page.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");
    const marketing = readFileSync("app/page.tsx", "utf8");

    expect(editor).toContain("useEditorOverscrollLock");
    expect(present).toContain("useEditorOverscrollLock");
    expect(present).toContain("absorbWorkspaceWheel");
    expect(layout).not.toContain("useEditorOverscrollLock");
    expect(marketing).not.toContain("useEditorOverscrollLock");
  });

  it("declares overscroll-behavior-x none on the editor lock class and canvas stage", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain("html.editor-overscroll-lock");
    expect(css).toContain("overscroll-behavior-x: none");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toMatch(/\.canvas-stage \{[\s\S]*overscroll-behavior-x: none/);
  });

  it("absorbs workspace wheels on the canvas viewport", () => {
    const canvasRoot = readFileSync("components/Canvas/CanvasRoot.tsx", "utf8");
    expect(canvasRoot).toContain("absorbWorkspaceWheel");
    expect(canvasRoot).toContain('data-editor-overscroll="workspace"');
    expect(canvasRoot).toContain("overscrollBehaviorX");
    expect(canvasRoot).toContain("{ passive: false }");
    expect(canvasRoot).not.toContain("history.pushState");
  });
});
