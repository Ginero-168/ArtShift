import { describe, expect, it } from "vitest";
import {
  buildComposerImageRefs,
  buildComposerImageSelection,
  buildComposerImageSelectionFromIds,
  snapshotComposerImageRefs,
} from "@/lib/ai/orchestration/imageReferences";
import { createImage, createText } from "@/lib/engine/factory";

describe("selected image references", () => {
  it("creates readable named refs only for selected image objects", () => {
    const image = {
      ...createImage({
        x: 20,
        y: 30,
        width: 300,
        height: 200,
        fileId: "file-a",
        naturalWidth: 1200,
        naturalHeight: 800,
      }),
      id: "image-a",
      sourceName: "product-front.png",
      version: 4,
    };
    const text = {
      ...createText({ x: 0, y: 0, width: 20, height: 20, text: "Title" }),
      id: "text-a",
    };
    const refs = buildComposerImageRefs([image, text], new Set([image.id, text.id]));
    expect(refs).toEqual([
      expect.objectContaining({
        objectId: "image-a",
        elementVersion: 4,
        fileId: "file-a",
        displayName: "product-front.png",
        sourceWidth: 1200,
        sourceHeight: 800,
      }),
    ]);
  });

  it("caps analyzed references at four and reports omitted selections", () => {
    const images = Array.from({ length: 5 }, (_, index) => ({
      ...createImage({
        x: index * 10,
        y: 0,
        width: 100,
        height: 100,
        fileId: `file-${index}`,
        naturalWidth: 100,
        naturalHeight: 100,
      }),
      id: `image-${index}`,
    }));
    const selection = buildComposerImageSelection(images, new Set(images.map((image) => image.id)));

    expect(selection.refs).toHaveLength(4);
    expect(selection.omittedCount).toBe(1);
    expect(selection.totalCount).toBe(5);
  });

  it("snapshots refs so later selection changes cannot retarget a task", () => {
    const image = {
      ...createImage({
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        fileId: "file-a",
        naturalWidth: 10,
        naturalHeight: 10,
      }),
      id: "image-a",
    };
    const refs = snapshotComposerImageRefs(buildComposerImageRefs([image], new Set([image.id])));
    expect(refs).not.toBe(buildComposerImageRefs([image], new Set([image.id])));
    expect(refs[0]?.objectId).toBe("image-a");
  });

  it("builds composer selection from attached IDs regardless of canvas selection state", () => {
    const image1 = {
      ...createImage({
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fileId: "file-1",
        naturalWidth: 200,
        naturalHeight: 200,
      }),
      id: "img-1",
      sourceName: "photo-1.png",
      version: 1,
    };
    const image2 = {
      ...createImage({
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        fileId: "file-2",
        naturalWidth: 200,
        naturalHeight: 200,
      }),
      id: "img-2",
      name: "Custom Name",
      version: 2,
    };
    const deletedImage = {
      ...createImage({
        x: 20,
        y: 20,
        width: 100,
        height: 100,
        fileId: "file-3",
        naturalWidth: 200,
        naturalHeight: 200,
      }),
      id: "img-3",
      isDeleted: true,
      version: 1,
    };

    const selection = buildComposerImageSelectionFromIds(
      [image1, image2, deletedImage],
      ["img-2", "img-1", "img-3", "img-nonexistent", "img-2"],
    );

    expect(selection.refs).toHaveLength(2);
    expect(selection.refs[0]?.objectId).toBe("img-2");
    expect(selection.refs[0]?.displayName).toBe("Custom Name");
    expect(selection.refs[1]?.objectId).toBe("img-1");
    expect(selection.refs[1]?.displayName).toBe("photo-1.png");
    expect(selection.omittedCount).toBe(0);
    expect(selection.totalCount).toBe(2);
  });
});
