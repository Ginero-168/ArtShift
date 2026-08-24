export type VisionObjectBox = {
  label: string;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type AlphaObjectBox = Omit<VisionObjectBox, "label"> & {
  area?: number;
};

type NormalizedBox = Omit<VisionObjectBox, "label">;

function area(box: NormalizedBox): number {
  return Math.max(0, box.x_max - box.x_min) * Math.max(0, box.y_max - box.y_min);
}

function intersectionArea(first: NormalizedBox, second: NormalizedBox): number {
  const width = Math.max(
    0,
    Math.min(first.x_max, second.x_max) - Math.max(first.x_min, second.x_min),
  );
  const height = Math.max(
    0,
    Math.min(first.y_max, second.y_max) - Math.max(first.y_min, second.y_min),
  );
  return width * height;
}

function isValidBox(box: NormalizedBox): boolean {
  return (
    [box.x_min, box.y_min, box.x_max, box.y_max].every(Number.isFinite) &&
    box.x_max > box.x_min &&
    box.y_max > box.y_min
  );
}

function sortBoxes<T extends NormalizedBox>(boxes: T[]): T[] {
  return boxes.sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min);
}

/**
 * Use foreground geometry to recover objects that Florence-2 misses.
 *
 * Florence provides useful labels but can return one coarse box for a group of
 * objects. Alpha components are therefore the extraction geometry whenever
 * available; Florence boxes only fill gaps where the foreground pass found no
 * component and provide labels for components they overlap.
 */
export function mergeVisionWithAlphaComponents(
  visionObjects: readonly VisionObjectBox[],
  alphaComponents: readonly AlphaObjectBox[],
): VisionObjectBox[] {
  const validVisionObjects = visionObjects.filter(isValidBox);
  const validAlphaComponents = alphaComponents.filter(isValidBox);
  if (validAlphaComponents.length === 0) return sortBoxes([...validVisionObjects]);

  const splitAlphaIndexes = new Set<number>();
  const splitVisionIndexes = new Set<number>();
  const splitProposals: VisionObjectBox[] = [];

  for (const [alphaIndex, rawComponent] of validAlphaComponents.entries()) {
    const { area: _area, ...component } = rawComponent;
    const candidates = findDistinctVisionInstances(component, validVisionObjects);
    if (candidates.length < 2) continue;

    splitAlphaIndexes.add(alphaIndex);
    for (const candidate of candidates) {
      splitVisionIndexes.add(candidate.index);
      splitProposals.push({ ...candidate.object });
    }
  }

  const assignments = validAlphaComponents.flatMap((rawComponent, alphaIndex) => {
    if (splitAlphaIndexes.has(alphaIndex)) return [];
    const { area: _area, ...component } = rawComponent;
    let bestVisionIndex = -1;
    let bestCoverage = 0;

    for (const [index, visionObject] of validVisionObjects.entries()) {
      const componentArea = area(component);
      const coverage =
        componentArea > 0 ? intersectionArea(component, visionObject) / componentArea : 0;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        bestVisionIndex = index;
      }
    }

    return [
      {
        alphaIndex,
        component,
        visionIndex: bestCoverage >= 0.25 ? bestVisionIndex : -1,
      },
    ];
  });

  const usedVisionIndexes = new Set<number>(splitVisionIndexes);
  const groupedAlphaIndexes = new Set<number>();
  const alphaObjects: VisionObjectBox[] = [];
  const groupedComponents = new Map<number, typeof assignments>();
  const primaryAssignments = new Map<number, (typeof assignments)[number]>();

  for (const [visionIndex] of validVisionObjects.entries()) {
    const assigned = assignments.filter((assignment) => assignment.visionIndex === visionIndex);
    if (!assigned.length) continue;

    usedVisionIndexes.add(visionIndex);
    const primary = [...assigned].sort(
      (first, second) => area(second.component) - area(first.component),
    )[0];
    const accessories = assigned.filter(
      (assignment) =>
        assignment.alphaIndex !== primary.alphaIndex &&
        isNearbyAccessory(primary.component, assignment.component),
    );
    const grouped = [primary, ...accessories];
    groupedComponents.set(visionIndex, grouped);
    primaryAssignments.set(visionIndex, primary);
    for (const component of grouped) groupedAlphaIndexes.add(component.alphaIndex);
  }

  // A thin accessory can sit just outside Florence's coarse box (common with
  // straws and handles). Attach it to the nearest semantic primary only when
  // it is both small and immediately adjacent; comparable nearby objects stay
  // independent.
  for (const assignment of assignments) {
    if (assignment.visionIndex >= 0 || groupedAlphaIndexes.has(assignment.alphaIndex)) continue;

    const nearest = [...primaryAssignments.entries()]
      .map(([visionIndex, primary]) => ({
        distance: accessoryDistance(primary.component, assignment.component),
        primary,
        visionIndex,
      }))
      .filter(({ primary }) => isNearbyAccessory(primary.component, assignment.component))
      .sort((first, second) => first.distance - second.distance)[0];

    if (!nearest) continue;
    groupedComponents.get(nearest.visionIndex)?.push(assignment);
    groupedAlphaIndexes.add(assignment.alphaIndex);
  }

  for (const [visionIndex, components] of groupedComponents.entries()) {
    const merged = components.reduce(
      (current, component) => unionBoxes(current, component.component),
      components[0].component,
    );
    alphaObjects.push({ label: validVisionObjects[visionIndex].label, ...merged });
  }

  for (const assignment of assignments) {
    if (groupedAlphaIndexes.has(assignment.alphaIndex)) continue;
    alphaObjects.push({
      label:
        assignment.visionIndex >= 0 ? validVisionObjects[assignment.visionIndex].label : "object",
      ...assignment.component,
    });
  }

  const acceptedObjects = [...splitProposals, ...alphaObjects];
  const uncoveredVisionObjects = validVisionObjects
    .filter((_object, index) => !usedVisionIndexes.has(index))
    .filter(
      (visionObject) =>
        !acceptedObjects.some((acceptedObject) => {
          const visionArea = area(visionObject);
          return (
            visionArea > 0 && intersectionArea(visionObject, acceptedObject) / visionArea >= 0.5
          );
        }),
    );

  return sortBoxes([...acceptedObjects, ...uncoveredVisionObjects]);
}

