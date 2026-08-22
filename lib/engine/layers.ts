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
    for (const orphan of orphans) {
      const mode: LayerMode = orphan.layoutMode ?? (orphan.bento ? "block" : "free");
      const orphanLayer = createEngineLayer(mode, {
        name: orphan.name || getElementDefaultName(orphan),
        z: nextLayerZ(layers),
      });
      orphanLayer.id = orphan.id;
      orphanLayer.objectIds = [orphan.id];
      if (mode === "block") {
        orphanLayer.placements[orphan.id] = normalizeBlockPlacement(
          orphan.bento ??
            blockPlacementForRect(orphan, slide.width, slide.height, placementSeed(orphan)),
          targetGrid,
        );
      }
      layers.push(orphanLayer);
    }
  }

  return {
    ...slide,
    layers,
    elements: elements.map((element) => {
      const layer = getLayerForObject({ layers }, element.id);
      const isGeneric =
        element.name &&
        (/^(Free|Block|Locked)\s+layer(\s+\d+)?$/i.test(element.name) ||
          element.name === "Recovered objects");
      const cleanName = isGeneric
        ? getElementDefaultName(element)
        : (element.name ?? getElementDefaultName(element));
      return {
        ...stripLegacyPlacement(element),
        layoutMode: element.layoutMode ?? layer?.mode ?? "block",
        name: cleanName,
        locked: element.locked === true || layer?.locked === true,
        hidden: element.hidden === true || layer?.visible === false,
      } as EngineElement;
    }),
  };
}

export function getLayerForObject(
  slide: Pick<EngineSlide, "layers">,
  objectId: string,
): EngineLayer | undefined {
  return slide.layers.find((layer) => layer.objectIds.includes(objectId) || layer.id === objectId);
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
        return element && !element.isDeleted && !element.hidden ? [element] : [];
      })
      .sort((a, b) => a.z - b.z);
    ordered.push(...objects);
  }
  ordered.push(
    ...slide.elements
      .filter((element) => !owned.has(element.id) && !element.isDeleted && !element.hidden)
      .sort((a, b) => a.z - b.z),
  );
  return ordered;
}

export function getInteractiveElements(slide: EngineSlide): EngineElement[] {
  const lockedIds = new Set(
    slide.layers.filter((layer) => layer.locked).flatMap((layer) => layer.objectIds),
  );
  return getRenderableElements(slide).filter(
    (element) =>
      !element.isDeleted &&
      element.hidden !== true &&
      element.visible !== false &&
      !lockedIds.has(element.id) &&
      !element.locked,
  );
}

export function isObjectVisible(
  slide: Pick<EngineSlide, "layers" | "elements">,
  objectId: string,
): boolean {
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (element && (element.isDeleted || element.hidden || element.visible === false)) return false;
  const layer = getLayerForObject(slide, objectId);
  return layer ? layer.visible : true;
}

export function isObjectLocked(
  slide: Pick<EngineSlide, "layers" | "elements">,
  objectId: string,
): boolean {
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (element?.locked) return true;
  const layer = getLayerForObject(slide, objectId);
  return Boolean(layer?.locked);
}

export function isObjectBlock(
  slide: Pick<EngineSlide, "layers" | "elements">,
  objectId: string,
): boolean {
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (element?.layoutMode) return element.layoutMode === "block";
  const layer = getLayerForObject(slide, objectId);
  return layer ? layer.mode === "block" : false;
}

export function setElementVisibility(
  slide: EngineSlide,
  objectId: string,
  visible: boolean,
): EngineSlide {
  return {
    ...slide,
    elements: slide.elements.map((el) =>
      el.id === objectId ? { ...el, hidden: !visible, version: el.version + 1 } : el,
    ),
    layers: slide.layers.map((layer) =>
      layer.id === objectId && layer.objectIds.length <= 1 ? { ...layer, visible } : layer,
    ),
  };
}

export function setElementLocked(
  slide: EngineSlide,
  objectId: string,
  locked: boolean,
): EngineSlide {
  return {
    ...slide,
    elements: slide.elements.map((el) =>
      el.id === objectId ? { ...el, locked, version: el.version + 1 } : el,
    ),
    layers: slide.layers.map((layer) =>
      layer.id === objectId && layer.objectIds.length <= 1 ? { ...layer, locked } : layer,
    ),
  };
}

