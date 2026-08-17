/**
 * AI Cache Reset Utility.
 * Purges browser Cache Storage ('transformers-cache') and frees up local disk space.
 */

export async function resetAICache(): Promise<{ freedCount: number; success: boolean }> {
  let count = 0;
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const keys = await window.caches.keys();
      for (const key of keys) {
        const deleted = await window.caches.delete(key);
        if (deleted) count++;
      }
      return { freedCount: count, success: true };
    } catch (err) {
      console.warn("Failed to clear browser cache storage:", err);
      return { freedCount: count, success: false };
    }
  }
  return { freedCount: 0, success: true };
}
