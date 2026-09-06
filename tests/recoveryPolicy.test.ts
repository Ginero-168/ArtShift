import { describe, expect, it } from "vitest";
import { decideRecovery } from "@/lib/ai/orchestration/recoveryPolicy";

describe("bounded recovery policy", () => {
  it("does not retry permanent failures", () => {
    expect(decideRecovery({ kind: "auth", attempt: 1, maxAttempts: 2 })).toMatchObject({
      action: "stop",
    });
    expect(decideRecovery({ kind: "invalid_input", attempt: 1, maxAttempts: 2 })).toMatchObject({
      action: "stop",
    });
  });
  it("resumes known predictions instead of creating duplicates", () => {
    expect(
      decideRecovery({ kind: "polling", attempt: 1, maxAttempts: 2, predictionId: "pred-1" }),
    ).toMatchObject({ action: "resume" });
  });
  it("allows one diagnosed quality retry", () => {
    expect(decideRecovery({ kind: "quality", attempt: 1, maxAttempts: 2 })).toMatchObject({
      action: "retry",
      nextAttempt: 2,
    });
    expect(decideRecovery({ kind: "quality", attempt: 2, maxAttempts: 2 })).toMatchObject({
      action: "stop",
    });
  });
});
