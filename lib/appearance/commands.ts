import type { EngineElement } from "@/lib/engine/types";
import { appearanceToLegacyPatch, readAppearance } from "./legacyAdapter";
import {
  normalizeAppearance,
  normalizeItem,
  validateAppearance,
} from "./normalize";
import type {
  Appearance,
  AppearanceError,
  AppearanceItem,
  AppearanceOperation,
} from "./types";
import { APPEARANCE_MAX_ITEMS } from "./types";

export type AppearanceChangeResult =
  | { ok: true; element: EngineElement; appearance: Appearance; changed: boolean }
  | { ok: false; error: AppearanceError };

function cloneItems(items: AppearanceItem[]): AppearanceItem[] {
  return items.map((item) => structuredClone(item));
}

function newItemId(kind: AppearanceItem["kind"]): string {
  return `${kind}:${crypto.randomUUID()}`;
}

function applyOperation(
  appearance: Appearance,
  operation: AppearanceOperation,
): { ok: true; appearance: Appearance; changed: boolean } | { ok: false; error: AppearanceError } {
  const next = normalizeAppearance({
    ...appearance,
    items: cloneItems(appearance.items),
  });

  switch (operation.type) {
    case "setRoot": {
      if (operation.patch.opacity !== undefined) next.opacity = operation.patch.opacity;
      if (operation.patch.blendMode !== undefined) next.blendMode = operation.patch.blendMode;
      break;
    }
    case "insertItem": {
      if (next.items.length >= APPEARANCE_MAX_ITEMS) {
        return {
          ok: false,
          error: {
            code: "invariant_violation",
            message: `Cannot insert: appearance already has ${APPEARANCE_MAX_ITEMS} items`,
          },
        };
      }
      const item = normalizeItem({
        ...operation.item,
        id: operation.item.id || newItemId(operation.item.kind),
      });
      if (next.items.some((existing) => existing.id === item.id)) {
        return {
          ok: false,
          error: { code: "duplicate_id", message: `Item id ${item.id} already exists` },
        };
      }
      const index =
        operation.index === undefined
          ? next.items.length
          : Math.max(0, Math.min(next.items.length, operation.index));
      next.items.splice(index, 0, item);
      break;
    }
    case "updateItem": {
      const index = next.items.findIndex((item) => item.id === operation.itemId);
      if (index < 0) {
        return {
          ok: false,
          error: { code: "item_not_found", message: `Item ${operation.itemId} not found` },
        };
      }
      const current = next.items[index];
      next.items[index] = normalizeItem({
        ...current,
        ...operation.patch,
        id: current.id,
        kind: current.kind,
      } as AppearanceItem);
      break;
    }
    case "removeItem": {
      const index = next.items.findIndex((item) => item.id === operation.itemId);
      if (index < 0) {
        return {
          ok: false,
          error: { code: "item_not_found", message: `Item ${operation.itemId} not found` },
        };
      }
      next.items.splice(index, 1);
      break;
    }
    case "moveItem": {
      const from = next.items.findIndex((item) => item.id === operation.itemId);
      if (from < 0) {
        return {
          ok: false,
          error: { code: "item_not_found", message: `Item ${operation.itemId} not found` },
        };
      }
      if (operation.toIndex < 0 || operation.toIndex >= next.items.length) {
        return {
          ok: false,
          error: { code: "invalid_index", message: `Invalid move index ${operation.toIndex}` },
        };
      }
      const [item] = next.items.splice(from, 1);
      next.items.splice(operation.toIndex, 0, item);
      break;
    }
    case "duplicateItem": {
      if (next.items.length >= APPEARANCE_MAX_ITEMS) {
        return {
          ok: false,
          error: {
            code: "invariant_violation",
            message: `Cannot duplicate: appearance already has ${APPEARANCE_MAX_ITEMS} items`,
          },
        };
      }
      const index = next.items.findIndex((item) => item.id === operation.itemId);
      if (index < 0) {
        return {
          ok: false,
          error: { code: "item_not_found", message: `Item ${operation.itemId} not found` },
        };
      }
      const copy = normalizeItem({
        ...structuredClone(next.items[index]),
        id: newItemId(next.items[index].kind),
      });
      next.items.splice(index + 1, 0, copy);
      break;
    }
    default:
      return {
        ok: false,
        error: { code: "unsupported_operation", message: "Unknown appearance operation" },
      };
  }

  const error = validateAppearance(next);
  if (error) return { ok: false, error };
  return { ok: true, appearance: next, changed: true };
}

/**
 * Pure Appearance command: read legacy fields → apply operation → write legacy patch.
 * Store integration (`updateAppearance`) lands in Phase 3.
 */
export function changeAppearance(
  element: EngineElement,
  operation: AppearanceOperation,
): AppearanceChangeResult {
  const snapshot = readAppearance(element);
  const applied = applyOperation(snapshot, operation);
  if (!applied.ok) return applied;

  const patch = appearanceToLegacyPatch(applied.appearance);
  const nextElement = { ...element, ...patch } as EngineElement;
  return {
    ok: true,
    element: nextElement,
    appearance: applied.appearance,
    changed: applied.changed,
  };
}
