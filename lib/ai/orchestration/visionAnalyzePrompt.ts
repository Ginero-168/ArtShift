/**
 * Cloud vision prompt for Canvas / chat image analysis.
 * Optimized for inventory + OCR (not mood-first marketing summaries).
 */

export const UNIFIED_VISION_PROMPT = `You are analyzing an image for a graphic-design chat assistant.
Return ONLY a strictly valid JSON object (no markdown, no code fences) with this shape:
{
  "caption": "Zone-by-zone inventory of what is in the image. Cover top → middle → bottom (or left → right). Name layout regions (logo corner, headline strip, hero badge, props, footer T&Cs). Describe graphic shapes, props, and readable markings. Do NOT lead with mood or marketing interpretation.",
  "objects": ["Specific elements with detail, e.g. 'stack of 4 books spines: Better You / Work Smarter', 'white mug: Good Books Better Days :)', 'yellow Exclusive for brush banner' — not vague labels like 'books'"],
  "visibleText": "FULL OCR of EVERY readable string in reading order, including fine print, T&Cs bullets, logo URLs, spine titles, mug text, tiny footnotes. Preserve original language. Separate lines with \\n. Do not summarize or omit terms.",
  "style": "Graphic style + approximate aspect (e.g. square 1:1 promo coupon, flat brand graphic blue/yellow/white)",
  "dominantColors": ["#hex1", "#hex2", "#hex3"],
  "layoutNotes": "Brief structural notes: columns, overlays, frames (e.g. white T&C box at bottom split into 2 columns)",
  "inconsistencies": ["Any conflicting claims across regions, e.g. header branch vs T&C branch. Empty array if none."]
}

Rules:
- Prefer exact transcription over paraphrase.
- Prefer spatial inventory over emotional summary.
- If text is small but readable, include it.
- Never invent text that is not visible.`;
