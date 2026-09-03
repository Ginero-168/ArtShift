import type { EngineElement } from "./types";

type CompositionGroup = {
  kind: "composition";
  key: string;
  blockId: string;
  elements: EngineElement[];
};

export type CompositionLayerEntry = { kind: "element"; element: EngineElement } | CompositionGroup;

const COMPOSITION_BUILDER = /^composition:([^:]+):(.+)$/;

function compositionParts(element: EngineElement): { blockId: string; slotId: string } | null {
  const match = element.builderKind?.match(COMPOSITION_BUILDER);
  return match ? { blockId: match[1], slotId: match[2] } : null;
}

export function getCompositionGroup(element: EngineElement): string | null {
  const parts = compositionParts(element);
  if (!parts) return null;
  const groupId = element.groupIds?.[0];
  return groupId ? `group:${groupId}` : `builder:${parts.blockId}`;
}

export function getCompositionSlotLabel(element: EngineElement): string {
  const parts = compositionParts(element);
  const slot = parts?.slotId ?? element.name?.split(" · ").at(-1) ?? "Layer";
  return slot.replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function groupCompositionLayers(elements: EngineElement[]): CompositionLayerEntry[] {
  const entries: CompositionLayerEntry[] = [];
  const groups = new Map<string, CompositionGroup>();

  for (const element of elements) {
    const key = getCompositionGroup(element);
    if (!key) {
      entries.push({ kind: "element", element });
      continue;
    }

    let group = groups.get(key);
    if (!group) {
      const parts = compositionParts(element);
      group = {
        kind: "composition",
        key,
        blockId: parts?.blockId ?? "composition",
        elements: [],
      };
      groups.set(key, group);
      entries.push(group);
    }
    group.elements.push(element);
  }

  return entries;
}
