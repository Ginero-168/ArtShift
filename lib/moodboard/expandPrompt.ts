export const MOODBOARD_EXPAND_MAX_TOKENS = 8_192;

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You expand a moodboard keyword into lateral vibe associations, then bucket them for a physical reference board.

Rules:
- Think sideways, not literal synonyms. Examples:
  - Bangkok → tuk-tuk, temples, Giant Swing, street food, night markets, saffron robes
  - ice → matcha glass ice, snowman, North Pole, crushed ice, frozen lake
- Return one compact JSON object only. No markdown, no prose, no image generation, no URLs.
- Do not wrap the object in {"kind":"text","text":"..."}.
- Emit "roles" immediately after "keyword". Keep associations to 6–8 short phrases so the object finishes.
- Every visual item must include a stock-photo search query (Unsplash/Pexels/Google CSE), never a generative-image prompt.
- Quantity-first. Target about 18–24 board items:
  - subject: 5–6 (photoCount 1 or 2; a couple may use 2 photos)
  - setting: 5–6 (photoCount 1 or 2)
  - prop: 4–5 (photoCount 1)
  - mood: 6 chips
  - color: 5 chips with hex

JSON shape (roles first):
{
  "keyword": "string",
  "roles": {
    "subject": [{ "label": "tuk-tuk", "query": "bangkok tuk-tuk street", "photoCount": 2 }],
    "setting": [{ "label": "night market", "query": "bangkok night market lights", "photoCount": 1 }],
    "prop": [{ "label": "plastic stool", "query": "thai plastic stool street food", "photoCount": 1 }],
    "mood": [{ "label": "humid night", "query": "humid neon night" }],
    "color": [{ "label": "saffron", "hex": "#e2a100" }]
  },
  "associations": ["lateral idea", "..."]
}`;

export function moodboardExpandUserPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

Return the complete JSON object now. Put roles right after keyword. Associations: 6–8 short phrases only. Stock queries only.`;
}

export function moodboardExpandRetryPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply. Put "roles" immediately after "keyword". associations: 6 short phrases only. JSON only.`;
}

export const MOODBOARD_CLOUD_CONSENT_PROMPT =
  "Moodboard expand will send this keyword to a cloud LLM to generate vibe associations, then search Unsplash/Pexels/Google CSE for real photos. No generative images will be created.\n\nAllow this cloud request in this session?";
