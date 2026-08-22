export type SelectionModifierEvent = Pick<MouseEvent, "shiftKey" | "metaKey" | "ctrlKey">;

/** Shift/Command on macOS and Shift/Ctrl on Windows/Linux toggle selection. */
export function isSelectionModifierPressed(event: SelectionModifierEvent): boolean {
  return event.shiftKey || event.metaKey || event.ctrlKey;
}

/** Replace or toggle a set of object ids without mutating the current selection. */
export function applySelection(
  current: ReadonlySet<string>,
  ids: readonly string[],
  additive: boolean,
): Set<string> {
  if (!additive) return new Set(ids);
  if (!ids.length) return new Set(current);

  const next = new Set(current);
  const allSelected = ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }
  return next;
}

/** Keep a multi-selection intact while the pointer gesture may become a move. */
export function shouldPreserveMultiSelectionForDrag(
  current: ReadonlySet<string>,
  hitId: string,
  additive: boolean,
): boolean {
  return !additive && current.size > 1 && current.has(hitId);
}
