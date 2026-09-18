import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/Campaign/CampaignStudioModal.tsx", "utf8");

describe("Campaign Studio stale-batch guard", () => {
  it("ignores older generateCampaignBatch results with a request id and abort controller", () => {
    expect(source).toContain("batchRequestIdRef");
    expect(source).toContain("AbortController");
    expect(source).toContain("requestId !== batchRequestIdRef.current");
    expect(source).toContain("controller.signal.aborted");
  });
});
