import {
  MOODBOARD_DEFAULT_BATCH_COUNT,
  type MoodboardBatchCount,
  moodboardGridSide,
} from "./constants";

export function moodboardExpandMaxTokens(count: MoodboardBatchCount): number {
  if (count === 25) return 8_192;
  if (count === 16) return 6_144;
  return 4_096;
}

/** Default token budget for the 9-pack expand. */
export const MOODBOARD_EXPAND_MAX_TOKENS = moodboardExpandMaxTokens(MOODBOARD_DEFAULT_BATCH_COUNT);

export function moodboardExpandSystemPrompt(
  count: MoodboardBatchCount = MOODBOARD_DEFAULT_BATCH_COUNT,
): string {
  const side = moodboardGridSide(count);
  return `You are Gemini Flash expanding a designer's short moodboard keyword / vibe into associative visual directions for a reference board.

Input is a keyword or vibe (examples: "กรุงเทพฯ", "Bangkok", "ice", "quiet luxury"). Expand into EXACTLY ${count} distinct visual mood-board directions that make a designer *think of* that keyword — sideways associations, not ${count} literal copies.

Examples of associative thinking:
- Bangkok / กรุงเทพฯ → tuk-tuk chrome, street food steam, temple gables, night markets, saffron robes, Chao Phraya ferries, humid neon skyline, plastic stools, Giant Swing — not the same "Bangkok skyline" shot repeated ${count} times
- ice → crushed ice in matcha glass, frozen lake edge, polar still life, snow texture macro, cooler condensation — not ${count} copies of "ice cube"

For every direction, invent a unique mix of:
- Subject — who / what is the focal presence
- Setting — where / environment
- Prop — a concrete object or detail that anchors the frame
- Mood — emotional / atmospheric tone
- Color style — palette, lighting, or material treatment

Rules:
- Return one compact JSON object only. No markdown fences, no prose.
- prompts MUST have length ${count}. Each index 1..${count} exactly once.
- Each "prompt" is a self-contained English image prompt (1–2 sentences) for a square photographic moodboard still. Clearly different from the others. Never paste the user keyword ${count} times unchanged.
- Do not invent URLs. Do not mention cameras, watermarks, logos, or text overlays.
- You only plan prompts. You do not generate pixels.
- The board is a ${side}×${side} grid. Every prompt should work as its own square frame.

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
}

export const MOODBOARD_EXPAND_SYSTEM_PROMPT = moodboardExpandSystemPrompt(
  MOODBOARD_DEFAULT_BATCH_COUNT,
);

export function moodboardExpandUserPrompt(
  keyword: string,
  count: MoodboardBatchCount = MOODBOARD_DEFAULT_BATCH_COUNT,
): string {
  return `Keyword / vibe: ${keyword.trim()}

Expand into exactly ${count} associative visual mood-board directions (not literal copies). Return the complete JSON object now.`;
}

export function moodboardExpandRetryPrompt(
  keyword: string,
  count: MoodboardBatchCount = MOODBOARD_DEFAULT_BATCH_COUNT,
): string {
  return `Keyword / vibe: ${keyword.trim()}

The previous JSON was cut off. Return the COMPLETE object in one reply with exactly ${count} prompts. JSON only.`;
}
