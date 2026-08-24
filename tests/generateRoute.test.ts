import { describe, expect, it } from "vitest";
import { POST } from "../app/api/generate/route";

describe("retired provider passthrough", () => {
  it("fails closed and points callers to the normalized task endpoint", async () => {
    const response = await POST();
    const payload = await response.json();
    expect(response.status).toBe(410);
    expect(payload.replacement).toBe("/api/ai/execute");
  });
});
