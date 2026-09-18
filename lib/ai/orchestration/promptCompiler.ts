/**
 * AI Image Generation Brief Specification v1 - Prompt Compiler
 *
 * Compiles an ImageGenerationBriefV1 into a structured modular section prompt
 * without sending raw JSON to the diffusion image model.
 */

import type { ImageGenerationBriefV1 } from "./briefSpecV1";

export function compileBriefToPrompt(brief: ImageGenerationBriefV1): string {
  const sections: Array<{ title: string; lines: string[] }> = [];

  // [TYPE]
  const typeLines: string[] = [];
  if (brief.task.output_type === "publishing_poster") {
    typeLines.push("Premium commercial publishing advertising poster.");
  } else if (brief.task.output_type === "shelf_sign") {
    typeLines.push("Flat 2D commercial graphic design signage artwork.");
  } else if (brief.task.output_type === "banner") {
    typeLines.push("Commercial advertising rectangular banner artwork.");
  } else {
    typeLines.push("High-end commercial graphic design advertising visual.");
  }
  sections.push({ title: "TYPE", lines: typeLines });

  // [MAIN CONCEPT]
  const conceptLines: string[] = [];
  if (brief.subject.primary_subject) {
    conceptLines.push(brief.subject.primary_subject + ".");
  }
  if (
    brief.visual_direction.concept &&
    !conceptLines.some((l) => l.includes(brief.visual_direction.concept))
  ) {
    conceptLines.push(`Centered around ${brief.visual_direction.concept}.`);
  }
  sections.push({ title: "MAIN CONCEPT", lines: conceptLines });

  // [COMPOSITION]
  const compLines: string[] = [];
  if (brief.visual_direction.composition) {
    compLines.push(brief.visual_direction.composition + ".");
  }
  if (brief.visual_direction.camera) {
    compLines.push(brief.visual_direction.camera + ".");
  }
  if (brief.branding.brand_present || brief.branding.exact_logo_required) {
    compLines.push("Reserved clean area for publisher branding and brand mark.");
  }
  if (brief.text.text_required || brief.text.reserve_text_area) {
    compLines.push("Reserved negative space for campaign typography overlay.");
  }
  sections.push({ title: "COMPOSITION", lines: compLines });

  // [COLOR]
  const colorLines: string[] = [];
  if (brief.visual_direction.background) {
    colorLines.push(brief.visual_direction.background + " background.");
  }
  if (brief.visual_direction.color_palette.length > 0) {
    for (const color of brief.visual_direction.color_palette) {
      colorLines.push(color + " tones.");
    }
  }
  sections.push({ title: "COLOR", lines: colorLines });

  // [LIGHTING]
  const lightingLines: string[] = [];
  if (brief.visual_direction.lighting) {
    lightingLines.push(brief.visual_direction.lighting + ".");
  }
  sections.push({ title: "LIGHTING", lines: lightingLines });

  // [VISUAL ELEMENTS]
  const elementLines: string[] = [];
  if (brief.subject.secondary_subjects.length > 0) {
    for (const subj of brief.subject.secondary_subjects) {
      elementLines.push(subj + ".");
    }
  }
  if (brief.visual_direction.visual_keywords.length > 0) {
    for (const kw of brief.visual_direction.visual_keywords) {
      if (!elementLines.some((l) => l.toLowerCase().includes(kw.toLowerCase()))) {
        elementLines.push(kw + ".");
      }
    }
  }
  if (brief.visual_direction.effects.length > 0) {
    for (const eff of brief.visual_direction.effects) {
      if (!elementLines.some((l) => l.toLowerCase().includes(eff.toLowerCase()))) {
        elementLines.push(eff + ".");
      }
    }
  }
  if (elementLines.length === 0) {
    elementLines.push("Clean geometric elements.", "High aesthetic visual hierarchy.");
  }
  sections.push({ title: "VISUAL ELEMENTS", lines: elementLines });

  // [DESIGN LANGUAGE]
  const designLines: string[] = [
    "Contemporary commercial campaign.",
    "Minimal luxury aesthetic.",
    "Strong editorial hierarchy.",
    "Clean geometric composition.",
    "High contrast.",
  ];
  sections.push({ title: "DESIGN LANGUAGE", lines: designLines });

  // [BRANDING]
  const brandingLines: string[] = [];
  if (brief.branding.brand_present || brief.branding.exact_logo_required) {
    brandingLines.push(
      "Do not generate or recreate an existing trademarked logo.",
      `Leave a clean placeholder area for the official ${brief.branding.brand_name || "brand"} logo.`,
      "The official logo will be composited during post-production.",
    );
  } else {
    brandingLines.push("No explicit brand marks or corporate emblems in artwork.");
  }
  sections.push({ title: "BRANDING", lines: brandingLines });

  // [TEXT]
  const textLines: string[] = [];
  if (brief.text.text_required || brief.text.reserve_text_area) {
    textLines.push(
      "Do not render final typography.",
      "Leave designated negative space for text to be added during post-production.",
      "No garbled letters, no pseudo-text, no artificial calligraphy.",
    );
  } else {
    textLines.push("Pure visual artwork without embedded typography or text characters.");
  }
  sections.push({ title: "TEXT", lines: textLines });

  // [QUALITY]
  const qualityLines: string[] = [
    "Commercial advertising quality.",
    "Sharp details.",
    "Professional art direction.",
    "High-resolution finish.",
  ];
  sections.push({ title: "QUALITY", lines: qualityLines });

  // Compile formatted output with double linebreaks between sections
  return sections.map((sec) => `[${sec.title}]\n\n${sec.lines.join("\n\n")}`).join("\n\n\n");
}