function findDistinctVisionInstances(
  component: NormalizedBox,
  visionObjects: readonly VisionObjectBox[],
): Array<{ index: number; object: VisionObjectBox }> {
  const componentArea = area(component);
  if (componentArea <= 0) return [];

  const candidates = visionObjects
    .map((object, index) => ({ index, object }))
    .filter(({ object }) => {
      const objectArea = area(object);
      if (objectArea < componentArea * 0.06 || objectArea > componentArea * 0.82) return false;
      return intersectionArea(component, object) / objectArea >= 0.72;
    })
    .sort((first, second) => area(second.object) - area(first.object));

  const distinct: Array<{ index: number; object: VisionObjectBox }> = [];
  for (const candidate of candidates) {
    const isSeparate = distinct.every(({ object }) => {
      const smallerArea = Math.min(area(object), area(candidate.object));
      return smallerArea <= 0 || intersectionArea(object, candidate.object) / smallerArea < 0.55;
    });
    if (isSeparate) distinct.push(candidate);
  }

  return distinct;
}

/**
 * Keep Fast extraction geometry intact while using Florence only for labels.
 *
 * A detector may return a coarse box for a group of nearby objects. That box
 * must never replace the tighter alpha component because it would reintroduce
 * the large merged rectangles that Fast extraction avoids.
 */
export function labelAlphaComponents(
  alphaComponents: readonly AlphaObjectBox[],
  visionObjects: readonly VisionObjectBox[],
): VisionObjectBox[] {
  const validVisionObjects = visionObjects.filter(isValidBox);

  return sortBoxes(
    alphaComponents.filter(isValidBox).map((rawComponent) => {
      const { area: _area, ...component } = rawComponent;
      const componentArea = area(component);
      const bestMatch = validVisionObjects
        .map((visionObject) => ({
          coverage:
            componentArea > 0 ? intersectionArea(component, visionObject) / componentArea : 0,
          label: visionObject.label,
        }))
        .sort((first, second) => second.coverage - first.coverage)[0];

      return {
        label: bestMatch && bestMatch.coverage >= 0.15 ? bestMatch.label : "object",
        ...component,
      };
    }),
  );
}

/**
 * Preserve Remove BG alpha only when a proposal still represents the same
 * foreground component. Vision sub-proposals inside one large touching blob
 * must use their instance mask as the source of truth or they will retain
 * pixels from neighboring objects.
 */
export function shouldPreserveAlphaForProposal(
  proposal: VisionObjectBox,
  alphaComponents: readonly AlphaObjectBox[],
): boolean {
  const proposalArea = area(proposal);
  if (proposalArea <= 0) return false;

  const containedComponents = alphaComponents
    .filter(isValidBox)
    .map(({ area: _area, ...component }) => component)
    .filter((component) => {
      const componentArea = area(component);
      return componentArea > 0 && intersectionArea(proposal, component) / componentArea >= 0.85;
    })
    .sort((first, second) => area(second) - area(first));
  if (containedComponents.length === 0) return false;

  const primary = containedComponents[0];
  const proposalComponents = [
    primary,
    ...containedComponents.slice(1).filter((component) => isNearbyAccessory(primary, component)),
  ];
  const componentUnion = proposalComponents
    .slice(1)
    .reduce((current, component) => unionBoxes(current, component), primary);
  const componentUnionArea = area(componentUnion);
  if (componentUnionArea <= 0) return false;

  const relativeArea =
    Math.min(proposalArea, componentUnionArea) / Math.max(proposalArea, componentUnionArea);
  const overlapOnProposal = intersectionArea(proposal, componentUnion) / proposalArea;
  return relativeArea >= 0.65 && overlapOnProposal >= 0.65;
}

function isNearbyAccessory(primary: NormalizedBox, candidate: NormalizedBox): boolean {
  const primaryArea = area(primary);
  const candidateArea = area(candidate);
  if (primaryArea <= 0 || candidateArea / primaryArea > 0.35) return false;

  return accessoryDistance(primary, candidate) <= 0.08;
}

function accessoryDistance(primary: NormalizedBox, candidate: NormalizedBox): number {
  const horizontalGap = Math.max(
    0,
    Math.max(primary.x_min, candidate.x_min) - Math.min(primary.x_max, candidate.x_max),
  );
  const verticalGap = Math.max(
    0,
    Math.max(primary.y_min, candidate.y_min) - Math.min(primary.y_max, candidate.y_max),
  );
  return Math.max(horizontalGap, verticalGap);
}

function unionBoxes(first: NormalizedBox, second: NormalizedBox): NormalizedBox {
  return {
    x_min: Math.min(first.x_min, second.x_min),
    y_min: Math.min(first.y_min, second.y_min),
    x_max: Math.max(first.x_max, second.x_max),
    y_max: Math.max(first.y_max, second.y_max),
  };
}
