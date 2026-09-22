import { MOODBOARD_AI_BATCH_COUNT } from "./constants";

export const MOODBOARD_EXPAND_MAX_TOKENS = 4_096;

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You expand a designer's short moodboard keyword / vibe into associative design directions, then write EXACTLY ${MOODBOARD_AI_BATCH_COUNT} distinct image-generation prompts.

Be playful but smart. Think sideways (Bangkok → tuk-tuk chrome, saffron robes, humid neon markets — not nine copies of "Bangkok skyline").

For every prompt, invent a unique mix of:
- Subject — who / what is the focal presence
- Setting — where / environment
- Prop — a concrete object or detail that anchors the frame
- Mood — emotional / atmospheric tone
- Color style — palette, lighting, or material treatment

Rules:
- Return one compact JSON object only. No markdown fences, no prose.
- prompts MUST have length ${MOODBOARD_AI_BATCH_COUNT}. Each index 1..${MOODBOARD_AI_BATCH_COUNT} exactly once.
- Each "prompt" is a self-contained English image prompt (1–2 sentences) that clearly differs from the others. Never paste the user keyword ${MOODBOARD_AI_BATCH_COUNT} times unchanged.
- Do not invent URLs. Do not mention cameras, watermarks, logos, or text overlays.

JSON shape:
{
  "keyword": "string",
  "prompts": [
    {
      "index": 1,
      "subject": "…",
      "setting": "…",
      "prop": "…",
      "mood": "…",
      "colorStyle": "…",
      "prompt": "Full English image prompt combining the facets…"
    }
  ]
}`;

export function moodboardExpandUserPrompt(keyword: string): string {
  return `Keyword / vibe: ${keyword.trim()}

Return the complete JSON object with exactly ${MOODBOARD_AI_BATCH_COUNT} distinct prompts now.`;
}

export function moodboardExpandRetryPrompt(keyword: string): string {
  return `Keyword / vibe: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply with exactly ${MOODBOARD_AI_BATCH_COUNT} prompts. JSON only.`;
}