export function toggleObjectLayoutMode(
  slide: EngineSlide,
  objectId: string,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const currentMode = isObjectBlock(slide, objectId) ? "block" : "free";
  const nextMode: LayerMode = currentMode === "block" ? "free" : "block";
  return setObjectLayoutMode(slide, objectId, nextMode, strictness);
}

export function setObjectLayoutMode(
  slide: EngineSlide,
  objectId: string,
  mode: LayerMode,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (!element) return slide;

  const currentLayer = getLayerForObject(slide, objectId);
  if (currentLayer?.mode === mode && element.layoutMode === mode) return slide;

  const grid = getHexGridDimensions(slide.width, slide.height);
  const placement =
    mode === "block"
      ? normalizeBlockPlacement(
          blockPlacementForRect(element, slide.width, slide.height, placementSeed(element)),
          grid,
        )
      : undefined;

  // 1. Update the element's layoutMode
  const nextElements = slide.elements.map((el) =>
    el.id === objectId ? { ...el, layoutMode: mode, version: el.version + 1 } : el,
  );

  // 2. Adjust layers: if currentLayer only has this 1 object, simply update its mode.
  // If currentLayer has multiple objects, detach this object into its own layer so others are NOT affected!
  let nextLayers: EngineLayer[];
  if (
    currentLayer &&
    currentLayer.objectIds.length === 1 &&
    currentLayer.objectIds[0] === objectId
  ) {
    nextLayers = slide.layers.map((layer) => {
      if (layer.id === currentLayer.id) {
        return {
          ...layer,
          mode,
          name: element.name || getElementDefaultName(element),
          placements: placement ? { [objectId]: placement } : {},
        };
      }
      return layer;
    });
  } else {
    // Detach from current layer
    const strippedLayers = slide.layers.map((layer) => {
      if (layer.objectIds.includes(objectId)) {
        const nextPlacements = { ...layer.placements };
        delete nextPlacements[objectId];
        return {
          ...layer,
          objectIds: layer.objectIds.filter((id) => id !== objectId),
          placements: nextPlacements,
        };
      }
      return layer;
    });

    const newLayer: EngineLayer = {
      id: objectId,
      name: element.name || getElementDefaultName(element),
      mode,
      objectIds: [objectId],
      placements: placement ? { [objectId]: placement } : {},
      visible: element.hidden !== true,
      locked: element.locked === true,
      z: element.z || nextLayerZ(strippedLayers),
    };
    nextLayers = [...strippedLayers, newLayer];
  }

  const nextSlide: EngineSlide = {
    ...slide,
    elements: nextElements,
    layers: nextLayers,
  };

  return mode === "block"
    ? reflowBlockObjects(nextSlide, strictness, { anchorId: objectId })
    : nextSlide;
}

export function moveElementZ(
  slide: EngineSlide,
  objectId: string,
  direction: "forward" | "backward" | "front" | "back",
): EngineSlide {
  const elements = [...slide.elements].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  const index = elements.findIndex((e) => e.id === objectId);
  if (index === -1) return slide;

  if (direction === "forward" && index < elements.length - 1) {
    const temp = elements[index];
    elements[index] = elements[index + 1];
    elements[index + 1] = temp;
  } else if (direction === "backward" && index > 0) {
    const temp = elements[index];
    elements[index] = elements[index - 1];
    elements[index - 1] = temp;
  } else if (direction === "front" && index < elements.length - 1) {
    const [item] = elements.splice(index, 1);
    elements.push(item);
  } else if (direction === "back" && index > 0) {
    const [item] = elements.splice(index, 1);
    elements.unshift(item);
  }

  const updatedElements = elements.map((el, idx) => ({
    ...el,
    z: idx + 1,
    version: (el.version ?? 0) + 1,
  }));

  // Keep layers synchronized with elements z-order
  const byId = new Map(updatedElements.map((e) => [e.id, e]));
  const nextLayers = slide.layers.map((layer) => {
    const layerObjIds = layer.objectIds.filter((id) => byId.has(id));
    layerObjIds.sort((idA, idB) => {
      const zA = byId.get(idA)?.z ?? 0;
      const zB = byId.get(idB)?.z ?? 0;
      return zA - zB;
    });
    const layerZ = layerObjIds.length
      ? Math.max(...layerObjIds.map((id) => byId.get(id)?.z ?? 1))
      : layer.z;
    return {
      ...layer,
      objectIds: layerObjIds,
      z: layerZ,
    };
  });

  return {
    ...slide,
    elements: updatedElements,
    layers: nextLayers,
  };
}

