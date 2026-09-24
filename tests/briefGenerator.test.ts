import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { generateBriefElements } from "@/lib/ai/briefGenerator";
import { type ConvertToBriefData, resolveFooterBarDirection } from "@/lib/ai/briefParser";
import type { ImageElement, TextElement } from "@/lib/engine/types";
import { DEFAULT_THAI_FONT_FAMILY } from "@/lib/fonts";

describe("Brief Generator Service & Layout Geometry", () => {
  const mockImageElement: ImageElement = {
    id: "img-test-1",
    type: "image",
    fileId: "file-mock-1",
    x: 100,
    y: 150,
    width: 600,
    height: 400,
    naturalWidth: 1200,
    naturalHeight: 800,
    angle: 0,
    opacity: 1,
    strokeColor: "transparent",
    backgroundColor: "transparent",
    strokeWidth: 0,
    strokeStyle: "solid",
    fillStyle: "solid",
    roughness: 0,
    seed: 1,
    groupIds: [],
    locked: false,
    z: 1,
    version: 1,
    crop: null,
    status: "loaded",
    isDeleted: false,
  };

  const sampleBriefData: ConvertToBriefData = {
    aspectRatio: { width: 600, height: 400 },
    backgroundPartitions: [
      {
        name: "เชฟซูชิ",
        box: [0, 0, 450, 1000],
        color: "#e0e7ff",
        labelPlacement: "top-left",
      },
      {
        name: "รูปซูชิ",
        box: [450, 0, 1000, 1000],
        color: "#cffafe",
        labelPlacement: "center",
      },
    ],
    dividers: [
      {
        start: [0, 450],
        end: [1000, 450],
        color: "#000000",
        strokeWidth: 1.5,
      },
    ],
    focalObjects: [
      {
        name: "ป้ายราคา",
        shape: "ellipse",
        box: [140, 680, 380, 820],
        color: "#fef08a",
        text: "ชิ้นละ 10 บาท",
        textColor: "#000000",
      },
      {
        name: "ป้ายสโลแกน",
        shape: "ellipse",
        box: [240, 800, 480, 940],
        color: "#ffe4e6",
        text: "อุ่นใจ ใกล้บ้าน",
        textColor: "#000000",
      },
    ],
    texts: [
      {
        text: "ชิ้นละ 10 บาท",
        box: [220, 700, 300, 800],
        fontSize: 18,
        align: "center",
      },
    ],
  };

  it("creates elements positioned side-by-side matching the exact dimensions and aspect ratio of the image", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);
    expect(elements.length).toBeGreaterThan(0);

    // Outer frame must match image width and height
    const outerFrame = elements.find((e) => e.name === "Brief Frame");
    expect(outerFrame).toBeDefined();
    expect(outerFrame?.width).toBe(mockImageElement.width);
    expect(outerFrame?.height).toBe(mockImageElement.height);

    // Target X must be immediately to the right of image with gap (100 + 600 + 40 = 740)
    expect(outerFrame?.x).toBe(740);
    expect(outerFrame?.y).toBe(mockImageElement.y);
  });

  it("creates background partitions with Thai labels and uniform gray guide fills with borders", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);

    const chefZone = elements.find((e) => e.name === "เชฟซูชิ");
    expect(chefZone).toBeDefined();
    expect(chefZone?.backgroundColor).toBe("#e5e5e5");
    expect(chefZone?.strokeWidth).toBeGreaterThan(0);

    const sushiZone = elements.find((e) => e.name === "รูปซูชิ");
    expect(sushiZone).toBeDefined();
    expect(sushiZone?.backgroundColor).toBe("#e5e5e5");
    expect(sushiZone?.strokeWidth).toBeGreaterThan(0);

    // Labels
    const chefLabel = elements.find((e) => e.type === "text" && (e as any).text === "เชฟซูชิ");
    expect(chefLabel).toBeDefined();

    const sushiLabel = elements.find((e) => e.type === "text" && (e as any).text === "รูปซูชิ");
    expect(sushiLabel).toBeDefined();
  });

  it("creates badges (ellipses) with exact Thai text inside", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);

    const priceBadge = elements.find((e) => e.type === "ellipse" && e.name === "ป้ายราคา");
    expect(priceBadge).toBeDefined();
    expect(priceBadge?.backgroundColor).toBe("#e5e5e5");
    expect(priceBadge?.strokeWidth).toBeGreaterThan(0);

    const priceText = elements.find((e) => e.type === "text" && (e as any).text === "ชิ้นละ 10 บาท");
    expect(priceText).toBeDefined();

    const sloganBadge = elements.find((e) => e.type === "ellipse" && e.name === "ป้ายสโลแกน");
    expect(sloganBadge).toBeDefined();
    expect(sloganBadge?.backgroundColor).toBe("#e5e5e5");

    const sloganText = elements.find((e) => e.type === "text" && (e as any).text === "อุ่นใจ ใกล้บ้าน");
    expect(sloganText).toBeDefined();
  });

  it("omits hard divider lines so guide strokes are not copied into generations", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);
    expect(elements.some((e) => e.name === "เส้นแบ่งโซน")).toBe(false);
    expect(elements.filter((e) => e.type !== "text").every((e) => (e.strokeWidth ?? 0) > 0)).toBe(
      true,
    );
  });

  it("groups all generated brief elements together under a unified groupId", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);
    const firstGroupId = elements[0].groupIds[0];
    expect(firstGroupId).toBeTruthy();

    for (const el of elements) {
      expect(el.groupIds).toContain(firstGroupId);
    }
  });

  it("respects targetBounds from dragged preload card placement", () => {
    const draggedBounds = { x: 1200, y: 350, width: 600, height: 400 };
    const elements = generateBriefElements(
      sampleBriefData,
      mockImageElement,
      undefined,
      draggedBounds,
    );
    const outerFrame = elements.find((e) => e.name === "Brief Frame");

    expect(outerFrame).toBeDefined();
    expect(outerFrame?.x).toBe(1200);
    expect(outerFrame?.y).toBe(350);
    expect(outerFrame?.width).toBe(600);
    expect(outerFrame?.height).toBe(400);
  });

  it("verifies 'Convert to Brief' uses the canvas Preload ghost overlay and queue", () => {
    const briefGenSource = readFileSync("lib/ai/briefGenerator.ts", "utf8");
    expect(briefGenSource).toContain("enqueueProcessingJob");
    expect(briefGenSource).toContain('kind: "brief"');
    expect(briefGenSource).toContain('label: "Convert to Brief"');
    expect(briefGenSource).toContain("getProcessingPreviewPlacement");

    const previewOverlaySource = readFileSync(
      "components/Canvas/ProcessingPreviewOverlay.tsx",
      "utf8",
    );
    expect(previewOverlaySource).toContain('brief: "#4d7c0f"');
    expect(previewOverlaySource).toContain("IconBrief");
  });

  it("generates structured Art Direction wireframe brief matching Image 3 specification", () => {
    const artDirectionData: ConvertToBriefData = {
      aspectRatio: { width: 484, height: 280 },
      heroSubject: {
        box: [0, 0, 1000, 396],
        description: "รูปภาพเด็กชาย กำลังยิ้มแย้ม และเล่นน้ำ ขณะใส่ห่วงยางสีน้ำเงิน",
        color: "#dbeafe",
      },
      backgroundZone: {
        box: [0, 396, 1000, 1000],
        description: "พื้นหลังเป็นภาพสวนน้ำ",
        color: "#f5f0eb",
      },
      headlineCard: {
        box: [220, 520, 600, 840],
        text: "สวนน้ำ\nเปิดใหม่",
        color: "#e2e8f0",
      },
      badge: {
        box: [180, 810, 410, 950],
        shape: "ellipse",
        text: "เปิดแล้ว\nวันนี้",
        color: "#fcd34d",
      },
      subtextCard: {
        box: [665, 480, 765, 900],
        text: "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน",
        color: "#e2e8f0",
      },
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [],
      texts: [],
    };

    const elements = generateBriefElements(artDirectionData, mockImageElement);
    expect(elements.length).toBeGreaterThanOrEqual(6);

    // Hero / background zones must NOT be drawn (they become background text frames).
    expect(elements.some((e) => e.name?.startsWith("Hero Subject"))).toBe(false);
    expect(elements.some((e) => e.name?.startsWith("Background Zone"))).toBe(false);
    expect(elements.some((e) => e.name?.startsWith("Hero Label:"))).toBe(false);
    expect(elements.some((e) => e.name?.startsWith("Background Label:"))).toBe(false);
    expect(
      elements.some(
        (e) =>
          e.type === "text" && String((e as { text?: string }).text || "").includes("รูปภาพเด็กชาย"),
      ),
    ).toBe(false);
    expect(
      elements.some(
        (e) =>
          e.type === "text" && String((e as { text?: string }).text || "") === "พื้นหลังเป็นภาพสวนน้ำ",
      ),
    ).toBe(false);

    // 3. Headline Card with "สวนน้ำ\nเปิดใหม่"
    const hlCard = elements.find((e) => e.name === "Headline Card");
    expect(hlCard).toBeDefined();
    expect(hlCard?.strokeWidth).toBeGreaterThan(0);
    const hlText = elements.find((e) => (e as any).text === "สวนน้ำ\nเปิดใหม่");
    expect(hlText).toBeDefined();

    // 4. Promo Badge with "เปิดแล้ว\nวันนี้"
    const badgeShape = elements.find((e) => e.name === "Promo Badge");
    expect(badgeShape).toBeDefined();
    expect(badgeShape?.type).toBe("ellipse");
    expect(badgeShape?.backgroundColor).toBe("#e5e5e5");
    expect(badgeShape?.strokeWidth).toBeGreaterThan(0);
    const badgeText = elements.find((e) => (e as any).text === "เปิดแล้ว\nวันนี้");
    expect(badgeText).toBeDefined();

    // 5. Subtext Card with "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน"
    const subtextCard = elements.find((e) => e.name === "Subtext Card");
    expect(subtextCard).toBeDefined();
    const subtext = elements.find((e) => (e as any).text === "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน");
    expect(subtext).toBeDefined();
  });

  it("renders comprehensive poster with category tags, brand logo, and footer highlights bar", () => {
    const fullPosterData: ConvertToBriefData = {
      aspectRatio: { width: 600, height: 1000 },
      heroSubject: {
        box: [280, 20, 890, 480],
        description: "รูปภาพเด็กชาย กำลังยิ้มแย้ม และเล่นน้ำ ขณะใส่ห่วงยางสีน้ำเงิน",
        color: "#dbeafe",
      },
      backgroundZone: {
        box: [0, 0, 890, 1000],
        description: "พื้นหลังเป็นภาพสวนน้ำและสไลเดอร์",
        color: "#f5f0eb",
      },
      headlineCard: {
        box: [40, 40, 200, 460],
        text: "สวนน้ำ\nเปิดใหม่",
        color: "#e2e8f0",
      },
      subtextCard: {
        box: [190, 70, 230, 410],
        text: "เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน",
        color: "#e2e8f0",
      },
      badge: {
        box: [230, 320, 360, 460],
        shape: "ellipse",
        text: "เปิดแล้ว\nวันนี้",
        color: "#fcd34d",
      },
      featureTags: [
        { text: "WATER SLIDES", box: [350, 15, 410, 130], color: "#fed7aa" },
        { text: "WAVE POOL", box: [405, 15, 465, 125], color: "#fed7aa" },
        { text: "KIDS ZONE", box: [460, 15, 510, 120], color: "#fed7aa" },
        { text: "FOOD & DRINKS", box: [505, 15, 555, 120], color: "#fed7aa" },
        { text: "FAMILY FUN", box: [550, 15, 600, 120], color: "#fed7aa" },
      ],
      brandLogo: {
        box: [480, 330, 540, 450],
        text: "AQUA WORLD",
        subtext: "PROMISE SMILES EVERYDAY",
      },
      footerBar: {
        box: [900, 15, 980, 480],
        color: "#1e293b",
        items: [
          { text: "สนุกได้ทั้งครอบครัว" },
          { text: "ปลอดภัยได้มาตรฐาน" },
          { text: "เดินทางสะดวก" },
          { text: "ความสุข... รอคุณอยู่ที่นี่" },
        ],
      },
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [],
      texts: [],
    };

    const elements = generateBriefElements(fullPosterData, mockImageElement);

    // Verify outer frame
    expect(elements.find((e) => e.name === "Brief Frame")).toBeDefined();

    // Hero / background zones stay off-canvas (no background text frames).
    expect(elements.find((e) => e.name?.startsWith("Hero Subject"))).toBeUndefined();
    expect(elements.find((e) => e.name?.startsWith("Background Zone"))).toBeUndefined();
    expect(
      elements.some(
        (e) => e.type === "text" && String((e as { text?: string }).text || "").includes("เด็กชาย"),
      ),
    ).toBe(false);
    // Verify Category Pills (Feature Tags)
    const tagElements = elements.filter((e) => e.name?.startsWith("Tag: "));
    expect(tagElements).toHaveLength(5);
    expect(elements.some((e) => (e as any).text === "WATER SLIDES")).toBe(true);
    expect(elements.some((e) => (e as any).text === "FAMILY FUN")).toBe(true);

    // Verify Brand Logo
    expect(elements.find((e) => e.name?.startsWith("Logo Zone:"))).toBeDefined();
    expect(elements.some((e) => (e as any).text?.includes("AQUA WORLD"))).toBe(true);

    // Verify Footer Bar
    expect(elements.find((e) => e.name === "Footer Bar")).toBeDefined();
    expect(elements.some((e) => (e as any).text === "สนุกได้ทั้งครอบครัว")).toBe(true);
    expect(elements.some((e) => (e as any).text === "ความสุข... รอคุณอยู่ที่นี่")).toBe(true);

    // Verify all elements are unified under a single groupId
    const firstGroupId = elements[0].groupIds[0];
    expect(firstGroupId).toBeTruthy();
    for (const el of elements) {
      expect(el.groupIds).toContain(firstGroupId);
    }
  });

  it("stacks long footer copy top-to-bottom instead of left-to-right", () => {
    const data: ConvertToBriefData = {
      aspectRatio: { width: 1, height: 1 },
      footerBar: {
        box: [780, 40, 960, 960],
        items: [
          { text: "The Wicked King ราชันเจ้าอุบาย" },
          { text: "นิยายเล่มดังภาคต่อ 'The Cruel Prince'" },
          { text: "ลดแรงที่ร้านนายอินทร์@Thaimart" },
        ],
      },
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [],
      texts: [],
    };

    const elements = generateBriefElements(data, mockImageElement);
    const footerItems = elements.filter((e) => e.name?.startsWith("Footer Item:"));
    expect(footerItems).toHaveLength(3);

    const ys = footerItems.map((e) => e.y);
    expect(ys[0]).toBeLessThan(ys[1]!);
    expect(ys[1]).toBeLessThan(ys[2]!);

    // Same column: x positions should be nearly aligned (not spread across width)
    const xs = footerItems.map((e) => e.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(40);
  });

  it("keeps short equal footer selling points in a left-to-right row", () => {
    const data: ConvertToBriefData = {
      aspectRatio: { width: 1, height: 1 },
      footerBar: {
        box: [900, 15, 980, 480],
        items: [
          { text: "สนุกได้ทั้งครอบครัว" },
          { text: "ปลอดภัยได้มาตรฐาน" },
          { text: "เดินทางสะดวก" },
          { text: "ความสุขรอคุณ" },
        ],
      },
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [],
      texts: [],
    };

    const elements = generateBriefElements(data, mockImageElement);
    const footerItems = elements.filter((e) => e.name?.startsWith("Footer Item:"));
    expect(footerItems).toHaveLength(4);
    const xs = footerItems.map((e) => e.x);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
    expect(xs[2]).toBeLessThan(xs[3]!);
  });

  it("honors explicit footerBar.direction=column even for short items", () => {
    expect(
      resolveFooterBarDirection(
        {
          direction: "column",
          items: [{ text: "A" }, { text: "B" }, { text: "C" }],
        },
        400,
        80,
      ),
    ).toBe("column");
  });

  it("uses the document default typeface (Sarabun) for Brief text, matching Properties", () => {
    const generatorSource = readFileSync("lib/ai/briefGenerator.ts", "utf8");
    expect(generatorSource).toContain("DEFAULT_THAI_FONT_FAMILY");
    expect(generatorSource).not.toContain("Mali");
    expect(generatorSource).not.toContain("'Inter'");

    const texts = generateBriefElements(sampleBriefData, mockImageElement).filter(
      (element): element is TextElement => element.type === "text",
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text.fontFamily).toBe(DEFAULT_THAI_FONT_FAMILY);
      expect(text.fontFamily).toContain("Sarabun");
    }
  });

  it("keeps Brief on the image context bar, not the vector tool rail", () => {
    const objectContextBarSource = readFileSync("components/Canvas/ObjectContextBar.tsx", "utf8");
    expect(objectContextBarSource).toContain(': "Brief"');
    expect(objectContextBarSource).not.toContain('"Convert to Brief"');
    expect(objectContextBarSource).toContain("handleConvertToBrief");

    const editorOptionBarSource = readFileSync("components/Canvas/EditorOptionBar.tsx", "utf8");
    expect(editorOptionBarSource).not.toContain("Convert to Brief");
    expect(editorOptionBarSource).not.toContain("handleToolbarConvertToBrief");
    expect(editorOptionBarSource).not.toContain("IconBrief");
  });

  it("pairs each visual component (Text + Card/Bubble) into its own sub-group while maintaining master group", () => {
    const elements = generateBriefElements(sampleBriefData, mockImageElement);
    const masterGroupId = elements[0].groupIds[0];

    // Check chefZone and chefLabel pair
    const chefZone = elements.find((e) => e.name === "เชฟซูชิ");
    const chefLabel = elements.find((e) => e.type === "text" && (e as any).text === "เชฟซูชิ");
    expect(chefZone).toBeDefined();
    expect(chefLabel).toBeDefined();
    expect(chefZone?.groupIds).toHaveLength(2);
    expect(chefLabel?.groupIds).toHaveLength(2);
    // Both share their innermost sub-group
    expect(chefZone?.groupIds[0]).toBe(chefLabel?.groupIds[0]);
    // Both belong to the master group
    expect(chefZone?.groupIds[1]).toBe(masterGroupId);
    expect(chefLabel?.groupIds[1]).toBe(masterGroupId);

    // Check price badge shape and text pair
    const priceBadge = elements.find((e) => e.type === "ellipse" && e.name === "ป้ายราคา");
    const priceText = elements.find((e) => e.type === "text" && (e as any).text === "ชิ้นละ 10 บาท");
    expect(priceBadge).toBeDefined();
    expect(priceText).toBeDefined();
    expect(priceBadge?.groupIds).toHaveLength(2);
    expect(priceText?.groupIds).toHaveLength(2);
    expect(priceBadge?.groupIds[0]).toBe(priceText?.groupIds[0]);
    expect(priceBadge?.groupIds[1]).toBe(masterGroupId);
    expect(priceText?.groupIds[1]).toBe(masterGroupId);
  });
});
