import { describe, expect, it } from "vitest";
import { isUsableBriefLayout, parseBriefResponse } from "@/lib/ai/briefParser";

describe("Convert to Brief API Parser", () => {
  it("parses valid JSON response from vision model with exact wireframe brief schema", () => {
    const rawAiOutput = JSON.stringify({
      aspectRatio: { width: 1000, height: 700 },
      backgroundPartitions: [
        { name: "เชฟซูชิ", box: [0, 0, 450, 1000], color: "#e0e7ff", labelPlacement: "top-left" },
        { name: "รูปซูชิ", box: [450, 0, 1000, 1000], color: "#cffafe", labelPlacement: "center" },
      ],
      dividers: [
        { start: [0, 450], end: [1000, 450], color: "#000000", strokeWidth: 1.5 },
      ],
      focalObjects: [
        { name: "ป้ายราคา", shape: "ellipse", box: [140, 680, 380, 820], color: "#fef08a", text: "ชิ้นละ 10 บาท" },
        { name: "ป้ายสโลแกน", shape: "ellipse", box: [240, 800, 480, 940], color: "#ffe4e6", text: "อุ่นใจ ใกล้บ้าน" },
      ],
      texts: [
        { text: "ชิ้นละ 10 บาท", box: [220, 700, 300, 800], fontSize: 18, align: "center" },
        { text: "อุ่นใจ ใกล้บ้าน", box: [320, 820, 390, 920], fontSize: 16, align: "center" },
      ],
    });

    const parsed = parseBriefResponse(rawAiOutput);
    expect(parsed).not.toBeNull();
    expect(isUsableBriefLayout(parsed)).toBe(true);
    expect(parsed?.backgroundPartitions).toHaveLength(2);
    expect(parsed?.backgroundPartitions[0].name).toBe("เชฟซูชิ");
    expect(parsed?.backgroundPartitions[1].name).toBe("รูปซูชิ");
    expect(parsed?.dividers).toHaveLength(1);
    expect(parsed?.focalObjects).toHaveLength(2);
    expect(parsed?.focalObjects[0].text).toBe("ชิ้นละ 10 บาท");
    expect(parsed?.focalObjects[1].text).toBe("อุ่นใจ ใกล้บ้าน");
  });

  it("handles markdown codeblocks in raw AI response", () => {
    const rawAiOutput = `\`\`\`json
{
  "aspectRatio": { "width": 800, "height": 600 },
  "backgroundPartitions": [
    { "name": "ฉากหลัง", "box": [0, 0, 500, 1000], "color": "#f1f5f9" }
  ],
  "dividers": [],
  "focalObjects": [
    { "name": "วงกลม", "shape": "ellipse", "box": [100, 100, 300, 300], "color": "#fef08a", "text": "โปรโมชั่น" }
  ],
  "texts": []
}
\`\`\``;

    const parsed = parseBriefResponse(rawAiOutput);
    expect(parsed).not.toBeNull();
    expect(parsed?.focalObjects[0].shape).toBe("ellipse");
    expect(parsed?.focalObjects[0].text).toBe("โปรโมชั่น");
  });

  it("returns no result when the AI response has no usable layout data", () => {
    const parsed = parseBriefResponse(JSON.stringify({
      aspectRatio: { width: 1200, height: 800 },
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [],
      texts: [],
    }));

    expect(parsed).not.toBeNull();
    expect(isUsableBriefLayout(parsed)).toBe(false);
    expect(parsed?.heroSubject).toBeUndefined();
    expect(parsed?.headlineCard).toBeUndefined();
    expect(parsed?.backgroundZone).toBeUndefined();
    expect(parsed?.backgroundPartitions).toHaveLength(0);
  });

  it("parses structured Art Direction output matching Image 3 components", () => {
    const rawAiOutput = JSON.stringify({
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
    });

    const parsed = parseBriefResponse(rawAiOutput);
    expect(parsed).not.toBeNull();
    expect(parsed?.heroSubject?.description).toBe("รูปภาพเด็กชาย กำลังยิ้มแย้ม และเล่นน้ำ ขณะใส่ห่วงยางสีน้ำเงิน");
    expect(parsed?.backgroundZone?.description).toBe("พื้นหลังเป็นภาพสวนน้ำ");
    expect(parsed?.headlineCard?.text).toBe("สวนน้ำ\nเปิดใหม่");
    expect(parsed?.badge?.text).toBe("เปิดแล้ว\nวันนี้");
    expect(parsed?.badge?.shape).toBe("ellipse");
    expect(parsed?.subtextCard?.text).toBe("เปิดรับความสุขกับทุกครอบครัวไปด้วยกัน");

    // Also verifies backward-compatible synthesized partitions
    expect(parsed?.backgroundPartitions.length).toBeGreaterThanOrEqual(2);
    expect(parsed?.focalObjects.length).toBeGreaterThanOrEqual(3);
  });

  it("parses comprehensive poster details including featureTags, brandLogo, and footerBar", () => {
    const rawAiOutput = JSON.stringify({
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
    });

    const parsed = parseBriefResponse(rawAiOutput);
    expect(parsed).not.toBeNull();
    expect(parsed?.featureTags).toHaveLength(5);
    expect(parsed?.featureTags?.[0].text).toBe("WATER SLIDES");
    expect(parsed?.featureTags?.[4].text).toBe("FAMILY FUN");

    expect(parsed?.brandLogo?.text).toBe("AQUA WORLD");
    expect(parsed?.brandLogo?.subtext).toBe("PROMISE SMILES EVERYDAY");

    expect(parsed?.footerBar?.items).toHaveLength(4);
    expect(parsed?.footerBar?.items[0].text).toBe("สนุกได้ทั้งครอบครัว");
    expect(parsed?.footerBar?.items[3].text).toBe("ความสุข... รอคุณอยู่ที่นี่");

    // Backward compatibility: featureTags should also populate focalObjects
    expect(parsed?.focalObjects.some((o) => o.text === "WATER SLIDES")).toBe(true);
  });

  it("drops photographic shirt/background slogans that sit inside the hero subject", () => {
    const rawAiOutput = JSON.stringify({
      aspectRatio: { width: 600, height: 1000 },
      heroSubject: {
        box: [250, 80, 900, 620],
        description: "เด็กผู้ชายยิ้มแย้มใส่ชุดว่ายน้ำลายฉลามในสวนน้ำ",
        color: "#dbeafe",
      },
      headlineCard: {
        box: [40, 40, 200, 460],
        text: "สวนน้ำ\nเปิดใหม่",
        color: "#e2e8f0",
      },
      texts: [
        { text: "SMALL SPLASH BIG DREAMS", box: [620, 220, 700, 520], fontSize: 14 },
        { text: "สวนน้ำ\nเปิดใหม่", box: [40, 40, 200, 460], fontSize: 28 },
      ],
      intentionalTexts: [
        { text: "MORE NOISE ON TOWEL", box: [700, 300, 760, 500] },
      ],
      backgroundPartitions: [],
      dividers: [],
      focalObjects: [
        {
          name: "shirt slogan",
          shape: "rect",
          box: [640, 240, 690, 500],
          color: "#ffffff",
          text: "SMALL SPLASH BIG DREAMS",
        },
      ],
      textsLegacyIgnored: [],
    });

    const parsed = parseBriefResponse(rawAiOutput);
    expect(parsed).not.toBeNull();
    expect(parsed?.texts.some((t) => /small splash/i.test(t.text))).toBe(false);
    expect(parsed?.texts.some((t) => /towel/i.test(t.text))).toBe(false);
    expect(parsed?.focalObjects.some((o) => /small splash/i.test(o.text || ""))).toBe(false);
    expect(parsed?.headlineCard?.text).toContain("สวนน้ำ");
  });
});
