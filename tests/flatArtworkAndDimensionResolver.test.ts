import { describe, expect, it } from "vitest";
import {
  resolveImageGenerationDimensions,
  sanitizeAndPrepareImagePrompt,
  streamlinePromptForImageGen,
} from "@/lib/ai/imageGeneration";
import { retrieveDesignKnowledge } from "@/lib/ai/knowledge/designKnowledge";

describe("Physical Dimension and Aspect Ratio Resolver", () => {
  it("resolves 60x20cm shelf sign prompt to a 3:1 wide panoramic banner (1536x512)", () => {
    const prompt =
      'ออกแบบป้ายหมวดติดตั้งบนชั้นวางหนังสือใส่ Logo สำนักพิมพ์ Welearn โดยอยากใช้ธีมหนังสือ Manifest ของคิดมาก บนป้ายเน้นชื่อสำนักพิมพ์ Welearn และใส่โลโก้สำนักพิมพ์ ป้ายขนาด 60x20cm.';
    const dimensions = resolveImageGenerationDimensions(prompt);

    expect(dimensions.width).toBe(1536);
    expect(dimensions.height).toBe(512);
    expect(dimensions.aspectRatio).toBe("16:9");
  });

  it("resolves various 3:1 physical ratios (60x20, 120x40cm, 30x10)", () => {
    expect(resolveImageGenerationDimensions("ป้าย 60x20").width).toBe(1536);
    expect(resolveImageGenerationDimensions("ป้าย 60x20").height).toBe(512);

    expect(resolveImageGenerationDimensions("ขนาด 120 x 40 cm").width).toBe(1536);
    expect(resolveImageGenerationDimensions("ขนาด 120 x 40 cm").height).toBe(512);

    expect(resolveImageGenerationDimensions("30x10cm").width).toBe(1536);
    expect(resolveImageGenerationDimensions("30x10cm").height).toBe(512);
  });

  it("resolves standard ratios properly", () => {
    expect(resolveImageGenerationDimensions("ภาพแนวนอน 16:9").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("ภาพแนวตั้ง 9:16").aspectRatio).toBe("9:16");
    expect(resolveImageGenerationDimensions("ภาพ 1:1 สี่เหลี่ยม").aspectRatio).toBe("1:1");
  });
});

describe("Anti-Mockup & Flat 2D Graphic Design Prompt Synthesis", () => {
  const userPrompt =
    'ออกแบบป้ายหมวดติดตั้งบนชั้นวางหนังสือใส่ Logo สำนักพิมพ์ Welearn โดยอยากใช้ธีมหนังสือ Manifest ของคิดมาก บนป้ายเน้นชื่อสำนักพิมพ์ Welearn และใส่โลโก้สำนักพิมพ์ ป้ายขนาด 60x20cm.';

  it("enforces flat 2D graphic design artwork and strict anti-mockup rules", () => {
    const streamlined = streamlinePromptForImageGen(userPrompt);

    // Flat 2D Graphic Art Directives
    expect(streamlined).toContain("flat 2D graphic design artwork");
    expect(streamlined).toContain("direct front-facing 90-degree orthogonal view");
    expect(streamlined).toContain("full-bleed rectangular banner layout");

    // Anti-Mockup Rules (No room, no wooden shelf, no books underneath)
    expect(streamlined).toContain("no 3D mockup");
    expect(streamlined).toContain("no room environment");
    expect(streamlined).toContain("no bookshelf");
    expect(streamlined).toContain("no wooden shelf");
    expect(streamlined).toContain("no books underneath");

    // Manifest Theme
    expect(streamlined).toContain("Manifest book aesthetic theme");
    expect(streamlined).toContain("radiant golden and red circular light halo");

    // Welearn Publishing Identity
    expect(streamlined).toContain("Welearn publishing brand identity");
    expect(streamlined).toContain('"Welearn"');
  });

  it("pre-flight sanitization detects signage requests and applies flat 2D streamlining immediately", () => {
    const sanitized = sanitizeAndPrepareImagePrompt(userPrompt);

    expect(sanitized).toContain("flat 2D graphic design artwork");
    expect(sanitized).toContain("no 3D mockup");
    expect(sanitized).toContain("Manifest");
  });
});

describe("Signage & Banner Design Knowledge Retrieval", () => {
  it("retrieves signage-banner skill for shelf signage prompt", () => {
    const results = retrieveDesignKnowledge(
      "ออกแบบป้ายหมวดติดตั้งบนชั้นวางหนังสือ ป้ายขนาด 60x20cm",
      3,
    );

    expect(results.some((r) => r.id === "signage-banner")).toBe(true);
    const signageSkill = results.find((r) => r.id === "signage-banner");
    expect(signageSkill?.guidance.some((g) => g.includes("flat 2D graphic design artwork"))).toBe(
      true,
    );
  });
});
