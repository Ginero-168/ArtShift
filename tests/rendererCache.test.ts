import { beforeEach, describe, expect, it } from "vitest";
import { createFrame, createRect } from "@/lib/engine/factory";
import {
  type CachedElement,
  clearElementCache,
  getCachedElement,
  setCachedElement,
} from "@/lib/renderer/cache";

describe("renderer element cache", () => {
  beforeEach(() => clearElementCache());

  it("does not reuse a Shape bitmap for a converted Frame with the same id and version", () => {
    const shape = createRect({ x: 20, y: 20, width: 160, height: 120 });
    const frame = {
      ...createFrame({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }),
      id: shape.id,
      version: shape.version,
    };
    const cached: CachedElement = { canvas: document.createElement("canvas"), pad: 48 };

    setCachedElement(shape, cached);

    expect(getCachedElement(frame)).toBeUndefined();
  });
});
