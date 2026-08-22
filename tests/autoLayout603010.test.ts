import { describe, expect, it } from "vitest";
import { compute603010AutoLayout } from "@/lib/engine/autoLayout603010";
import { createBookMockup, createImage, createText } from "@/lib/engine/factory";
import type { EngineSlide } from "@/lib/engine/types";

describe("compute603010AutoLayout", () => {
  it("returns empty patches for slide with no elements", () => {
    const slide: EngineSlide = {
      id: "s1",
      name: "Empty",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      layers: [],
      elements: [],
    };
    expect(compute603010AutoLayout(slide)).toEqual([]);
  });

  it("scales single element nicely centered", () => {
    const book = createBookMockup({
      x: 50,
      y: 50,
      width: 200,
      height: 300,
      fileId: "b1",
      naturalWidth: 1200,
      naturalHeight: 1800,
    });
    const slide: EngineSlide = {
      id: "s1",
      name: "Single",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      layers: [],
      elements: [book],
    };
    const patches = compute603010AutoLayout(slide);
    expect(patches).toHaveLength(1);
    expect(patches[0].patch.width).toBeGreaterThan(400);
    expect(patches[0].patch.x).toBeGreaterThan(0);
    expect(patches[0].patch.y).toBeGreaterThan(0);
  });

  it("prioritizes 3D Book > Image > Shape > Text in 60/30/10 layout", () => {
    const textTitle = createText({
      x: 0,
      y: 0,
      text: "The Art of Design",
      fontSize: 32,
    });
    const textSubtitle = createText({
      x: 0,
      y: 100,
      text: "A Masterpiece in Every Detail",
      fontSize: 18,
    });
    const book = createBookMockup({
      x: 50,
      y: 50,
      width: 300,
      height: 450,
      fileId: "b1",
      naturalWidth: 1200,
      naturalHeight: 1800,
    });

    const slide: EngineSlide = {
      id: "s1",
      name: "Hero Book",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      layers: [],
      elements: [textTitle, textSubtitle, book],
    };

    const patches = compute603010AutoLayout(slide);
    expect(patches).toHaveLength(3);

    // Book is 60% hero -> placed in right/top-right half (x > 40% of width = 768px)
    const bookPatch = patches.find((p) => p.id === book.id);
    expect(bookPatch).toBeDefined();
    expect(bookPatch!.patch.x).toBeGreaterThanOrEqual(768);
    expect(bookPatch!.patch.width).toBeGreaterThan(400);

    // Title is in 30% secondary zone -> placed in left area (x < 30% of width = 576px)
    const titlePatch = patches.find((p) => p.id === textTitle.id);
    expect(titlePatch).toBeDefined();
    expect(titlePatch!.patch.x).toBeLessThan(400);

    // Subtitle/Accent is in bottom-left zone
    const subPatch = patches.find((p) => p.id === textSubtitle.id);
    expect(subPatch).toBeDefined();
    expect(subPatch!.patch.x).toBeLessThan(400);
  });

  it("handles portrait aspect ratio (9:16 / 4:5)", () => {
    const image = createImage({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      fileId: "img1",
      naturalWidth: 800,
      naturalHeight: 800,
    });
    const title = createText({
      x: 0,
      y: 0,
      text: "Story Promotion",
      fontSize: 28,
    });

    const slide: EngineSlide = {
      id: "s1",
      name: "Portrait",
      background: "#ffffff",
      width: 1080,
      height: 1920,
      layers: [],
      elements: [image, title],
    };

    const patches = compute603010AutoLayout(slide);
    expect(patches).toHaveLength(2);

    const imgPatch = patches.find((p) => p.id === image.id);
    expect(imgPatch).toBeDefined();
    expect(imgPatch!.patch.y).toBeLessThan(960); // Top half for hero
  });

  it("boosts hero image detected by Vision AI to 60% dominant zone", () => {
    const bgImage = createImage({
      x: 0,
      y: 0,
      width: 500,
      height: 300,
      fileId: "bg1",
      naturalWidth: 1000,
      naturalHeight: 600,
    });
    const productHeroImage = createImage({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      fileId: "prod1",
      naturalWidth: 800,
      naturalHeight: 800,
    });
    const textTitle = createText({
      x: 0,
      y: 0,
      text: "Premium Collection",
      fontSize: 32,
    });

    const slide: EngineSlide = {
      id: "s1",
      name: "Vision Test",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      layers: [],
      elements: [bgImage, productHeroImage, textTitle],
    };

    // With Vision AI score: productHeroImage is identified as Hero Subject
    const visionScores = {
      [productHeroImage.id]: { isHeroSubject: true, visualProminence: 0.9 },
      [bgImage.id]: { isHeroSubject: false, visualProminence: 0.1 },
    };

    const patches = compute603010AutoLayout(slide, visionScores);
    expect(patches).toHaveLength(3);

    const heroPatch = patches.find((p) => p.id === productHeroImage.id);
    expect(heroPatch).toBeDefined();
    // In landscape 16:9, the 60% hero zone is on the right side (x >= 800)
    expect(heroPatch!.patch.x).toBeGreaterThanOrEqual(800);
  });

  it("keeps a four-image 60/30/10 composition inside the artwork", () => {
    const images = Array.from({ length: 4 }, (_, index) =>
      createImage({
        x: index * 120,
        y: index * 80,
        width: 320,
        height: 420,
        fileId: `img-${index}`,
        naturalWidth: 800,
        naturalHeight: 1050,
      }),
    );
    const slide: EngineSlide = {
      id: "s1",
      name: "Four image composition",
      background: "#ffffff",
      width: 1920,
      height: 1080,
      layers: [],
      elements: images,
    };

    const patches = compute603010AutoLayout(slide);

    expect(patches).toHaveLength(4);
    const hero = patches.find((patch) => patch.id === images[0].id)!;
    const supporting = patches.find((patch) => patch.id === images[1].id)!;
    const accents = patches.filter(({ id }) => images.slice(2).some((image) => image.id === id));

    expect(hero.patch.x).toBeGreaterThanOrEqual(slide.width * 0.4);
    expect(supporting.patch.x).toBeLessThan(slide.width * 0.4);
    expect(accents).toHaveLength(2);
    expect(accents.every(({ patch }) => (patch.y ?? 0) >= slide.height * 0.65)).toBe(true);
    expect(accents.every(({ patch }) => (patch.width ?? 0) < (supporting.patch.width ?? 0))).toBe(
      true,
    );
    expect(
      patches.every(({ patch }) => {
        const x = patch.x ?? 0;
        const y = patch.y ?? 0;
        const width = patch.width ?? 0;
        const height = patch.height ?? 0;
        return x >= 0 && y >= 0 && x + width <= slide.width && y + height <= slide.height;
      }),
    ).toBe(true);
  });
});
