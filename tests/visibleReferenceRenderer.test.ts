import { beforeEach, describe, expect, it, vi } from "vitest";

const engineMock = vi.hoisted(() => ({ currentSlide: vi.fn() }));
const getCachedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/engine/imageCache", () => ({
  getCached: getCachedMock,
  getImageCache: () => new Map(),
}));
vi.mock("@/lib/engine/store", () => ({
  useEngine: { getState: () => engineMock },
}));
vi.mock("@/lib/renderer/canvas", () => ({ renderElement: vi.fn() }));

import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { renderVisibleReference } from "@/lib/ai/orchestration/visibleReferenceRenderer";

const ref: ComposerImageRef = {
  objectId: "image-1",
  elementVersion: 3,
  fileId: "file-1",
  displayName: "product.png",
  sourceWidth: 800,
  sourceHeight: 600,
  width: 400,
  height: 300,
  angle: 0,
};

describe("visible reference renderer", () => {
  beforeEach(() => {
    getCachedMock.mockReset();
    getCachedMock.mockReturnValue({
      dataURL: "data:image/png;base64,AA==",
      width: 800,
      height: 600,
    });
    engineMock.currentSlide.mockReset();
  });

  it("rejects a reference when the current element version or file changed", () => {
    engineMock.currentSlide.mockReturnValue({
      layers: [],
      elements: [
        {
          id: ref.objectId,
          type: "image",
          version: ref.elementVersion + 1,
          fileId: "file-new",
          x: 0,
          y: 0,
          width: ref.width,
          height: ref.height,
          angle: 0,
        },
      ],
    });

    expect(() => renderVisibleReference(ref)).toThrow("selected image changed before analysis");
  });
});
