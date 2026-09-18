import { describe, expect, it } from "vitest";
import { createFrame, createImage } from "@/lib/engine/factory";
import {
  MissingSerializedImageError,
  serializeWithImages,
} from "@/lib/engine/serialize";
import { createEmptyEngineDoc } from "@/lib/engine/store";

describe("serializeWithImages missing binaries", () => {
  it("throws when a live image fileId is not in the files map or cache", () => {
    const doc = createEmptyEngineDoc("Missing image");
    doc.slides[0].elements.push(
      createImage({
        x: 0,
        y: 0,
        width: 100,
        height: 80,
        fileId: "missing-live-image",
        naturalWidth: 100,
        naturalHeight: 80,
      }),
    );

    expect(() => serializeWithImages(doc)).toThrow(MissingSerializedImageError);
    try {
      serializeWithImages(doc);
    } catch (error) {
      expect(error).toMatchObject({
        name: "MissingSerializedImageError",
        fileIds: ["missing-live-image"],
      });
    }
  });

  it("throws when a live frame imageFileId is missing", () => {
    const doc = createEmptyEngineDoc("Missing frame image");
    doc.slides[0].elements.push(
      createFrame({
        x: 10,
        y: 10,
        width: 200,
        height: 120,
        imageFileId: "missing-frame-file",
      }),
    );

    expect(() => serializeWithImages(doc)).toThrow(/missing image data/);
  });

  it("accepts extra files supplied by the caller", () => {
    const doc = createEmptyEngineDoc("With extras");
    const image = createImage({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      fileId: "extra-file",
      naturalWidth: 40,
      naturalHeight: 40,
    });
    doc.slides[0].elements.push(image);
    const serialized = serializeWithImages(doc, {
      "extra-file": "data:image/png;base64,AAAA",
    });
    expect(serialized.files["extra-file"]).toBe("data:image/png;base64,AAAA");
  });

  it("ignores soft-deleted images", () => {
    const doc = createEmptyEngineDoc("Deleted image");
    const image = createImage({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      fileId: "deleted-file",
      naturalWidth: 40,
      naturalHeight: 40,
    });
    image.isDeleted = true;
    doc.slides[0].elements.push(image);
    expect(serializeWithImages(doc).files).toEqual({});
  });
});
