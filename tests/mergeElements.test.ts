import { beforeEach, describe, expect, it } from "vitest";
import { createImage } from "@/lib/engine/factory";
import { useEngine } from "@/lib/engine/store";
import { ENGINE_SCHEMA_VERSION } from "@/lib/engine/types";
import { getObjectContextIconName } from "@/components/Canvas/objectContextIconRegistry";
import { mergeSelectedImages } from "@/lib/engine/mergeElements";

describe("merge elements pipeline", () => {
  beforeEach(() => {
    const st = useEngine.getState();
    st.loadDoc({
      id: "doc1",
      title: "test",
      schemaVersion: ENGINE_SCHEMA_VERSION,
      width: 1920,
      height: 1080,
      slides: [
        {
          id: "s1",
          name: "Slide 1",
          background: "#fff",
          width: 1920,
          height: 1080,
          elements: [],
          layers: [
            {
              id: "layer1",
              name: "Layer 1",
              mode: "free",
              objectIds: [],
              placements: {},
              visible: true,
              locked: false,
              z: 1,
            },
          ],
        },
      ],
      snapGrid: null,
      workspaceStrictness: 1,
      updatedAt: Date.now(),
    });
  });

  it("maps Merge action to merge icon in the registry", () => {
    expect(getObjectContextIconName("Merge")).toBe("merge");
  });

  it("replaces selected source images with merged image atomically", () => {
    const st = useEngine.getState();
    const img1 = createImage({
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      fileId: "img1",
      naturalWidth: 400,
      naturalHeight: 300,
      name: "Image 1",
    });
    const img2 = createImage({
      x: 250,
      y: 100,
      width: 200,
      height: 150,
      fileId: "img2",
      naturalWidth: 400,
      naturalHeight: 300,
      name: "Image 2",
    });
    st.addElement(img1);
    st.addElement(img2);

    const slideBefore = useEngine.getState().currentSlide()!;
    expect(slideBefore.elements).toHaveLength(2);

    const merged = createImage({
      x: 100,
      y: 100,
      width: 350,
      height: 150,
      fileId: "merged-img",
      naturalWidth: 700,
      naturalHeight: 300,
      name: "Merged Image",
    });

    st.replaceElementsWithMerged([img1.id, img2.id], merged);

    const slideAfter = useEngine.getState().currentSlide()!;
    expect(slideAfter.elements).toHaveLength(1);
    expect(slideAfter.elements[0].id).toBe(merged.id);
    expect((slideAfter.elements[0] as any).fileId).toBe("merged-img");
    expect(useEngine.getState().selectedIds).toEqual(new Set([merged.id]));

    // Check layer membership
    const layer = slideAfter.layers[0];
    expect(layer.objectIds).toContain(merged.id);
    expect(layer.objectIds).not.toContain(img1.id);
    expect(layer.objectIds).not.toContain(img2.id);

    // Undo restores original 2 images
    useEngine.getState().undo();
    const slideRestored = useEngine.getState().currentSlide()!;
    expect(slideRestored.elements).toHaveLength(2);
    expect(slideRestored.elements.map((el) => el.id)).toEqual(
      expect.arrayContaining([img1.id, img2.id]),
    );

    // Redo reapplies merge
    useEngine.getState().redo();
    const slideRedone = useEngine.getState().currentSlide()!;
    expect(slideRedone.elements).toHaveLength(1);
    expect(slideRedone.elements[0].id).toBe(merged.id);
  });

  it("returns null when fewer than 2 elements are selected for merge", async () => {
    const st = useEngine.getState();
    const img1 = createImage({
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      fileId: "img1",
      naturalWidth: 400,
      naturalHeight: 300,
    });
    st.addElement(img1);
    const slide = useEngine.getState().currentSlide()!;

    const result = await mergeSelectedImages(slide, [img1.id]);
    expect(result).toBeNull();
  });
});