export function reorderElementsInSlide(
  slide: EngineSlide,
  sourceId: string,
  targetId: string,
): EngineSlide {
  if (sourceId === targetId) return slide;
  const elements = [...slide.elements];
  // Sort descending z (same as UI display order)
  elements.sort((a, b) => (b.z ?? 0) - (a.z ?? 0));

  const sourceIndex = elements.findIndex((el) => el.id === sourceId);
  const targetIndex = elements.findIndex((el) => el.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1) return slide;

  // Move source item to target index in the UI list
  const [moved] = elements.splice(sourceIndex, 1);
  elements.splice(targetIndex, 0, moved);

  // Now reassign z values from bottom (z=1) to top (z=elements.length)
  const total = elements.length;
  const updatedElements = elements.map((el, index) => ({
    ...el,
    z: total - index,
    version: (el.version ?? 0) + 1,
  }));

  const byId = new Map(updatedElements.map((e) => [e.id, e]));
  const nextLayers = slide.layers.map((layer) => {
    const layerObjIds = layer.objectIds.filter((id) => byId.has(id));
    layerObjIds.sort((idA, idB) => {
      const zA = byId.get(idA)?.z ?? 0;
      const zB = byId.get(idB)?.z ?? 0;
      return zA - zB;
    });
    const layerZ = layerObjIds.length
      ? Math.max(...layerObjIds.map((id) => byId.get(id)?.z ?? 1))
      : layer.z;
    return {
      ...layer,
      objectIds: layerObjIds,
      z: layerZ,
    };
  });

  return {
    ...slide,
    elements: updatedElements,
    layers: nextLayers,
  };
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

  cleanElement.layoutMode = target.mode;

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
    elements: [
      ...slide.elements.filter((candidate) => candidate.id !== cleanElement.id),
      cleanElement,
    ],
  };

  next = normalizeSlideLayers(next);
  return target.mode === "block"
    ? reflowBlockObjects(next, strictness, { anchorId: cleanElement.id })
    : next;
}

export function removeObjectFromLayer(slide: EngineSlide, objectId: string): EngineSlide {
  const next = {
    ...slide,
    layers: slide.layers.map((layer) => ({
      ...layer,
      objectIds: layer.objectIds.filter((id) => id !== objectId),
      placements: Object.fromEntries(
        Object.entries(layer.placements).filter(([id]) => id !== objectId),
      ),
    })),
  };
  return normalizeSlideLayers(next);
}

export function deleteLayer(slide: EngineSlide, layerId: string): EngineSlide {
  const remaining = slide.layers.filter((layer) => layer.id !== layerId);
  const next = {
    ...slide,
    layers: remaining,
  };
  return normalizeSlideLayers(next);
}

export function reorderLayers(slide: EngineSlide, orderedLayerIds: string[]): EngineSlide {
  const byId = new Map(slide.layers.map((layer) => [layer.id, layer]));
  const reordered: EngineLayer[] = [];
  orderedLayerIds.forEach((id, index) => {
    const layer = byId.get(id);
    if (!layer) return;
    reordered.push({ ...layer, z: index + 1 });
  });
  slide.layers.forEach((layer) => {
    if (!orderedLayerIds.includes(layer.id)) {
      reordered.push({ ...layer, z: reordered.length + 1 });
    }
  });
  return normalizeSlideLayers({ ...slide, layers: reordered });
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
      elements: slide.elements.map((el) =>
        layer.objectIds.includes(el.id) ? { ...el, layoutMode: "free" } : el,
      ),
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
      elements: slide.elements.map((el) =>
        layer.objectIds.includes(el.id) ? { ...el, layoutMode: "block" } : el,
      ),
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
  const next = {
    ...slide,
    elements: slide.elements.map((el) =>
      ids.has(el.id) ? { ...el, layoutMode: target.mode } : el,
    ),
    layers,
  };
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
  const nextElements = new Map(slide.elements.map((el) => [el.id, el]));

  const nextLayers = slide.layers.map((layer) => {
    if (layer.mode !== "block") return layer;
    const items: Array<{ id: string; placement: BlockPlacement }> = [];
    for (const id of layer.objectIds) {
      const element = slide.elements.find(
        (candidate) => candidate.id === id && !candidate.isDeleted,
      );
      if (!element) continue;
      const placement = layer.placements[id]
        ? normalizeBlockPlacement(layer.placements[id], grid)
        : normalizeBlockPlacement(
            blockPlacementForRect(element, slide.width, slide.height, placementSeed(element)),
            grid,
          );
      items.push({ id, placement });
    }
    if (!items.length) return layer;

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

    const nextPlacements = { ...layer.placements };
    for (const id of layer.objectIds) {
      const placement = result.placements.get(id);
      if (placement) {
        nextPlacements[id] = placement;
        const current = nextElements.get(id);
        if (current) {
          const placementRect = blockRectForPlacement(placement, slide.width, slide.height);
          const geometry = isMediaElement(current)
            ? fitMediaElementToRect(current, placementRect)
            : placementRect;
          nextElements.set(id, {
            ...current,
            ...geometry,
            version: (current.version ?? 0) + 1,
          } as EngineElement);
        }
      }
    }
    return { ...layer, placements: nextPlacements };
  });

  return {
    ...slide,
    layers: nextLayers,
    elements: Array.from(nextElements.values()),
  };
}

