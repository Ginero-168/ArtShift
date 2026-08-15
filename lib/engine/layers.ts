import {
  type BlockRect,
  blockPlacementForRect,
  blockRectForPlacement,
  getHexGridDimensions,
  normalizeBlockPlacement,
  REFERENCE_HEX_GRID,
  reflowBlockItems,
  remapBlockPlacement,
} from "./hexLayout";
import { fitMediaElementToRect, isMediaElement } from "./mediaLayout";
import {
  type BlockPlacement,
  ENGINE_SCHEMA_VERSION,
  type EngineDoc,
  type EngineElement,
  type EngineLayer,
  type EngineSlide,
  type LayerMode,
  type WorkspaceStrictness,
} from "./types";

export function createEngineLayer(
  mode: LayerMode,
  options: Partial<Pick<EngineLayer, "name" | "z" | "visible" | "locked">> = {},
): EngineLayer {
  return {
    id: crypto.randomUUID(),
    name: options.name ?? (mode === "block" ? "Block layer" : "Free layer"),
    mode,
    objectIds: [],
    placements: {},
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    z: options.z ?? 1,
  };
}

/** Normalize persisted documents and migrate their Block grid when the schema changes. */
export function normalizeDocumentLayers(doc: EngineDoc): EngineDoc {
  const sourceVersion = doc.schemaVersion ?? 1;
  const legacyGrid = sourceVersion < 2;
  const adaptiveGridMigration = sourceVersion < 3;
  const mediaGeometryMigration = sourceVersion < 4;
  const strictness = normalizeStrictness(doc.workspaceStrictness);
  return {
    ...doc,
    schemaVersion: ENGINE_SCHEMA_VERSION,
    workspaceStrictness: strictness,
    slides: doc.slides.map((slide) => {
      let normalized = normalizeSlideLayers(slide, legacyGrid, adaptiveGridMigration);
      if (mediaGeometryMigration) {
        normalized = {
          ...normalized,
          elements: normalized.elements.map((element) =>
            isMediaElement(element)
              ? ({
                  ...element,
                  ...fitMediaElementToRect(element, element),
                  version: element.version + 1,
                } as EngineElement)
              : element,
          ),
        };
      }
      return adaptiveGridMigration || mediaGeometryMigration
        ? reflowBlockObjects(normalized, strictness)
        : normalized;
    }),
  };
}

