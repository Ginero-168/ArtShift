/**
 * AI Image Generation Brief Specification v1 - Prompt Risk Analyzer Engine
 *
 * Implements context & intent-aware risk analysis following:
 * - 4-tier decision: ALLOW (0-20), ALLOW_WITH_REWRITE (21-50), REQUIRE_REVIEW (51-80), BLOCK (81-100)
 * - "Rewrite before Reject" core philosophy
 * - Strict safety gating for self-harm, minor safety, graphic violence, fake credentials, and personal data
 * - Constructive rewriting for brand, typography, artist style, and copyright references
 */

import type {
  PromptDecisionTier,
  PromptRiskAnalysis,
  PromptRiskIssue,
  ReferenceImageType,
} from "./briefSpecV1";

export interface PromptRiskAnalyzerOptions {
  hasReference?: boolean;
  referenceTypes?: ReferenceImageType[];
  knownBrandAssetsAvailable?: boolean;
}

/**
 * Known brands for contextual trademark intent detection
 */
const COMMON_BRANDS = [
  "welearn",
  "วีเลิร์น",
  "apple",
  "nike",
  "adidas",
  "starbucks",
  "microsoft",
  "google",
  "samsung",
  "sony",
  "coca[- ]?cola",
  "pepsi",
  "louis vuitton",
  "chanel",
  "gucci",
];

const KNOWN_ARTISTS = [
  "greg rutkowski",
  "artgerm",
  "alphonse mucha",
  "van gogh",
  "picasso",
  "makoto shinkai",
  "hayao miyazaki",
  "studio ghibli",
  "beeple",
  "ilya kuvshinov",
];

