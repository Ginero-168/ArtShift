import { MOODBOARD_IMAGE_COUNT } from "./constants";

export const MOODBOARD_EXPAND_MAX_TOKENS = 65_535;

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You expand a short designer keyword / vibe into lateral design directions for a mood board, then pick exactly ${MOODBOARD_IMAGE_COUNT} distinct image-generation prompts.

Rules:
- Think sideways, not literal synonyms. Examples:
  - Bangkok → tuk-tuk, temples, Giant Swing, street food, night markets, saffron robes
  - ice → matcha glass ice, snowman, North Pole, crushed ice, frozen lake
- Expand across Subject / Setting / Prop / Mood / Color — playful but useful for designers.
- Return one compact JSON object only. No markdown, no prose, no URLs.
- Do not wrap the object in {"kind":"text","text":"..."}.
- Emit "roles" immediately after "keyword". Keep associations to 6–8 short phrases.
- Then emit "imagePrompts" with EXACTLY ${MOODBOARD_IMAGE_COUNT} items. Each prompt must be a complete, distinct visual scene suitable for flux-schnell (one upright photo/illustration idea, no collage, no text overlays).
- Cover a mix of roles across the ${MOODBOARD_IMAGE_COUNT} prompts (not nine near-duplicates).

JSON shape:
{
  "keyword": "string",
  "roles": {
    "subject": [{ "label": "tuk-tuk", "query": "bangkok tuk-tuk street" }],
    "setting": [{ "label": "night market", "query": "bangkok night market lights" }],
    "prop": [{ "label": "plastic stool", "query": "thai plastic stool street food" }],
    "mood": [{ "label": "humid night", "query": "humid neon night" }],
    "color": [{ "label": "saffron", "hex": "#e2a100" }]
  },
  "associations": ["lateral idea", "..."],
  "imagePrompts": [
    {
      "label": "tuk-tuk neon",
      "role": "subject",
      "prompt": "A vivid Bangkok tuk-tuk under humid neon rain, documentary photo, upright framing"
    }
  ]
}`;

export function moodboardExpandUserPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

Return the complete JSON object now. Put roles right after keyword, then exactly ${MOODBOARD_IMAGE_COUNT} distinct imagePrompts. Associations: 6–8 short phrases only.`;
}

export function moodboardExpandRetryPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply. Put "roles" immediately after "keyword", then exactly ${MOODBOARD_IMAGE_COUNT} imagePrompts. associations: 6 short phrases only. JSON only.`;
}

export const MOODBOARD_CLOUD_CONSENT_PROMPT =
  "Moodboard จะส่งคำค้นไปยัง cloud LLM เพื่อขยายไอเดีย (Subject / Setting / Prop / Mood / Color) แล้วสร้างภาพ 9 ใบผ่าน Replicate (flux-schnell) ด้วยคีย์ของคุณ\n\nอนุญาตให้ส่ง prompt ออกนอกเครื่องในเซสชันนี้หรือไม่?";
