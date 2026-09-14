/**
 * AI Image Generation Brief Specification v1 - Domain Types & Contracts
 * Based on # AI Image Generation Brief Specification v1
 */

export type PromptDecisionTier = "ALLOW" | "ALLOW_WITH_REWRITE" | "REQUIRE_REVIEW" | "BLOCK";

export type ReferenceImageType =
  | "STYLE_REFERENCE"
  | "COMPOSITION_REFERENCE"
  | "COLOR_REFERENCE"
  | "CHARACTER_REFERENCE"
  | "PRODUCT_REFERENCE"
  | "POSE_REFERENCE"
  | "LIGHTING_REFERENCE"
  | "LAYOUT_REFERENCE";

export interface BriefTaskSpec {
  type: "image_generation" | "image_edit" | "image_variation";
  use_case: "commercial_advertising" | "editorial" | "product_showcase" | "social_media" | "personal";
  output_type: "poster" | "publishing_poster" | "banner" | "shelf_sign" | "artwork" | "illustration" | "photo";
}

export interface BriefSubjectSpec {
  primary_subject: string;
  secondary_subjects: string[];
  people: {
    present: boolean;
    real_person: boolean;
    public_figure: boolean;
    minor: boolean;
  };
}

export interface BriefVisualDirectionSpec {
  concept: string;
  mood: string[];
  visual_keywords: string[];
  composition: string;
  camera: string;
  lighting: string;
  background: string;
  color_palette: string[];
  material: string[];
  effects: string[];
}

export interface BriefStyleSpec {
  category: string;
  era: string;
  medium: string;
  references: string[];
  artist_reference: string | null;
  copyrighted_work_reference: string | null;
}

export interface BriefBrandingSpec {
  brand_present: boolean;
  brand_name: string;
  exact_logo_required: boolean;
  logo_asset_available: boolean;
  brand_colors: string[];
  brand_guidelines: string;
}

export interface BriefTextSpec {
  text_required: boolean;
  exact_text: string[];
  language: "th" | "en" | "multi";
  ai_should_render_text: boolean;
  reserve_text_area: boolean;
}

export interface BriefReferenceImagesSpec {
  provided: boolean;
  reference_type: ReferenceImageType[];
  preserve_identity: boolean;
  preserve_composition: boolean;
  preserve_product: boolean;
}

export interface BriefSafetySpec {
  nudity: boolean;
  sexual_content: boolean;
  minor_sensitive: boolean;
  graphic_violence: boolean;
  self_harm: boolean;
  illegal_activity: boolean;
  dangerous_instruction: boolean;
  personal_data: boolean;
  deceptive_content: boolean;
}

export interface BriefIpCheckSpec {
  trademark: boolean;
  logo_reproduction: boolean;
  copyrighted_character: boolean;
  copyrighted_design: boolean;
  living_artist_style: boolean;
}

export interface BriefTechnicalSpec {
  aspect_ratio: string;
  width: number;
  height: number;
  quality: "low" | "medium" | "high" | "ultra";
  background: "opaque" | "transparent" | "auto";
  number_of_outputs: number;
}

export interface BriefPostProcessingSpec {
  add_logo_after_generation: boolean;
  add_text_after_generation: boolean;
  upscale: boolean;
  background_removal: boolean;
}

/**
 * Full Image Generation Brief Schema v1
 */
export interface ImageGenerationBriefV1 {
  task: BriefTaskSpec;
  subject: BriefSubjectSpec;
  visual_direction: BriefVisualDirectionSpec;
  style: BriefStyleSpec;
  branding: BriefBrandingSpec;
  text: BriefTextSpec;
  reference_images: BriefReferenceImagesSpec;
  safety: BriefSafetySpec;
  ip_check: BriefIpCheckSpec;
  technical: BriefTechnicalSpec;
  negative_prompt: string[];
  post_processing: BriefPostProcessingSpec;
}

export interface PromptRiskIssue {
  category:
    | "trademark"
    | "copyright"
    | "artist_style"
    | "text_rendering"
    | "real_person"
    | "minors"
    | "sexual_content"
    | "violence"
    | "self_harm"
    | "illegal_dangerous"
    | "personal_data"
    | "official_documents"
    | "deceptive_content";
  severity: "low" | "medium" | "high" | "critical";
  text: string;
}

export interface PromptRiskAnalysis {
  decision: PromptDecisionTier;
  risk_score: number;
  issues: PromptRiskIssue[];
  actions: string[];
}
