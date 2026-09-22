import { MOODBOARD_AI_BATCH_COUNT } from "./constants";

export const MOODBOARD_EXPAND_MAX_TOKENS = 4_096;

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = `You are Gemini Flash expanding a designer's short moodboard keyword / vibe into associative visual directions for a reference board.

Input is a keyword or vibe (examples: "กรุงเทพฯ", "Bangkok", "ice", "quiet luxury"). Expand into EXACTLY ${MOODBOARD_AI_BATCH_COUNT} distinct visual mood-board directions that make a designer *think of* that keyword — sideways associations, not ${MOODBOARD_AI_BATCH_COUNT} literal copies.

Examples of associative thinking:
- Bangkok / กรุงเทพฯ → tuk-tuk chrome, street food steam, temple gables, night markets, saffron robes, Chao Phraya ferries, humid neon skyline, plastic stools, Giant Swing — not nine identical "Bangkok skyline" shots
- ice → crushed ice in matcha glass, frozen lake edge, polar still life, snow texture macro, cooler condensation — not nine copies of "ice cube"

For every direction, invent a unique mix of:
- Subject — who / what is the focal presence
- Setting — where / environment
- Prop — a concrete object or detail that anchors the frame
- Mood — emotional / atmospheric tone
- Color style — palette, lighting, or material treatment

Rules:
- Return one compact JSON object only. No markdown fences, no prose.
- prompts MUST have length ${MOODBOARD_AI_BATCH_COUNT}. Each index 1..${MOODBOARD_AI_BATCH_COUNT} exactly once.
- Each "prompt" is a self-contained English image prompt (1–2 sentences) for a cheap text-to-image model. Clearly different from the others. Never paste the user keyword ${MOODBOARD_AI_BATCH_COUNT} times unchanged.
- Do not invent URLs. Do not mention cameras, watermarks, logos, or text overlays.
- You only plan prompts. You do not generate pixels.

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

Expand into exactly ${MOODBOARD_AI_BATCH_COUNT} associative visual mood-board directions (not literal copies). Return the complete JSON object now.`;
}

export function moodboardExpandRetryPrompt(keyword: string): string {
  return `Keyword / vibe: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply with exactly ${MOODBOARD_AI_BATCH_COUNT} prompts. JSON only.`;
}
