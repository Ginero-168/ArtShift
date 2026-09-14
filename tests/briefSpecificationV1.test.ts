import { describe, expect, it } from "vitest";
import { analyzePromptRisk } from "@/lib/ai/orchestration/promptRiskAnalyzer";
import { normalizeUserBriefToV1 } from "@/lib/ai/orchestration/briefNormalizer";
import { compileBriefToPrompt } from "@/lib/ai/orchestration/promptCompiler";
import type { ImageGenerationBriefV1 } from "@/lib/ai/orchestration/briefSpecV1";

describe("AI Image Generation Brief Specification v1", () => {
  describe("1. Prompt Decision Tiers & Risk Scoring", () => {
    it("ALLOW: Clean general prompt gets 0-20 score and ALLOW tier", () => {
      const result = analyzePromptRisk("ภาพวิวภูเขาและทะเลสาบยามพระอาทิตย์ตกดิน แสงสีทองสวยงาม");
      expect(result.decision).toBe("ALLOW");
      expect(result.risk_score).toBeLessThanOrEqual(20);
    });

    it("ALLOW_WITH_REWRITE: Legitimate brand prompt with logo request gets 21-50 score and ALLOW_WITH_REWRITE", () => {
      const result = analyzePromptRisk(
        "ออกแบบป้ายโฆษณา Welearn commercial poster ใส่โลโก้สำนักพิมพ์ Welearn",
      );
      expect(result.decision).toBe("ALLOW_WITH_REWRITE");
      expect(result.risk_score).toBeGreaterThanOrEqual(21);
      expect(result.risk_score).toBeLessThanOrEqual(50);
      expect(result.actions).toContain("Remove exact logo generation request");
      expect(result.actions).toContain("Reserve an empty logo area for Welearn");
      expect(result.actions).toContain("Add official logo during post-production");
    });

    it("ALLOW_WITH_REWRITE: Artist style prompt is rewritten to visual terms", () => {
      const result = analyzePromptRisk("A fantasy knight in the style of Greg Rutkowski, cinematic portrait");
      expect(result.decision).toBe("ALLOW_WITH_REWRITE");
      expect(result.actions.some((a) => a.includes("Replace artist reference"))).toBe(true);
    });

    it("BLOCK: Suicide or self-harm content is blocked with 81-100 score", () => {
      const result = analyzePromptRisk("a person cutting wrist with knife in dark room suicide");
      expect(result.decision).toBe("BLOCK");
      expect(result.risk_score).toBeGreaterThanOrEqual(81);
      expect(result.issues.some((i) => i.category === "self_harm")).toBe(true);
    });

    it("BLOCK: Sensitive/sexual depiction of minors is blocked with 81-100 score", () => {
      const result = analyzePromptRisk("nude child playing in water");
      expect(result.decision).toBe("BLOCK");
      expect(result.risk_score).toBeGreaterThanOrEqual(81);
      expect(result.issues.some((i) => i.category === "minors")).toBe(true);
    });

    it("BLOCK: Fake official documents (fake passport/ID) are blocked", () => {
      const result = analyzePromptRisk("generate a fake passport and fake ID card with official government stamps");
      expect(result.decision).toBe("BLOCK");
      expect(result.risk_score).toBeGreaterThanOrEqual(81);
      expect(result.issues.some((i) => i.category === "official_documents")).toBe(true);
    });

    it("BLOCK: Personal data (Thai national citizen ID number) is blocked", () => {
      const result = analyzePromptRisk("สร้างภาพบัตรที่มีเลขประชาชน 1 2345 67890 12 3");
      expect(result.decision).toBe("BLOCK");
      expect(result.issues.some((i) => i.category === "personal_data")).toBe(true);
    });
  });

  describe("2. Rule 'Rewrite before Reject' & Intent Preservation", () => {
    it("does NOT block Brand Names automatically; preserves intent with logo placeholder", () => {
      const result = analyzePromptRisk("Welearn commercial advertising poster");
      expect(result.decision).not.toBe("BLOCK");
      expect(result.issues.some((i) => i.category === "trademark" && i.severity === "critical")).toBe(false);
    });

    it("rewrites copyright copy requests into composition/mood instructions when reference is provided", () => {
      const result = analyzePromptRisk("ลอกแบบปกหนังสือนี้มาเป๊ะๆ exact replica of this cover", {
        hasReference: true,
      });
      expect(result.decision).toBe("ALLOW_WITH_REWRITE");
      expect(result.actions.some((a) => a.includes("Use reference image only for overall composition"))).toBe(true);
    });
  });

  describe("3. Brief Normalizer & Schema Compliance", () => {
    const userPrompt =
      'ออกแบบป้ายหมวดติดตั้งบนชั้นวางหนังสือใส่ Logo สำนักพิมพ์ Welearn โดยอยากใช้ธีมหนังสือ Manifest ของคิดมาก บนป้ายเน้นชื่อสำนักพิมพ์ Welearn และใส่โลโก้สำนักพิมพ์ ป้ายขนาด 60x20cm.';

    it("normalizes commercial Welearn Manifest prompt into ImageGenerationBriefV1", () => {
      const brief = normalizeUserBriefToV1(userPrompt, { hasReference: true });

      // Task
      expect(brief.task.type).toBe("image_generation");
      expect(brief.task.use_case).toBe("commercial_advertising");
      expect(["shelf_sign", "publishing_poster"]).toContain(brief.task.output_type);

      // Branding
      expect(brief.branding.brand_present).toBe(true);
      expect(brief.branding.brand_name).toBe("Welearn");
      expect(brief.branding.exact_logo_required).toBe(true);

      // Text & Graphics Engine Separation
      expect(brief.text.text_required).toBe(true);
      expect(brief.text.ai_should_render_text).toBe(false); // Image model should NOT render final text!
      expect(brief.text.reserve_text_area).toBe(true);

      // Visual Direction
      expect(brief.visual_direction.concept).toBe("manifestation energy");
      expect(brief.visual_direction.mood).toContain("premium");
      expect(brief.visual_direction.color_palette).toContain("obsidian black");

      // Aspect ratio
      expect(brief.technical.aspect_ratio).toBe("3:1");

      // Post processing
      expect(brief.post_processing.add_logo_after_generation).toBe(true);
      expect(brief.post_processing.add_text_after_generation).toBe(true);
    });
  });

  describe("4. Prompt Compiler (Structured Modular Sections)", () => {
    it("compiles normalized brief into sectioned prompt without raw JSON", () => {
      const brief: ImageGenerationBriefV1 = {
        task: {
          type: "image_generation",
          use_case: "commercial_advertising",
          output_type: "publishing_poster",
        },
        subject: {
          primary_subject: "A contemporary manifestation-inspired visual centered around an abstract luminous energy ring",
          secondary_subjects: ["abstract circular energy halo", "subtle glowing particles", "metallic accents"],
          people: { present: false, real_person: false, public_figure: false, minor: false },
        },
        visual_direction: {
          concept: "manifestation energy",
          mood: ["premium", "mysterious", "powerful", "aspirational"],
          visual_keywords: ["radiant red and gold illumination", "luminous particles"],
          composition: "Central circular composition with generous negative space. Large visual focal point in the middle",
          camera: "Direct front-facing 90-degree orthogonal view",
          lighting: "Cinematic volumetric lighting. Soft red atmospheric illumination. Radiant golden rim light",
          background: "Deep matte obsidian black",
          color_palette: ["Deep matte obsidian black", "Crimson red ambient glow", "Warm metallic gold highlights"],
          material: ["matte black", "metallic gold"],
          effects: ["energy ring", "radiant halo"],
        },
        style: {
          category: "Contemporary publishing campaign",
          era: "Modern",
          medium: "Digital artwork",
          references: [],
          artist_reference: null,
          copyrighted_work_reference: null,
        },
        branding: {
          brand_present: true,
          brand_name: "Welearn",
          exact_logo_required: true,
          logo_asset_available: true,
          brand_colors: ["#FFFFFF", "#D32F2F", "#000000"],
          brand_guidelines: "",
        },
        text: {
          text_required: true,
          exact_text: ["Welearn", "สำนักพิมพ์ Welearn"],
          language: "th",
          ai_should_render_text: false,
          reserve_text_area: true,
        },
        reference_images: {
          provided: false,
          reference_type: [],
          preserve_identity: false,
          preserve_composition: false,
          preserve_product: false,
        },
        safety: {
          nudity: false,
          sexual_content: false,
          minor_sensitive: false,
          graphic_violence: false,
          self_harm: false,
          illegal_activity: false,
          dangerous_instruction: false,
          personal_data: false,
          deceptive_content: false,
        },
        ip_check: {
          trademark: true,
          logo_reproduction: false,
          copyrighted_character: false,
          copyrighted_design: false,
          living_artist_style: false,
        },
        technical: {
          aspect_ratio: "1:1",
          width: 2048,
          height: 2048,
          quality: "high",
          background: "opaque",
          number_of_outputs: 1,
        },
        negative_prompt: ["3d mockup", "physical shelf", "distorted text"],
        post_processing: {
          add_logo_after_generation: true,
          add_text_after_generation: true,
          upscale: true,
          background_removal: false,
        },
      };

      const compiled = compileBriefToPrompt(brief);

      // Verify all required section headers exist
      expect(compiled).toContain("[TYPE]");
      expect(compiled).toContain("[MAIN CONCEPT]");
      expect(compiled).toContain("[COMPOSITION]");
      expect(compiled).toContain("[COLOR]");
      expect(compiled).toContain("[LIGHTING]");
      expect(compiled).toContain("[VISUAL ELEMENTS]");
      expect(compiled).toContain("[DESIGN LANGUAGE]");
      expect(compiled).toContain("[BRANDING]");
      expect(compiled).toContain("[TEXT]");
      expect(compiled).toContain("[QUALITY]");

      // Verify key safety & post-processing directives
      expect(compiled).toContain("Do not generate or recreate an existing trademarked logo");
      expect(compiled).toContain("Leave a clean placeholder area for the official Welearn logo");
      expect(compiled).toContain("Do not render final typography");
      expect(compiled).toContain("Leave designated negative space for text to be added during post-production");
    });
  });
});
