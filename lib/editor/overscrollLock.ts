/**
 * Scoped lock so Mac trackpad 2-finger horizontal swipe pans (or is absorbed)
 * instead of triggering browser Back/Forward while the editor is mounted.
 *
 * CSS `overscroll-behavior-x: none` on html/body covers Chrome/Firefox.
 * Safari's history swipe can ignore that property, so we also preventDefault
 * cancelable wheel events with a dominant deltaX (non-passive listener).
 */

export const EDITOR_OVERSCROLL_LOCK_CLASS = "editor-overscroll-lock";

export function applyEditorOverscrollLock(
  html: HTMLElement = document.documentElement,
  body: HTMLElement = document.body,
): void {
  html.classList.add(EDITOR_OVERSCROLL_LOCK_CLASS);
  body.classList.add(EDITOR_OVERSCROLL_LOCK_CLASS);
}

export function releaseEditorOverscrollLock(
  html: HTMLElement = document.documentElement,
  body: HTMLElement = document.body,
): void {
  html.classList.remove(EDITOR_OVERSCROLL_LOCK_CLASS);
  body.classList.remove(EDITOR_OVERSCROLL_LOCK_CLASS);
}

/** True when a nested overflow-x scroller can still consume this deltaX. */
export function canConsumeHorizontalWheel(target: EventTarget | null, deltaX: number): boolean {
  if (!(target instanceof Element) || deltaX === 0) return false;
  let el: Element | null = target;
  while (el && el !== document.documentElement && el !== document.body) {
    if (elementCanScrollX(el, deltaX)) return true;
    el = el.parentElement;
  }
  return false;
}

function elementCanScrollX(el: Element, deltaX: number): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  const overflowX = style.overflowX;
  if (overflowX !== "auto" && overflowX !== "scroll") return false;
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  // Wheel deltaX > 0 typically increases scrollLeft (content moves left).
  if (deltaX > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true;
  if (deltaX < 0 && el.scrollLeft > 0) return true;
  return false;
}

/**
 * Horizontal trackpad swipe that would otherwise become history navigation.
 * Pinch-zoom (ctrl/meta) and mostly-vertical pans are left alone.
 */
export function isHistoryNavigationWheel(
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "ctrlKey" | "metaKey">,
): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  if (event.deltaX === 0) return false;
  return Math.abs(event.deltaX) >= Math.abs(event.deltaY);
}

export function shouldPreventHistoryNavigationWheel(
  event: Pick<WheelEvent, "deltaX" | "deltaY" | "ctrlKey" | "metaKey" | "target">,
): boolean {
  if (!isHistoryNavigationWheel(event)) return false;
  return !canConsumeHorizontalWheel(event.target, event.deltaX);
}

export function preventHistoryNavigationWheel(
  event: Pick<WheelEvent, "cancelable" | "preventDefault">,
): boolean {
  if (event.cancelable === false) return false;
  event.preventDefault();
  return true;
}

/** Workspace/canvas: absorb every wheel so pan/zoom owns the gesture. */
export function absorbWorkspaceWheel(event: Pick<WheelEvent, "cancelable" | "preventDefault">): void {
  preventHistoryNavigationWheel(event);
}

export function onEditorChromeWheel(event: WheelEvent): void {
  if (!shouldPreventHistoryNavigationWheel(event)) return;
  preventHistoryNavigationWheel(event);
}
