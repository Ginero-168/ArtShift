import { bench, describe } from "vitest";
import { getLocalRasterProcessor } from "@/lib/raster/localRasterProcessor";

const processor = getLocalRasterProcessor();
const width = 1_024;
const height = 1_024;
const data = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < data.length; index += 4) {
  data[index] = (index / 4) % 255;
  data[index + 1] = 96;
  data[index + 2] = 160;
  data[index + 3] = 255;
}

describe("Raster processor baseline", () => {
  bench("Magic Wand 1024x1024", async () => {
    await processor.execute({
      kind: "magicWand",
      pixels: { width, height, data },
      seedX: width / 2,
      seedY: height / 2,
      tolerance: 16,
    });
  });

  bench("Quick Selection 1024x1024", async () => {
    await processor.execute({
      kind: "quickSelection",
      pixels: { width, height, data },
      seedX: width / 2,
      seedY: height / 2,
      radiusX: 48,
      radiusY: 48,
      tolerance: 16,
    });
  });

  bench("Thumbnail 1024x1024 to 160x90", async () => {
    await processor.execute({
      kind: "thumbnail",
      pixels: { width, height, data },
      width: 160,
      height: 90,
    });
  });
});
