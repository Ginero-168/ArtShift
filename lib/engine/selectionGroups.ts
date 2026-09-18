import type { EngineElement } from "./types";

export type SelectionGroupAnalysis = {
  /** Two or more top-level units (groups and/or loose objects) can be combined. */
  canGroup: boolean;
  /** Selection is exactly one existing group — peel one groupIds level. */
  canUngroup: boolean;
  isSingleGroup: boolean;
  unitCount: number;
};

/**
 * Decide Group vs Ungroup for a multi-selection.
 * - One group (shared top groupId) → Ungroup only
 * - Multiple groups, or group + objects, or loose objects → Group
 */
export function analyzeSelectionGroups(selected: readonly EngineElement[]): SelectionGroupAnalysis {
  if (selected.length < 2) {
    return {
      canGroup: false,
      canUngroup: false,
      isSingleGroup: false,
      unitCount: selected.length,
    };
  }

  const units = new Map<string, number>();
  for (const element of selected) {
    const top = element.groupIds?.at(-1);
    const key = top ? `g:${top}` : `e:${element.id}`;
    units.set(key, (units.get(key) ?? 0) + 1);
  }

  const unitCount = units.size;
  const isSingleGroup =
    unitCount === 1 && selected.every((element) => (element.groupIds?.length ?? 0) > 0);

  return {
    canGroup: unitCount >= 2,
    canUngroup: isSingleGroup,
    isSingleGroup,
    unitCount,
  };
}

export type LayerTreeNode =
  | { kind: "element"; element: EngineElement }
  | {
      kind: "group";
      groupId: string;
      label: string;
      children: LayerTreeNode[];
      memberIds: string[];
    };

/** Nest canvas objects by groupIds (outer → inner) while preserving z-order. */
export function buildLayerHierarchy(elements: readonly EngineElement[]): LayerTreeNode[] {
  return nestByGroupDepth(elements, 0);
}

function nestByGroupDepth(elements: readonly EngineElement[], depth: number): LayerTreeNode[] {
  const nodes: LayerTreeNode[] = [];
  const groupMembers = new Map<string, EngineElement[]>();
  const order: Array<{ type: "group"; id: string } | { type: "element"; element: EngineElement }> =
    [];

  for (const element of elements) {
    const groupId = element.groupIds?.[depth];
    if (!groupId) {
      order.push({ type: "element", element });
      continue;
    }
    if (!groupMembers.has(groupId)) {
      groupMembers.set(groupId, []);
      order.push({ type: "group", id: groupId });
    }
    groupMembers.get(groupId)!.push(element);
  }

  let groupIndex = 0;
  for (const item of order) {
    if (item.type === "element") {
      nodes.push({ kind: "element", element: item.element });
      continue;
    }
    groupIndex += 1;
    const members = groupMembers.get(item.id) ?? [];
    const children = nestByGroupDepth(members, depth + 1);
    nodes.push({
      kind: "group",
      groupId: item.id,
      label: `Group ${groupIndex}`,
      children,
      memberIds: members.map((member) => member.id),
    });
  }

  return nodes;
}
