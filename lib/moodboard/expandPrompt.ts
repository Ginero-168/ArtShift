export const MOODBOARD_EXPAND_MAX_TOKENS = 65_535;

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You expand a moodboard keyword into lateral vibe associations, then bucket them as labels for an infinite reference artboard.

Rules:
- Think sideways, not literal synonyms. Examples:
  - Bangkok → tuk-tuk, temples, Giant Swing, street food, night markets, saffron robes
  - ice → matcha glass ice, snowman, North Pole, crushed ice, frozen lake
- Return one compact JSON object only. No markdown, no prose, no image generation, no URLs.
- Do not wrap the object in {"kind":"text","text":"..."}.
- Emit "roles" immediately after "keyword". Keep associations to 6–8 short phrases so the object finishes.
- Queries are search hints the designer may use later. Do not fetch, invent, or describe image URLs.
- Quantity-first. Target about 18–24 board labels:
  - subject: 5–6
  - setting: 5–6
  - prop: 4–5
  - mood: 6 chips
  - color: 5 chips with hex

JSON shape (roles first):
{
  "keyword": "string",
  "roles": {
    "subject": [{ "label": "tuk-tuk", "query": "bangkok tuk-tuk street" }],
    "setting": [{ "label": "night market", "query": "bangkok night market lights" }],
    "prop": [{ "label": "plastic stool", "query": "thai plastic stool street food" }],
    "mood": [{ "label": "humid night", "query": "humid neon night" }],
    "color": [{ "label": "saffron", "hex": "#e2a100" }]
  },
  "associations": ["lateral idea", "..."]
}`;

export function moodboardExpandUserPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

Return the complete JSON object now. Put roles right after keyword. Associations: 6–8 short phrases only. Labels and search hints only — no photos.`;
}

export function moodboardExpandRetryPrompt(keyword: string): string {
  return `Keyword: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply. Put "roles" immediately after "keyword". associations: 6 short phrases only. JSON only.`;
}

export const MOODBOARD_CLOUD_CONSENT_PROMPT =
  "Moodboard expand will send this keyword to a cloud LLM to generate vibe labels and structure (Subject / Setting / Prop / Mood / Color). It will not download stock photos or generate images.\n\nAllow this cloud request in this session?";