export function normalizeSlideLayers(
  slide: EngineSlide,
  legacyGrid = false,
  adaptiveGridMigration = false,
): EngineSlide {
  const elements = slide.elements ?? [];
  const elementIds = new Set(elements.map((element) => element.id));
  const inputLayers = Array.isArray(slide.layers) ? slide.layers : [];
  const targetGrid = getHexGridDimensions(slide.width, slide.height);

  if (!inputLayers.length) {
    return migrateObjectOwnedPlacement(slide, legacyGrid, adaptiveGridMigration);
  }

  const claimed = new Set<string>();
  const layers = inputLayers.map((layer, index) => {
    const objectIds = (layer.objectIds ?? []).filter((id) => {
      if (!elementIds.has(id) || claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    const placements: Record<string, BlockPlacement> = {};
    if (layer.mode === "block") {
      for (const id of objectIds) {
        const element = elements.find((candidate) => candidate.id === id);
        const existing = layer.placements?.[id] ?? element?.bento;
        if (existing) {
          const referencePlacement =
            legacyGrid && element?.bento ? expandLegacyPlacement(existing) : existing;
          placements[id] = adaptiveGridMigration
            ? remapBlockPlacement(referencePlacement, REFERENCE_HEX_GRID, targetGrid)
            : normalizeBlockPlacement(referencePlacement, targetGrid);
        }
      }
    }
    return {
      id: layer.id || crypto.randomUUID(),
      name: layer.name || `${layer.mode === "block" ? "Block" : "Free"} layer ${index + 1}`,
      mode: layer.mode === "block" ? "block" : "free",
      objectIds,
      placements,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      z: Number.isFinite(layer.z) ? layer.z : index + 1,
    } satisfies EngineLayer;
  });

  const orphans = elements.filter((element) => !claimed.has(element.id));
  if (orphans.length) {
    const orphanLayer = createEngineLayer("free", {
      name: "Recovered objects",
      z: nextLayerZ(layers),
    });
    orphanLayer.objectIds = orphans.map((element) => element.id);
    layers.push(orphanLayer);
  }

  return {
    ...slide,
    layers,
    elements: elements.map(stripLegacyPlacement),
  };
}

export function getLayerForObject(
  slide: Pick<EngineSlide, "layers">,
  objectId: string,
): EngineLayer | undefined {
  return slide.layers.find((layer) => layer.objectIds.includes(objectId));
}

export function getLayerObjects(slide: EngineSlide, layerId: string): EngineElement[] {
  const layer = slide.layers.find((candidate) => candidate.id === layerId);
  if (!layer) return [];
  const byId = new Map(slide.elements.map((element) => [element.id, element]));
  return layer.objectIds.flatMap((id) => {
    const element = byId.get(id);
    return element && !element.isDeleted ? [element] : [];
  });
}

/** Render order is Layer order first and Object order inside each Layer. */
export function getRenderableElements(slide: EngineSlide): EngineElement[] {
  const byId = new Map(slide.elements.map((element) => [element.id, element]));
  const owned = new Set<string>();
  const ordered: EngineElement[] = [];
  const layers = [...slide.layers].sort((a, b) => a.z - b.z);
  for (const layer of layers) {
    for (const id of layer.objectIds) owned.add(id);
    if (!layer.visible) continue;
    const objects = layer.objectIds
      .flatMap((id) => {
        const element = byId.get(id);
        return element && !element.isDeleted ? [element] : [];
      })
      .sort((a, b) => a.z - b.z);
    ordered.push(...objects);
  }
  // Recovery path for malformed in-memory slides before normalization runs.
  ordered.push(
    ...slide.elements
      .filter((element) => !owned.has(element.id) && !element.isDeleted)
      .sort((a, b) => a.z - b.z),
  );
  return ordered;
}

export function getInteractiveElements(slide: EngineSlide): EngineElement[] {
  const lockedIds = new Set(
    slide.layers.filter((layer) => layer.locked).flatMap((layer) => layer.objectIds),
  );
  return getRenderableElements(slide).filter((element) => !lockedIds.has(element.id));
}

export function isObjectVisible(slide: EngineSlide, objectId: string): boolean {
  const layer = getLayerForObject(slide, objectId);
  return layer ? layer.visible : true;
}

export function isObjectLocked(slide: EngineSlide, objectId: string): boolean {
  return getLayerForObject(slide, objectId)?.locked ?? false;
}

export function addObjectToLayer(
  slide: EngineSlide,
  element: EngineElement,
  layerId: string,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const fallback = slide.layers[0] ?? createEngineLayer("block", { name: "Block layer 1" });
  const layers = slide.layers.length ? slide.layers : [fallback];
  const target = layers.find((layer) => layer.id === layerId) ?? fallback;
  const strippedElement = stripLegacyPlacement(element);
  const cleanElement = isMediaElement(strippedElement)
    ? ({
        ...strippedElement,
        ...fitMediaElementToRect(strippedElement, strippedElement),
      } as EngineElement)
    : strippedElement;
  let next: EngineSlide = {
    ...slide,
    layers: layers.map((layer) =>
      layer.id === target.id
        ? {
            ...layer,
            objectIds: layer.objectIds.includes(cleanElement.id)
              ? layer.objectIds
              : [...layer.objectIds, cleanElement.id],
            placements:
              layer.mode === "block"
                ? {
                    ...layer.placements,
                    [cleanElement.id]: blockPlacementForRect(
                      cleanElement,
                      slide.width,
                      slide.height,
                      placementSeed(cleanElement),
                    ),
                  }
                : layer.placements,
          }
        : layer,
    ),
    elements: [...slide.elements, cleanElement],
  };
  if (target.mode === "block") {
    next = reflowBlockObjects(next, strictness, {
      anchorId: cleanElement.id,
      anchorRect: cleanElement,
    });
  }
  return next;
}

export function commitBlockObject(
  slide: EngineSlide,
  objectId: string,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const layer = getLayerForObject(slide, objectId);
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (layer?.mode !== "block" || !element) return slide;
  return reflowBlockObjects(slide, strictness, { anchorId: objectId, anchorRect: element });
}

export function setBlockPlacement(
  slide: EngineSlide,
  objectId: string,
  patch: Partial<BlockPlacement>,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const layer = getLayerForObject(slide, objectId);
  const current = layer?.placements[objectId];
  if (layer?.mode !== "block" || !current) return slide;
  const placement = normalizeBlockPlacement(
    { ...current, ...patch },
    getHexGridDimensions(slide.width, slide.height),
  );
  const next = {
    ...slide,
    layers: slide.layers.map((candidate) =>
      candidate.id === layer.id
        ? { ...candidate, placements: { ...candidate.placements, [objectId]: placement } }
        : candidate,
    ),
  };
  return reflowBlockObjects(next, strictness, { anchorId: objectId, anchorPlacement: placement });
}

export function convertLayerMode(
  slide: EngineSlide,
  layerId: string,
  mode: LayerMode,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const layer = slide.layers.find((candidate) => candidate.id === layerId);
  if (!layer || layer.mode === mode) return slide;
  if (mode === "free") {
    return {
      ...slide,
      layers: slide.layers.map((candidate) =>
        candidate.id === layerId ? { ...candidate, mode, placements: {} } : candidate,
      ),
    };
  }

  const byId = new Map(slide.elements.map((element) => [element.id, element]));
  const placements: Record<string, BlockPlacement> = {};
  for (const id of layer.objectIds) {
    const element = byId.get(id);
    if (!element || element.isDeleted) continue;
    placements[id] = blockPlacementForRect(
      element,
      slide.width,
      slide.height,
      placementSeed(element),
    );
  }
  return reflowBlockObjects(
    {
      ...slide,
      layers: slide.layers.map((candidate) =>
        candidate.id === layerId ? { ...candidate, mode, placements } : candidate,
      ),
    },
    strictness,
  );
}

export function moveObjectsToLayer(
  slide: EngineSlide,
  objectIds: string[],
  layerId: string,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const target = slide.layers.find((layer) => layer.id === layerId);
  if (!target || !objectIds.length) return slide;
  const ids = new Set(objectIds);
  const byId = new Map(slide.elements.map((element) => [element.id, element]));
  const layers = slide.layers.map((layer) => {
    const placements = { ...layer.placements };
    for (const id of ids) delete placements[id];
    const retained = layer.objectIds.filter((id) => !ids.has(id));
    if (layer.id !== target.id) return { ...layer, objectIds: retained, placements };
    const nextPlacements = { ...placements };
    if (layer.mode === "block") {
      for (const id of ids) {
        const element = byId.get(id);
        if (!element || element.isDeleted) continue;
        nextPlacements[id] = blockPlacementForRect(
          element,
          slide.width,
          slide.height,
          placementSeed(element),
        );
      }
    }
    return {
      ...layer,
      objectIds: [...retained, ...[...ids].filter((id) => byId.has(id))],
      placements: nextPlacements,
    };
  });
  const next = { ...slide, layers };
  return target.mode === "block" ? reflowBlockObjects(next, strictness) : next;
}

export function reflowBlockObjects(
  slide: EngineSlide,
  strictness: WorkspaceStrictness,
  options: {
    anchorId?: string;
    anchorRect?: BlockRect;
    anchorPlacement?: BlockPlacement;
  } = {},
): EngineSlide {
  const grid = getHexGridDimensions(slide.width, slide.height);
  const items: Array<{ id: string; placement: BlockPlacement }> = [];
  for (const layer of slide.layers) {
    if (layer.mode !== "block") continue;
    for (const id of layer.objectIds) {
      const element = slide.elements.find(
        (candidate) => candidate.id === id && !candidate.isDeleted,
      );
      if (!element) continue;
      const placement = layer.placements[id]
        ? normalizeBlockPlacement(layer.placements[id], grid)
        : blockPlacementForRect(element, slide.width, slide.height, placementSeed(element));
      items.push({ id, placement });
    }
  }
  if (!items.length) return slide;
  const anchorItem = options.anchorId
    ? items.find((item) => item.id === options.anchorId)
    : undefined;
  const anchorPlacement =
    options.anchorPlacement ??
    (anchorItem && options.anchorRect
      ? blockPlacementForRect(options.anchorRect, slide.width, slide.height, anchorItem.placement)
      : undefined);
  const result = reflowBlockItems(items, {
    anchorId: anchorItem?.id,
    anchorPlacement,
    strictness,
    grid,
  });
  const layers = slide.layers.map((layer) => {
    if (layer.mode !== "block") return layer;
    const placements = { ...layer.placements };
    for (const id of layer.objectIds) {
      const placement = result.placements.get(id);
      if (placement) placements[id] = placement;
    }
    return { ...layer, placements };
  });
  const elements = slide.elements.map((element) => {
    const placement = result.placements.get(element.id);
    if (!placement) return element;
    const placementRect = blockRectForPlacement(placement, slide.width, slide.height);
    const geometry = isMediaElement(element)
      ? fitMediaElementToRect(element, placementRect)
      : placementRect;
    return {
      ...element,
      ...geometry,
      version: element.version + 1,
    } as EngineElement;
  });
  return { ...slide, layers, elements };
}

/** Remap every Block Layer before reflowing into a differently-shaped Artwork. */
export function remapBlockLayersToArtwork(
  slide: EngineSlide,
  width: number,
  height: number,
): EngineSlide {
  const from = getHexGridDimensions(slide.width, slide.height);
  const to = getHexGridDimensions(width, height);
  return {
    ...slide,
    width,
    height,
    layers: slide.layers.map((layer) => {
      if (layer.mode !== "block") return layer;
      return {
        ...layer,
        placements: Object.fromEntries(
          Object.entries(layer.placements).map(([id, placement]) => [
            id,
            remapBlockPlacement(placement, from, to),
          ]),
        ),
      };
    }),
  };
}

export function normalizeStrictness(value: unknown): WorkspaceStrictness {
  return value === 2 || value === 3 ? value : 1;
}

function migrateObjectOwnedPlacement(
  slide: EngineSlide,
  legacyGrid: boolean,
  adaptiveGridMigration: boolean,
): EngineSlide {
  if (!slide.elements.length) {
    return {
      ...slide,
      elements: [],
      layers: [createEngineLayer("block", { name: "Block layer 1" })],
    };
  }

  const groups = new Map<
    string,
    { mode: LayerMode; visible: boolean; locked: boolean; ids: string[] }
  >();
  for (const element of slide.elements) {
    const mode: LayerMode = element.bento ? "block" : "free";
    const visible = element.visible !== false;
    const locked = element.locked === true;
    const key = `${mode}:${visible}:${locked}`;
    const group = groups.get(key) ?? { mode, visible, locked, ids: [] };
    group.ids.push(element.id);
    groups.set(key, group);
  }

  let z = 1;
  let blockIndex = 0;
  let freeIndex = 0;
  const targetGrid = getHexGridDimensions(slide.width, slide.height);
  const layers: EngineLayer[] = [];
  for (const group of groups.values()) {
    const index = group.mode === "block" ? ++blockIndex : ++freeIndex;
    const layer = createEngineLayer(group.mode, {
      name: `${group.mode === "block" ? "Block" : "Free"} layer ${index}`,
      visible: group.visible,
      locked: group.locked,
      z: z++,
    });
    layer.objectIds = group.ids;
    if (group.mode === "block") {
      for (const id of group.ids) {
        const element = slide.elements.find((candidate) => candidate.id === id);
        if (!element?.bento) continue;
        const referencePlacement = legacyGrid
          ? expandLegacyPlacement(element.bento)
          : element.bento;
        layer.placements[id] = adaptiveGridMigration
          ? remapBlockPlacement(referencePlacement, REFERENCE_HEX_GRID, targetGrid)
          : normalizeBlockPlacement(referencePlacement, targetGrid);
      }
    }
    layers.push(layer);
  }

  return {
    ...slide,
    layers,
    elements: slide.elements.map((element) => ({
      ...stripLegacyPlacement(element),
      visible: true,
      locked: false,
    })),
  };
}

function expandLegacyPlacement(placement: BlockPlacement): BlockPlacement {
  return {
    ...placement,
    col: placement.col * 2,
    colSpan: placement.colSpan * 2,
    minColSpan: placement.minColSpan ? placement.minColSpan * 2 : undefined,
  };
}

function stripLegacyPlacement(element: EngineElement): EngineElement {
  if (!element.bento) return element;
  const { bento: _bento, ...rest } = element;
  return {
    ...rest,
    builderKind: element.builderKind ?? element.bento.kind,
  } as EngineElement;
}

function placementSeed(element: EngineElement): BlockPlacement {
  return {
    col: 0,
    row: 0,
    colSpan: 1,
    rowSpan: 1,
    kind: element.builderKind,
  };
}

function nextLayerZ(layers: EngineLayer[]) {
  return layers.reduce((max, layer) => Math.max(max, layer.z), 0) + 1;
}
