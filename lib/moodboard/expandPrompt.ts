export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You expand a moodboard keyword into lateral vibe associations, then bucket them for a physical reference board.

Rules:
- Think sideways, not literal synonyms. Examples:
  - Bangkok → tuk-tuk, temples, Giant Swing, street food, night markets, saffron robes
  - ice → matcha glass ice, snowman, North Pole, crushed ice, frozen lake
- Return JSON only. No markdown, no image generation, no URLs.
- Do not wrap the object in {"kind":"text","text":"..."}. The JSON object itself is the response.
- Every visual item must include a stock-photo search query (Unsplash/Pexels), never a generative-image prompt recipe.
- Quantity-first. Target about 18–24 board items:
  - subject: 5–6 (photoCount 1 or 2; a couple may use 2 photos)
  - setting: 5–6 (photoCount 1 or 2)
  - prop: 4–5 (photoCount 1)
  - mood: 6 chips
  - color: 5 chips with hex
- Keep total planned photos + chips in the 18–24 range.

JSON shape:
{
  "keyword": "string",
  "associations": ["lateral idea", "..."],
  "roles": {
    "subject": [{ "label": "tuk-tuk", "query": "bangkok tuk-tuk street", "photoCount": 2 }],
    "setting": [{ "label": "night market", "query": "bangkok night market lights", "photoCount": 1 }],
    "prop": [{ "label": "plastic stool", "query": "thai plastic stool street food", "photoCount": 1 }],
    "mood": [{ "label": "humid night", "query": "humid neon night" }],
    "color": [{ "label": "saffron", "hex": "#e2a100" }]
  }
}`;

export function moodboardExpandUserPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

Expand into vibe associations and role buckets. Stock queries only. JSON only.`;
}

export const MOODBOARD_CLOUD_CONSENT_PROMPT =
  "Moodboard expand will send this keyword to a cloud LLM to generate vibe associations, then search Unsplash/Pexels for real stock photos. No generative images will be created.\n\nAllow this cloud request in this session?";
