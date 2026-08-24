/** Backwards-compatible AI cache reset entrypoint. */

import { clearKnownModelCaches } from "@/lib/ai/modelRegistry";

export async function resetAICache(): Promise<{ freedCount: number; success: boolean }> {
  const result = await clearKnownModelCaches();
  return { freedCount: result.deleted, success: result.success };
}
