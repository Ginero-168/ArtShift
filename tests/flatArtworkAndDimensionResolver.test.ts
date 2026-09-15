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

  it("resolves standard ratios properly when explicitly specified", () => {
    expect(resolveImageGenerationDimensions("ภาพแนวนอน 16:9").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("ภาพ 16 : 9").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("แนวนอน").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("landscape").aspectRatio).toBe("16:9");
    expect(resolveImageGenerationDimensions("ภาพแนวตั้ง 9:16").aspectRatio).toBe("9:16");
    expect(resolveImageGenerationDimensions("แนวตั้ง").aspectRatio).toBe("9:16");
    expect(resolveImageGenerationDimensions("portrait").aspectRatio).toBe("9:16");
    expect(resolveImageGenerationDimensions("ภาพ 1:1 สี่เหลี่ยม").aspectRatio).toBe("1:1");
    expect(resolveImageGenerationDimensions("สี่เหลี่ยมจัตุรัส").aspectRatio).toBe("1:1");
    expect(resolveImageGenerationDimensions("square").aspectRatio).toBe("1:1");
    expect(resolveImageGenerationDimensions("ขนาด 4:3").aspectRatio).toBe("4:3");
    expect(resolveImageGenerationDimensions("ขนาด 3:4").aspectRatio).toBe("3:4");
  });

  it("strictly defaults to 1:1 (1024x1024) for prompts without explicit user dimension/ratio", () => {
    // General prompts
    expect(resolveImageGenerationDimensions("ภาพแมวน่ารัก")).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });

    // Prompts with 'banner' / 'แบนเนอร์' should NOT automatically turn into 16:9 unless specified
    expect(resolveImageGenerationDimensions("ออกแบบภาพสำหรับ banner กาแฟ")).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });
    expect(resolveImageGenerationDimensions("ทำรูปแบนเนอร์ร้านอาหาร")).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });

    // Prompts with 'cover' should NOT turn into 16:9
    expect(resolveImageGenerationDimensions("ทำรูปสำหรับ cover เพลง")).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });

    // Prompts with 'story' / 'reel' should NOT turn into 9:16 unless user explicitly specifies
    expect(resolveImageGenerationDimensions("วาดรูปแมวเล่า story น่ารัก")).toEqual({
      width: 1024,
      height: 1024,
      aspectRatio: "1:1",
    });

    // When the user DOES explicitly specify orientation along with banner, it honors the user's choice
    expect(resolveImageGenerationDimensions("ออกแบบ banner แนวนอน")).toEqual({
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
    });
    expect(resolveImageGenerationDimensions("แบนเนอร์แนวตั้ง 9:16")).toEqual({
      width: 720,
      height: 1280,
      aspectRatio: "9:16",
    });
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
    expect(streamlined).toContain("clean horizontal panoramic banner layout");

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

    // Dynamic Asymmetry & Rich Editorial Content (Anti-stiff, anti-bullseye)
    expect(streamlined).toContain("dynamic asymmetric wide panoramic banner composition (rule-of-thirds) avoiding dead-center bullseye symmetry");
    expect(streamlined).toContain("rich editorial typography layout with clear hierarchy");
    expect(streamlined).toContain("The Magic of Affirmation");
    expect(streamlined).toContain("เมื่อคำพูดและความคิดของคุณ กำหนดอนาคตได้");
    expect(streamlined).toContain("คิดมาก (The Manifest Master)");
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

  it("preserves refined flat 2D prompt across multiple image variations without degrading to 3D mockup", () => {
    const singleRefinedPrompt =
      "Flat 2D graphic design artwork, direct front-facing 90-degree orthogonal view, full-bleed clean rectangular banner layout, modern corporate graphic design, sharp digital vector illustration and typography, pristine flat surface, completely flat composition, no 3D mockup, no room environment, no bookshelf, no wooden shelf, no books underneath, no table, no physical acrylic stand, no angled perspective, isolated 2D graphic artwork file for printing. Aspect ratio 3:1 (e.g., 1536x512 pixels). The design incorporates the visual theme of the 'Manifest' book by Kidmak. The text 'Welearn' is centrally placed.";

    // Both single and multi-image tasks must be preserved through sanitizeAndPrepareImagePrompt
    const singleSanitized = sanitizeAndPrepareImagePrompt(
      `${singleRefinedPrompt}. Output constraints: one standalone image only, do not create a collage or multi-panel composition.`,
    );
    expect(singleSanitized).toContain("Flat 2D graphic design artwork");
    expect(singleSanitized).toContain("no 3D mockup");
    expect(singleSanitized).not.toContain("commercial advertising poster design");

    const multiPrompt1 = `${singleRefinedPrompt}\nDistinct variation 1 of 3 (focusing on deep obsidian black theme and high-contrast glow). Output constraints: one standalone image only, do not create a collage or multi-panel composition.`;
    const multiSanitized1 = sanitizeAndPrepareImagePrompt(multiPrompt1);
    expect(multiSanitized1).toContain("Flat 2D graphic design artwork");
    expect(multiSanitized1).toContain("no 3D mockup");
    expect(multiSanitized1).not.toContain("commercial advertising poster design");

    const multiPromptWithThaiBrief = `${singleRefinedPrompt}\nVariation 1 (ป้ายหมวด Welearn โทนสีดำ). Output constraints: one standalone image only, do not create a collage or multi-panel composition.`;
    const multiSanitizedThai = sanitizeAndPrepareImagePrompt(multiPromptWithThaiBrief);
    expect(multiSanitizedThai).toContain("Flat 2D graphic design artwork");
    expect(multiSanitizedThai).toContain("no 3D mockup");
    expect(multiSanitizedThai).not.toContain("commercial advertising poster design");
  });
});
