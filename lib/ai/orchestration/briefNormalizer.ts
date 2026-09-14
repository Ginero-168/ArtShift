/**
 * AI Image Generation Brief Specification v1 - Brief Normalizer & Prompt Rewriter
 *
 * Normalizes raw user prompts into structured ImageGenerationBriefV1 objects
 * and executes "Rewrite before Reject" transformations.
 */

import type {
  ImageGenerationBriefV1,
  ReferenceImageType,
} from "./briefSpecV1";
import { analyzePromptRisk } from "./promptRiskAnalyzer";

export interface BriefNormalizerOptions {
  hasReference?: boolean;
  referenceTypes?: ReferenceImageType[];
  aspectRatio?: string;
  width?: number;
  height?: number;
  quality?: "low" | "medium" | "high" | "ultra";
  logoAssetAvailable?: boolean;
}

export function normalizeUserBriefToV1(
  rawPrompt: string,
  options: BriefNormalizerOptions = {},
): ImageGenerationBriefV1 {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();

  // 1. Risk Analysis
  const riskAnalysis = analyzePromptRisk(prompt, {
    hasReference: options.hasReference,
    referenceTypes: options.referenceTypes,
  });

  // 2. Identify Brand & Logo
  let brandName = "";
  let brandPresent = false;
  const brandMatch = /(?:welearn|วีเลิร์น|apple|nike|adidas|starbucks|samsung)/i.exec(prompt);
  if (brandMatch) {
    brandPresent = true;
    const matched = brandMatch[0].toLowerCase();
    brandName = matched.includes("welearn") || matched.includes("วีเลิร์น") ? "Welearn" : matched;
  }
  const wantsExactLogo =
    /(?:โลโก้|logo|brand mark)/i.test(prompt) || brandPresent;

  // 3. Identify Text & Typography requirements
  const hasThai = /[\u0E00-\u0E7F]/.test(prompt);
  const quotes: string[] = [];
  const quoteRegex = /["“'「]([^"”'」]+)["”'」]/g;
  let qMatch: RegExpExecArray | null;
  while ((qMatch = quoteRegex.exec(prompt)) !== null) {
    quotes.push(qMatch[1].trim());
  }

  const exactText: string[] = [...quotes];
  if (brandName && !exactText.includes(brandName)) {
    exactText.push(brandName);
    if (brandName === "Welearn") {
      exactText.push("สำนักพิมพ์ Welearn");
    }
  }

  const textRequired = exactText.length > 0 || /(?:ข้อความ|พาดหัว|title|ชื่อเรื่อง|headline)/i.test(prompt);

  // 4. Identify Signage / Shelf / Poster / Banner Output Types
  const isShelfSign = /(?:ป้ายหมวด|ป้ายติดบนชั้น|ชั้นวางหนังสือ|shelf\s*sign|shelf\s*header)/i.test(prompt);
  const isPoster = /(?:โปสเตอร์|poster|publishing\s*poster)/i.test(prompt) || /welearn/i.test(prompt);
  const isBanner = /(?:แบนเนอร์|banner|ป้ายขนาด)/i.test(prompt);

  let outputType: ImageGenerationBriefV1["task"]["output_type"] = "poster";
  if (isShelfSign) outputType = "shelf_sign";
  else if (isPoster && brandName === "Welearn") outputType = "publishing_poster";
  else if (isBanner) outputType = "banner";

  // 5. Concept & Aesthetic Theme
  const isManifestTheme = /(?:manifest|คิดมาก)/i.test(prompt);
  const isThaiFood = /(?:อาหารไทย|thai\s*food)/i.test(prompt);

  let concept = "commercial advertising visual";
  const mood: string[] = ["professional", "clean"];
  const visualKeywords: string[] = [];
  const colorPalette: string[] = [];
  const effects: string[] = [];

  if (isManifestTheme) {
    concept = "manifestation energy";
    mood.push("premium", "mysterious", "powerful", "aspirational");
    colorPalette.push("obsidian black", "crimson red", "metallic gold");
    effects.push("energy ring", "radiant halo", "subtle particles", "volumetric glow");
    visualKeywords.push(
      "abstract circular energy halo",
      "radiant red and gold illumination",
      "luminous particles",
    );
  } else if (isThaiFood) {
    concept = "authentic Thai culinary feast";
    mood.push("vibrant", "appetizing", "celebratory", "authentic");
    colorPalette.push("warm amber", "golden saffron", "fresh emerald green", "deep chili red");
    visualKeywords.push("gourmet Thai dishes", "steam", "fresh aromatic herbs");
  }

  // 6. Composition & Camera
  let composition = "balanced hero visual with deliberate negative space";
  let camera = "cinematic eye-level framing";

  if (isShelfSign || isBanner) {
    composition =
      "dynamic asymmetric 2D graphic layout, rule-of-thirds composition, hero key visual offset to one side with radiant volumetric glow, balanced editorial multi-tiered typography on the other side with brand header, series title, and compelling book taglines, no dead-center bullseye, no empty void";
    camera = "direct front-facing 90-degree orthogonal view";
  } else if (isManifestTheme) {
    composition =
      "dynamic asymmetric composition with radiant golden and crimson energy halo offset using rule-of-thirds, volumetric glow and stardust, rich editorial typography hierarchy with brand, series title, and inspiring taglines, luxury publishing aesthetics";
    camera = "direct front-facing 90-degree orthogonal view";
  }

  // 7. Negative Prompts (Anti-Mockup & Diffusion Hallucination Guards)
  const negativePrompt: string[] = [
    "distorted text",
    "illegible typography",
    "misspelled words",
    "blurry details",
    "oversaturated noise",
  ];

  if (isShelfSign || isBanner || /(?:ป้าย|artwork)/i.test(prompt)) {
    negativePrompt.push(
      "3d mockup",
      "physical shelf",
      "wooden bookshelf",
      "books underneath",
      "angled perspective",
      "acrylic stand",
      "room background",
      "store environment",
    );
  }

  // 8. Construct ImageGenerationBriefV1
  const brief: ImageGenerationBriefV1 = {
    task: {
      type: "image_generation",
      use_case: "commercial_advertising",
      output_type: outputType,
    },
    subject: {
      primary_subject: isManifestTheme
        ? "Manifestation-inspired abstract luminous energy ring"
        : isThaiFood
          ? "Grand banquet of popular authentic Thai cuisine dishes"
          : "Commercial advertising visual subject",
      secondary_subjects: isManifestTheme
        ? ["abstract circular energy halo", "subtle glowing particles", "metallic accents"]
        : [],
      people: {
        present: /(?:คน|ผู้คน|people|crowd)/i.test(prompt),
        real_person: false,
        public_figure: false,
        minor: false,
      },
    },
    visual_direction: {
      concept,
      mood: Array.from(new Set(mood)),
      visual_keywords: visualKeywords,
      composition,
      camera,
      lighting: isManifestTheme
        ? "cinematic red and gold volumetric glow, soft atmospheric illumination"
        : "commercial studio lighting with crisp rim highlights",
      background: isManifestTheme
        ? "deep matte obsidian black"
        : "clean minimal studio backdrop",
      color_palette: colorPalette.length > 0 ? colorPalette : ["neutral studio palette"],
      material: isManifestTheme ? ["matte black texture", "metallic gold accents"] : [],
      effects,
    },
    style: {
      category: "contemporary commercial graphic design",
      era: "modern contemporary",
      medium: "digital illustration and graphic design",
      references: [],
      artist_reference: null,
      copyrighted_work_reference: isManifestTheme ? "Manifest (Kidmak) publication theme" : null,
    },
    branding: {
      brand_present: brandPresent,
      brand_name: brandName,
      exact_logo_required: wantsExactLogo,
      logo_asset_available: options.logoAssetAvailable ?? brandPresent,
      brand_colors: brandName === "Welearn" ? ["#FFFFFF", "#D32F2F", "#000000"] : [],
      brand_guidelines: brandName === "Welearn" ? "Welearn publishing contemporary typography" : "",
    },
    text: {
      text_required: textRequired,
      exact_text: exactText,
      language: hasThai ? "th" : "en",
      // Rule 8 & 9: Image Model should NOT render final text; graphic engine overlays text!
      ai_should_render_text: false,
      reserve_text_area: true,
    },
    reference_images: {
      provided: options.hasReference ?? false,
      reference_type: options.referenceTypes ?? (options.hasReference ? ["STYLE_REFERENCE", "COLOR_REFERENCE"] : []),
      preserve_identity: false,
      preserve_composition: true,
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
      trademark: brandPresent,
      logo_reproduction: false,
      copyrighted_character: false,
      copyrighted_design: false,
      living_artist_style: false,
    },
    technical: {
      aspect_ratio: options.aspectRatio ?? (isShelfSign ? "3:1" : "1:1"),
      width: options.width ?? (isShelfSign ? 1800 : 1024),
      height: options.height ?? (isShelfSign ? 600 : 1024),
      quality: options.quality ?? "high",
      background: "opaque",
      number_of_outputs: 1,
    },
    negative_prompt: Array.from(new Set(negativePrompt)),
    post_processing: {
      add_logo_after_generation: wantsExactLogo,
      add_text_after_generation: textRequired,
      upscale: true,
      background_removal: false,
    },
  };

  return brief;
}