export function commitBlockObject(
  slide: EngineSlide,
  objectId: string,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const element = slide.elements.find((candidate) => candidate.id === objectId);
  if (!element) return slide;
  const layer = getLayerForObject(slide, objectId);
  if (layer?.mode !== "block") return slide;
  const placement = blockPlacementForRect(
    element,
    slide.width,
    slide.height,
    placementSeed(element),
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

export function setBlockPlacement(
  slide: EngineSlide,
  objectId: string,
  placement: Partial<BlockPlacement>,
  strictness: WorkspaceStrictness,
): EngineSlide {
  const layer = getLayerForObject(slide, objectId);
  if (layer?.mode !== "block") return slide;
  const currentPlacement =
    layer.placements[objectId] ??
    placementSeed(slide.elements.find((e) => e.id === objectId) ?? ({} as EngineElement));
  const merged: BlockPlacement = {
    ...currentPlacement,
    ...placement,
  };
  const next = {
    ...slide,
    layers: slide.layers.map((candidate) =>
      candidate.id === layer.id
        ? { ...candidate, placements: { ...candidate.placements, [objectId]: merged } }
        : candidate,
    ),
  };
  return reflowBlockObjects(next, strictness, { anchorId: objectId, anchorPlacement: merged });
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

export function getElementDefaultName(element: EngineElement): string {
  if (
    element.name &&
    !/^(Free|Block|Locked)\s+layer(\s+\d+)?$/i.test(element.name) &&
    element.name !== "Recovered objects"
  ) {
    return element.name;
  }
  if (element.type === "frame") {
    const shape = (element as import("./types").FrameElement).shape ?? "rect";
    if (shape === "arch") return "Arch Frame";
    if (shape === "polaroid") return "Polaroid Frame";
    if (shape === "circle") return "Circle Frame";
    if (shape === "roundedRect") return "Rounded Frame";
    if (shape === "heart") return "Heart Frame";
    if (shape === "star") return "Star Frame";
    if (shape === "hexagon") return "Hexagon Frame";
    if (shape === "blob") return "Blob Frame";
    return "Rectangle Frame";
  }
  if (element.type === "rect") return "Rectangle";
  if (element.type === "ellipse") return "Circle";
  if (element.type === "diamond") return "Diamond";
  if (element.type === "triangle") return "Triangle";
  if (element.type === "star") return "Star";
  if (element.type === "heart") return "Heart";
  if (element.type === "plus") return "Plus";
  if (element.type === "hexagon") return "Hexagon";
  if (element.type === "line") return "Line";
  if (element.type === "arrow") return "Arrow";
  if (element.type === "text") {
    const txt = (element as import("./types").TextElement).text?.trim();
    return txt ? (txt.length > 20 ? `${txt.slice(0, 20)}...` : txt) : "Text";
  }
  if (element.type === "image") return "Photo";
  if (element.type === "bookMockup") return "3D Book";
  if (element.type === "freedraw") return "Drawing";
  if (element.type === "path") return "Vector Path";
  return "Object";
}

export function normalizeStrictness(value: unknown): WorkspaceStrictness {
  return typeof value === "number" && Number.isFinite(value) && value >= 1
    ? (value as WorkspaceStrictness)
    : 1;
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
    const mode: LayerMode = element.layoutMode ?? (element.bento ? "block" : "free");
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
      layoutMode: element.layoutMode ?? (element.bento ? "block" : "free"),
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