export function analyzePromptRisk(
  rawPrompt: string,
  options: PromptRiskAnalyzerOptions = {},
): PromptRiskAnalysis {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();
  const issues: PromptRiskIssue[] = [];
  const actions: string[] = [];

  let baseRiskScore = 0;

  // -------------------------------------------------------------
  // 1. Critical Safety Checks (Direct Blockers)
  // -------------------------------------------------------------

  // 1.1 Self-harm & Suicide
  if (
    /(?:suicide|ฆ่าตัวตาย|กรีดแขน|self[- ]?harm|cutting\s*(?:wrist|skin)|ทำร้ายตัวเอง|hang(?:ing)?\s*myself)/i.test(
      lower,
    )
  ) {
    issues.push({
      category: "self_harm",
      severity: "critical",
      text: "Content depicting self-harm or suicide is strictly prohibited",
    });
    baseRiskScore += 100;
  }

  // 1.2 Minors / Child Safety
  const hasChildMention = /(?:child|kid|minor|baby|infant|toddler|เด็ก|ทารก|เยาวชน)/i.test(lower);
  const hasSexualizedOrExplicit =
    /(?:nude|naked|erotic|sexual|nsfw|โป๊|เปลือย|แก้ผ้า|อนาจาร|fetish|lingerie|underwear)/i.test(lower);
  if (hasChildMention && hasSexualizedOrExplicit) {
    issues.push({
      category: "minors",
      severity: "critical",
      text: "Sensitive or sexualized depiction of minors is strictly prohibited",
    });
    baseRiskScore += 100;
  } else if (hasSexualizedOrExplicit) {
    issues.push({
      category: "sexual_content",
      severity: "critical",
      text: "Explicit sexual or nude content is not permitted for commercial generation",
    });
    baseRiskScore += 85;
  }

  // 1.3 Violence & Gore
  if (
    /(?:gore|mutilat|decapitat|severed head|ควักไส้|เลือดสาดท่วม|torture|graphic violence|ฆ่าปาดคอ)/i.test(
      lower,
    )
  ) {
    issues.push({
      category: "violence",
      severity: "critical",
      text: "Graphic violence, gore, or torture is strictly prohibited",
    });
    baseRiskScore += 90;
  }

  // 1.4 Illegal / Dangerous Content (Weapons, bomb making, drugs)
  if (
    /(?:how to make a bomb|pipe bomb|วิธีทำระเบิด|methamphetamine|cocaine synthesis|assassination|terrorist)/i.test(
      lower,
    )
  ) {
    issues.push({
      category: "illegal_dangerous",
      severity: "critical",
      text: "Illegal weapons, explosives, or criminal instructions are strictly prohibited",
    });
    baseRiskScore += 90;
  }

  // 1.5 Personal Data (ID numbers, credit cards, credentials)
  const thaiIdRegex = /\b\d{1}\s?\d{4}\s?\d{5}\s?\d{2}\s?\d{1}\b/;
  const creditCardRegex = /\b(?:\d{4}[ -]?){3}\d{4}\b/;
  if (thaiIdRegex.test(prompt) || creditCardRegex.test(prompt)) {
    issues.push({
      category: "personal_data",
      severity: "critical",
      text: "Private personal data (ID card number, financial data) must not be included",
    });
    baseRiskScore += 85;
  }

  // 1.6 Official Documents & Counterfeiting
  if (
    /(?:บัตรประชาชนปลอม|fake id|fake passport|fake visa|ปลอมแปลงเอกสาร|fake government certificate|fake currency|ธนบัตรปลอม)/i.test(
      lower,
    )
  ) {
    issues.push({
      category: "official_documents",
      severity: "critical",
      text: "Generation of fraudulent official identity documents or currency is prohibited",
    });
    baseRiskScore += 90;
  }

  // 1.7 Deceptive Content / Deepfakes
  if (
    /(?:fake news|หลักฐานเท็จ|fake evidence|ภาพแฉปลอม|stolen election evidence|faked arrest photo)/i.test(
      lower,
    )
  ) {
    issues.push({
      category: "deceptive_content",
      severity: "critical",
      text: "Fabrication of deceptive news or false evidence is prohibited",
    });
    baseRiskScore += 85;
  }

  // If any critical safety blocker exists, return BLOCK immediately
  if (baseRiskScore >= 80) {
    return {
      decision: "BLOCK",
      risk_score: Math.min(100, baseRiskScore),
      issues,
      actions: ["Block generation request due to policy compliance violation"],
    };
  }

  // -------------------------------------------------------------
  // 2. Intellectual Property, Trademark & Commercial Intent Checks
  // -------------------------------------------------------------

  // 2.1 Brand / Trademark & Logo Reproduction
  const brandPattern = new RegExp(`\\b(?:${COMMON_BRANDS.join("|")})\\b`, "iu");
  const brandMatch = brandPattern.exec(prompt);
  const wantsExactLogo =
    /(?:วาดโลโก้|ใส่โลโก้|สร้างโลโก้|recreate\s*(?:the\s*)?(?:official\s*)?logo|exact\s*logo|draw\s*logo|generate\s*logo)/i.test(
      lower,
    );

  if (brandMatch) {
    const brandName = brandMatch[0];
    if (wantsExactLogo) {
      issues.push({
        category: "trademark",
        severity: "medium",
        text: `Recreating an exact existing brand logo (${brandName})`,
      });
      actions.push("Remove exact logo generation request");
      actions.push(`Reserve an empty logo area for ${brandName}`);
      actions.push("Add official logo during post-production");
      baseRiskScore += 25;
    } else {
      // Legitimate brand campaign / poster intent
      actions.push(`Reserve placeholder area for official ${brandName} brand assets`);
      baseRiskScore += 10;
    }
  } else if (wantsExactLogo) {
    issues.push({
      category: "trademark",
      severity: "low",
      text: "Generic logo synthesis requested inside diffusion model",
    });
    actions.push(
      "Reserve clean area for vector logo composite rather than diffusion text rendering",
    );
    baseRiskScore += 15;
  }

  // 2.2 Copyrighted Work & Exact Book Cover / Poster Copying
  const wantsExactCopy =
    /(?:ลอกแบบ|ก๊อปปี้|เหมือนเป๊ะ|เหมือนต้นฉบับ|copy\s*exactly|exact\s*replica|duplicate\s*this\s*cover|recreate\s*identically)/i.test(
      lower,
    );
  if (wantsExactCopy && options.hasReference) {
    issues.push({
      category: "copyright",
      severity: "medium",
      text: "Directly copying layout and artwork from copyrighted reference",
    });
    actions.push(
      "Use reference image only for overall composition, color balance, visual hierarchy and atmospheric direction",
    );
    actions.push("Create an original artwork without reproducing exact graphic elements or layout");
    baseRiskScore += 30;
  }

  // 2.3 Artist Style
  const artistStyleMatch = /(?:in the style of|style of|สไตล์ของ|ภาพวาดแบบ)\s*([^,.\n]+)/iu.exec(
    prompt,
  );
  if (artistStyleMatch) {
    const candidateArtist = artistStyleMatch[1].trim().toLowerCase();
    const isKnownArtist = KNOWN_ARTISTS.some((a) => candidateArtist.includes(a));
    if (
      isKnownArtist ||
      /(?:greg|mucha|ghibli|rutkowski|artgerm|picasso|van gogh)/i.test(candidateArtist)
    ) {
      issues.push({
        category: "artist_style",
        severity: "low",
        text: `Direct reference to specific artist style (${candidateArtist})`,
      });
      actions.push(
        "Replace artist reference with descriptive visual terms (cinematic, painterly, editorial, high contrast)",
      );
      baseRiskScore += 25;
    }
  }

  // -------------------------------------------------------------
  // 3. Text & Typography Checks
  // -------------------------------------------------------------
  const containsThaiText = /[\u0E00-\u0E7F]/.test(prompt);
  const containsLongQuotes = /["“'「][^"”'」]{6,}["”'」]/.test(prompt);
  const containsCtaOrPrice = /(?:ราคา|บาท|\bthb\b|\bfree\b|cta|ซื้อเลย|ลดราคา|isbn|วันที่)/i.test(lower);
  const wantsBubble = /(?:bubble|บอลลูน|กล่องคำพูด)/i.test(lower);

  if (containsThaiText || containsLongQuotes || containsCtaOrPrice || wantsBubble) {
    issues.push({
      category: "text_rendering",
      severity: "low",
      text: "Exact Thai typography, price, or dialogue quotes may render incorrectly in diffusion model",
    });
    actions.push("Generate artwork without final typography");
    actions.push("Reserve designated negative space for typography overlay in post-production");
    baseRiskScore += 15;
  }

  // -------------------------------------------------------------
  // 4. Real Persons / Public Figures
  // -------------------------------------------------------------
  const hasCelebrityOrPublicFigure =
    /(?:elon musk|donald trump|taylor swift|นายกรัฐมนตรี|บิ๊กตู่|ทักษิณ|ลิซ่า|lisa blackpink)/i.test(lower);
  if (hasCelebrityOrPublicFigure) {
    issues.push({
      category: "real_person",
      severity: "medium",
      text: "Prominent public figure requested; verify commercial likeness rights",
    });
    actions.push("Ensure fictional or stylized artistic representation without defamatory framing");
    baseRiskScore += 25;
  }

  // -------------------------------------------------------------
  // 5. Compute Tier and Apply "Rewrite before Reject"
  // -------------------------------------------------------------
  let decision: PromptDecisionTier = "ALLOW";

  if (baseRiskScore <= 20) {
    decision = "ALLOW";
  } else if (baseRiskScore <= 50) {
    decision = "ALLOW_WITH_REWRITE";
  } else if (baseRiskScore <= 80) {
    // If all issues have clear constructive rewrite actions, downgrade to ALLOW_WITH_REWRITE
    const allFixable = issues.every(
      (iss) =>
        iss.category === "trademark" ||
        iss.category === "text_rendering" ||
        iss.category === "artist_style" ||
        iss.category === "copyright",
    );
    if (allFixable) {
      decision = "ALLOW_WITH_REWRITE";
      baseRiskScore = Math.min(48, baseRiskScore);
    } else {
      decision = "REQUIRE_REVIEW";
    }
  } else {
    decision = "BLOCK";
  }

  return {
    decision,
    risk_score: Math.min(100, Math.max(0, baseRiskScore)),
    issues,
    actions: actions.length > 0 ? Array.from(new Set(actions)) : ["Proceed with direct generation"],
  };
}
