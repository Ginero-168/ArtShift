import { describe, expect, it } from "vitest";
import { resetAICache } from "@/lib/vision/resetCache";

describe("resetAICache", () => {
  it("handles cache reset safely in any environment", async () => {
    const result = await resetAICache();
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(typeof result.freedCount).toBe("number");
  });
});
