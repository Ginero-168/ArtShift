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
