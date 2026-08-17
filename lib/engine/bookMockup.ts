import type { BookMockupElement } from "./types";

export type MockupPoint = { x: number; y: number };
export type MockupQuad = [MockupPoint, MockupPoint, MockupPoint, MockupPoint];

export type MockupSurfaceId =
  | "backCover"
  | "spine"
  | "pageFore"
  | "pageTop"
  | "pageBottom"
  | "frontEdgeLeft"
  | "frontEdgeRight"
  | "frontEdgeTop"
  | "frontEdgeBottom"
  | "frontCover";

export type BookMockupSurface = {
  id: MockupSurfaceId;
  quad: MockupQuad;
  /** Camera-space depth; lower values are farther from the viewer. */
  depth: number;
  /** 0..1.4 illumination generated from the editable key + ambient lights. */
  illumination: number;
  visible: boolean;
};

export type BookMockupGeometry = {
  front: MockupQuad;
  spine: MockupQuad | null;
  spineSide: "left" | "right" | null;
  hinge: MockupQuad;
  surfaces: BookMockupSurface[];
  binding: "paperback" | "hardcover";
  shadow: {
    cx: number;
    cy: number;
    radiusX: number;
    radiusY: number;
    rotation: number;
  };
};

type Vec3 = { x: number; y: number; z: number };
type ModelSurface = {
  id: MockupSurfaceId;
  vertices: [Vec3, Vec3, Vec3, Vec3];
  normal: Vec3;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Builds a small real 3D book, rotates it on X/Y/Z and perspective-projects
 * every surface into the element box. The model is pure so live canvas,
 * export, hit-testing and tests all receive exactly the same book.
 */
export function getBookMockupGeometry(el: BookMockupElement): BookMockupGeometry {
  const elementWidth = Math.max(1, el.width);
  const elementHeight = Math.max(1, el.height);
  const coverAspect = clamp(el.naturalWidth / Math.max(1, el.naturalHeight), 0.42, 0.95);
  const bookHeight = 1;
  const bookWidth = coverAspect;
  const bookDepth = bookWidth * clamp(el.depth, 2, 35) * 0.01;
  const binding = el.binding ?? "paperback";
  const overhang =
    binding === "hardcover" ? bookHeight * clamp(el.coverOverhang ?? 1.8, 0, 6) * 0.01 : 0;
  const requestedCoverThickness =
    bookWidth * clamp(el.coverThickness ?? (binding === "hardcover" ? 1.8 : 0.6), 0.2, 5) * 0.01;
  const coverThickness =
    binding === "hardcover" ? requestedCoverThickness : requestedCoverThickness * 0.45;
  const outerFrontZ = bookDepth / 2 + coverThickness / 2;
  const innerFrontZ = bookDepth / 2 - coverThickness / 2;
  const outerBackZ = -bookDepth / 2 - coverThickness / 2;
  const innerBackZ = -bookDepth / 2 + coverThickness / 2;
  const pageFrontZ = innerFrontZ - coverThickness * 0.16;
  const pageBackZ = innerBackZ + coverThickness * 0.16;

  const surfaces = makeModelSurfaces({
    bookWidth,
    bookHeight,
    overhang,
    coverThickness,
    outerFrontZ,
    innerFrontZ,
    outerBackZ,
    pageFrontZ,
    pageBackZ,
    binding,
  });

  const yaw = radians(clamp(el.yaw, -65, 65));
  // Negative UI pitch means the camera is above the book, matching common
  // mockup controls; invert it for the model-space X rotation.
  const pitch = radians(-clamp(el.pitch, -45, 45));
  const roll = radians(clamp(el.roll ?? 0, -45, 45));
  const rotate = (point: Vec3) => rotatePoint(point, pitch, yaw, roll);
  const perspective = clamp(el.perspective ?? 58, 20, 120);
  const cameraDistance = 1.55 + ((perspective - 20) / 100) * 4;
  const projectRaw = (point: Vec3): MockupPoint => {
    const rotated = rotate(point);
    const factor = cameraDistance / Math.max(0.35, cameraDistance - rotated.z);
    return { x: rotated.x * factor, y: -rotated.y * factor };
  };

  const hingeWidth = Math.max(
    bookWidth * 0.012,
    bookWidth * clamp(el.hingeDepth ?? 3.5, 0, 12) * 0.01,
  );
  const hingeModel: [Vec3, Vec3, Vec3, Vec3] = [
    { x: -bookWidth / 2, y: bookHeight / 2, z: outerFrontZ + 0.0001 },
    { x: -bookWidth / 2 + hingeWidth, y: bookHeight / 2, z: outerFrontZ + 0.0001 },
    { x: -bookWidth / 2 + hingeWidth, y: -bookHeight / 2, z: outerFrontZ + 0.0001 },
    { x: -bookWidth / 2, y: -bookHeight / 2, z: outerFrontZ + 0.0001 },
  ];

  const rawPoints = [
    ...surfaces.flatMap((surface) => surface.vertices.map(projectRaw)),
    ...hingeModel.map(projectRaw),
  ];
  const rawBounds = boundsOf(rawPoints);
  // Restrained safety margin so the Transformer hugs the visible mockup snug and centered
  const usableWidth = elementWidth * 0.93;
  const usableHeight = elementHeight * 0.91;
  const scale = Math.min(
    usableWidth / Math.max(0.001, rawBounds.width),
    usableHeight / Math.max(0.001, rawBounds.height),
  );
  const rawCenterX = rawBounds.x + rawBounds.width / 2;
  const rawCenterY = rawBounds.y + rawBounds.height / 2;
  const mapPoint = (point: MockupPoint): MockupPoint => ({
    x: elementWidth * 0.5 + (point.x - rawCenterX) * scale,
    y: elementHeight * 0.47 + (point.y - rawCenterY) * scale,
  });
  const projectQuad = (vertices: [Vec3, Vec3, Vec3, Vec3]): MockupQuad =>
    vertices.map((point) => mapPoint(projectRaw(point))) as MockupQuad;

  const elevation = radians(clamp(el.lightElevation ?? 48, 5, 90));
  const azimuth = radians(el.lightAngle);
  const light = normalize({
    x: Math.cos(elevation) * Math.cos(azimuth),
    y: Math.cos(elevation) * Math.sin(azimuth),
    z: Math.sin(elevation),
  });
  const ambient = clamp(el.ambientLight ?? 0.34, 0, 0.9);
  const intensity = clamp(el.lightIntensity, 0, 1);

  const projectedSurfaces: BookMockupSurface[] = surfaces.map((surface) => {
    const quad = projectQuad(surface.vertices);
    const rotatedNormal = normalize(rotate(surface.normal));
    const rotatedVertices = surface.vertices.map(rotate);
    const center = average3(rotatedVertices);
    const cameraVector = normalize({
      x: -center.x,
      y: -center.y,
      z: cameraDistance - center.z,
    });
    const diffuse = Math.max(0, dot(rotatedNormal, light));
    // 2D screen cross product: positive for front-facing quads in screen coords
    const cross =
      (quad[1].x - quad[0].x) * (quad[3].y - quad[0].y) -
      (quad[1].y - quad[0].y) * (quad[3].x - quad[0].x);
    const normalFacing = dot(rotatedNormal, cameraVector) > 0.01;
    return {
      id: surface.id,
      quad,
      depth: center.z,
      illumination: clamp(ambient + diffuse * intensity, 0, 1.4),
      visible: cross > 0.05 && normalFacing,
    };
  });
  const frontSurface = projectedSurfaces.find((surface) => surface.id === "frontCover")!;
  const spineSurface = projectedSurfaces.find((surface) => surface.id === "spine");
  const visibleSpine = spineSurface?.visible ? spineSurface.quad : null;
  const allVisiblePoints = projectedSurfaces
    .filter((surface) => surface.visible)
    .flatMap((surface) => surface.quad);
  const visibleBounds = boundsOf(allVisiblePoints.length ? allVisiblePoints : frontSurface.quad);
  const shadowScale = Math.min(elementWidth, elementHeight) / 600;
  const shadowOffset = clamp(el.shadowOffset, 0, 100) * shadowScale;

  return {
    front: frontSurface.quad,
    spine: visibleSpine,
    spineSide: visibleSpine ? (el.yaw >= 0 ? "left" : "right") : null,
    hinge: hingeModel.map((point) => mapPoint(projectRaw(point))) as MockupQuad,
    surfaces: projectedSurfaces,
    binding,
    shadow: {
      cx: visibleBounds.x + visibleBounds.width / 2 - Math.cos(azimuth) * shadowOffset * 0.28,
      cy: Math.min(
        elementHeight * 0.96,
        visibleBounds.y + visibleBounds.height + 2 + shadowOffset * 0.2,
      ),
      radiusX: Math.max(6, visibleBounds.width * 0.45),
      radiusY: Math.max(
        3.5,
        elementHeight * 0.016 + clamp(el.shadowBlur, 0, 100) * shadowScale * 0.14,
      ),
      rotation: roll + yaw * 0.1,
    },
  };
}

function makeModelSurfaces(model: {
  bookWidth: number;
  bookHeight: number;
  overhang: number;
  coverThickness: number;
  outerFrontZ: number;
  innerFrontZ: number;
  outerBackZ: number;
  pageFrontZ: number;
  pageBackZ: number;
  binding: "paperback" | "hardcover";
}): ModelSurface[] {
  const {
    bookWidth: width,
    bookHeight: height,
    overhang,
    coverThickness,
    outerFrontZ,
    innerFrontZ,
    outerBackZ,
    pageFrontZ,
    pageBackZ,
    binding,
  } = model;
  const left = -width / 2;
  const right = width / 2;
  const top = height / 2;
  const bottom = -height / 2;

  // Page block is attached to spine on left, and sits inside overhang on right, top, bottom
  const pageLeft = left + (binding === "hardcover" ? coverThickness * 0.5 : 0);
  const pageRight = right - overhang;
  const pageTop = top - overhang;
  const pageBottom = bottom + overhang;

  const baseSurfaces: ModelSurface[] = [
    {
      id: "backCover",
      vertices: [
        { x: right, y: top, z: outerBackZ },
        { x: left, y: top, z: outerBackZ },
        { x: left, y: bottom, z: outerBackZ },
        { x: right, y: bottom, z: outerBackZ },
      ],
      normal: { x: 0, y: 0, z: -1 },
    },
    {
      id: "spine",
      vertices: [
        { x: left, y: top, z: outerBackZ },
        { x: left, y: top, z: outerFrontZ },
        { x: left, y: bottom, z: outerFrontZ },
        { x: left, y: bottom, z: outerBackZ },
      ],
      normal: { x: -1, y: 0, z: 0 },
    },
    {
      id: "pageFore",
      vertices: [
        { x: pageRight, y: pageTop, z: pageFrontZ },
        { x: pageRight, y: pageTop, z: pageBackZ },
        { x: pageRight, y: pageBottom, z: pageBackZ },
        { x: pageRight, y: pageBottom, z: pageFrontZ },
      ],
      normal: { x: 1, y: 0, z: 0 },
    },
    {
      id: "pageTop",
      vertices: [
        { x: pageLeft, y: pageTop, z: pageBackZ },
        { x: pageRight, y: pageTop, z: pageBackZ },
        { x: pageRight, y: pageTop, z: pageFrontZ },
        { x: pageLeft, y: pageTop, z: pageFrontZ },
      ],
      normal: { x: 0, y: 1, z: 0 },
    },
    {
      id: "pageBottom",
      vertices: [
        { x: pageLeft, y: pageBottom, z: pageFrontZ },
        { x: pageRight, y: pageBottom, z: pageFrontZ },
        { x: pageRight, y: pageBottom, z: pageBackZ },
        { x: pageLeft, y: pageBottom, z: pageBackZ },
      ],
      normal: { x: 0, y: -1, z: 0 },
    },
    {
      id: "frontCover",
      vertices: [
        { x: left, y: top, z: outerFrontZ },
        { x: right, y: top, z: outerFrontZ },
        { x: right, y: bottom, z: outerFrontZ },
        { x: left, y: bottom, z: outerFrontZ },
      ],
      normal: { x: 0, y: 0, z: 1 },
    },
  ];

  if (binding === "hardcover") {
    baseSurfaces.push(
      {
        id: "frontEdgeRight",
        vertices: [
          { x: right, y: top, z: outerFrontZ },
          { x: right, y: top, z: innerFrontZ },
          { x: right, y: bottom, z: innerFrontZ },
          { x: right, y: bottom, z: outerFrontZ },
        ],
        normal: { x: 1, y: 0, z: 0 },
      },
      {
        id: "frontEdgeTop",
        vertices: [
          { x: left, y: top, z: innerFrontZ },
          { x: right, y: top, z: innerFrontZ },
          { x: right, y: top, z: outerFrontZ },
          { x: left, y: top, z: outerFrontZ },
        ],
        normal: { x: 0, y: 1, z: 0 },
      },
      {
        id: "frontEdgeBottom",
        vertices: [
          { x: left, y: bottom, z: outerFrontZ },
          { x: right, y: bottom, z: outerFrontZ },
          { x: right, y: bottom, z: innerFrontZ },
          { x: left, y: bottom, z: innerFrontZ },
        ],
        normal: { x: 0, y: -1, z: 0 },
      },
    );
  }

  return baseSurfaces;
}

function rotatePoint(point: Vec3, pitch: number, yaw: number, roll: number): Vec3 {
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const afterX = {
    x: point.x,
    y: point.y * cosX - point.z * sinX,
    z: point.y * sinX + point.z * cosX,
  };
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const afterY = {
    x: afterX.x * cosY + afterX.z * sinY,
    y: afterX.y,
    z: -afterX.x * sinY + afterX.z * cosY,
  };
  const cosZ = Math.cos(roll);
  const sinZ = Math.sin(roll);
  return {
    x: afterY.x * cosZ - afterY.y * sinZ,
    y: afterY.x * sinZ + afterY.y * cosZ,
    z: afterY.z,
  };
}

function boundsOf(points: MockupPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y,
  };
}

function average3(points: Vec3[]): Vec3 {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
  };
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function pointInMockupQuad(point: MockupPoint, quad: MockupQuad): boolean {
  let inside = false;
  for (let index = 0, previous = quad.length - 1; index < quad.length; previous = index++) {
    const a = quad[index];
    const b = quad[previous];
    const crosses =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}
