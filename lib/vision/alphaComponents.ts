export type AlphaComponentBox = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  area: number;
};

export type AlphaComponentOptions = {
  alphaThreshold?: number;
  minAreaRatio?: number;
  maxComponents?: number;
  padding?: number;
};

export type AlphaTile = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Build overlapping tiles for high-resolution foreground analysis. */
export function createAlphaTiles(
  width: number,
  height: number,
  tileSize: number,
  overlap: number,
): AlphaTile[] {
  if (width < 1 || height < 1 || tileSize < 1) return [];
  const safeTileSize = Math.min(tileSize, Math.max(width, height));
  const safeOverlap = Math.max(0, Math.min(overlap, safeTileSize - 1));
  const step = Math.max(1, safeTileSize - safeOverlap);
  const xPositions = axisPositions(width, safeTileSize, step);
  const yPositions = axisPositions(height, safeTileSize, step);

  return yPositions.flatMap((y) =>
    xPositions.map((x) => ({
      x,
      y,
      width: Math.min(safeTileSize, width - x),
      height: Math.min(safeTileSize, height - y),
    })),
  );
}

/** Convert a component reported in tile coordinates into full-image coordinates. */
export function mapAlphaComponentToImage(
  component: AlphaComponentBox,
  tile: AlphaTile,
  imageWidth: number,
  imageHeight: number,
): AlphaComponentBox {
  const minX = tile.x + component.x_min * tile.width;
  const minY = tile.y + component.y_min * tile.height;
  const maxX = tile.x + component.x_max * tile.width;
  const maxY = tile.y + component.y_max * tile.height;
  return {
    x_min: minX / imageWidth,
    y_min: minY / imageHeight,
    x_max: maxX / imageWidth,
    y_max: maxY / imageHeight,
    area: component.area,
  };
}

/** Merge duplicate component boxes reported by overlapping tiles. */
export function mergeAlphaComponents(
  components: readonly AlphaComponentBox[],
  overlapThreshold = 0.08,
): AlphaComponentBox[] {
  const merged: AlphaComponentBox[] = [];
  for (const component of components) {
    const matchIndex = merged.findIndex((candidate) =>
      hasComponentOverlap(candidate, component, overlapThreshold),
    );
    if (matchIndex < 0) {
      merged.push({ ...component });
      continue;
    }

    const match = merged[matchIndex];
    merged[matchIndex] = {
      x_min: Math.min(match.x_min, component.x_min),
      y_min: Math.min(match.y_min, component.y_min),
      x_max: Math.max(match.x_max, component.x_max),
      y_max: Math.max(match.y_max, component.y_max),
      area: match.area + component.area,
    };
  }

  return merged.sort((first, second) => first.y_min - second.y_min || first.x_min - second.x_min);
}

/** Find connected foreground regions in an RGBA image and return normalized boxes. */
export function findAlphaComponents(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: AlphaComponentOptions = {},
): AlphaComponentBox[] {
  if (
    width < 1 ||
    height < 1 ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    rgba.length < width * height * 4
  ) {
    throw new Error("Invalid alpha component image.");
  }

  const alphaThreshold = Math.max(0, Math.min(255, options.alphaThreshold ?? 24));
  const minArea = Math.max(1, Math.ceil(width * height * (options.minAreaRatio ?? 0.0005)));
  const maxComponents = Math.max(1, Math.floor(options.maxComponents ?? 64));
  const padding = Math.max(0, Math.floor(options.padding ?? 1));
  const pixelCount = width * height;
  const foreground = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    foreground[pixel] = Number(rgba[pixel * 4 + 3]) >= alphaThreshold ? 1 : 0;
  }

  const queue = new Int32Array(pixelCount);
  const components: AlphaComponentBox[] = [];
  const neighbors = [-1, 1, -width - 1, -width, -width + 1, width - 1, width, width + 1];

  for (let start = 0; start < pixelCount; start++) {
    if (!foreground[start] || visited[start]) continue;

    let head = 0;
    let tail = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    queue[tail++] = start;
    visited[start] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      area++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const offset of neighbors) {
        const next = pixel + offset;
        if (next < 0 || next >= pixelCount || visited[next] || !foreground[next]) continue;
        const nextX = next % width;
        const nextY = Math.floor(next / width);
        if (Math.abs(nextX - x) > 1 || Math.abs(nextY - y) > 1) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }

    if (area < minArea) continue;
    components.push({
      x_min: Math.max(0, (minX - padding) / width),
      y_min: Math.max(0, (minY - padding) / height),
      x_max: Math.min(width, (maxX + padding + 1) / width),
      y_max: Math.min(height, (maxY + padding + 1) / height),
      area,
    });
  }

  return components
    .sort((a, b) => b.area - a.area)
    .slice(0, maxComponents)
    .sort((a, b) => a.y_min - b.y_min || a.x_min - b.x_min);
}

function axisPositions(length: number, tileSize: number, step: number): number[] {
  if (length <= tileSize) return [0];
  const positions: number[] = [];
  for (let position = 0; position < length; position += step) {
    positions.push(Math.min(position, length - tileSize));
    if (positions.at(-1) === length - tileSize) break;
  }
  return positions;
}

function hasComponentOverlap(
  first: AlphaComponentBox,
  second: AlphaComponentBox,
  threshold: number,
): boolean {
  const intersection = intersectionArea(first, second);
  const smallerArea = Math.min(boxArea(first), boxArea(second));
  return smallerArea > 0 && intersection / smallerArea >= threshold;
}

function boxArea(box: Pick<AlphaComponentBox, "x_min" | "y_min" | "x_max" | "y_max">): number {
  return Math.max(0, box.x_max - box.x_min) * Math.max(0, box.y_max - box.y_min);
}

function intersectionArea(
  first: Pick<AlphaComponentBox, "x_min" | "y_min" | "x_max" | "y_max">,
  second: Pick<AlphaComponentBox, "x_min" | "y_min" | "x_max" | "y_max">,
): number {
  return (
    Math.max(0, Math.min(first.x_max, second.x_max) - Math.max(first.x_min, second.x_min)) *
    Math.max(0, Math.min(first.y_max, second.y_max) - Math.max(first.y_min, second.y_min))
  );
}
