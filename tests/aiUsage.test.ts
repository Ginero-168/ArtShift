import { afterEach, describe, expect, it, vi } from "vitest";
import { type AiUsageRecord, InMemoryAiUsageLedger } from "@/lib/ai-runtime/usage";

function entry(accountId?: string): AiUsageRecord {
  return {
    at: Date.now(),
    accountId,
    task: "vision.describe",
    provider: "mock",
    model: "mock",
    durationMs: 1,
    usage: { estimatedUsd: 2, inputTokens: 10, outputTokens: 5 },
    cached: false,
    ok: true,
  };
}

describe("monthly AI accounting", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps account and global totals when recent records are evicted", () => {
    const ledger = new InMemoryAiUsageLedger(1);
    ledger.record(entry("a"));
    ledger.record({ ...entry("b"), ok: false });
    ledger.record(entry());
    expect(ledger.recent()).toHaveLength(1);
    expect(ledger.summary()).toMatchObject({
      requests: 3,
      failures: 1,
      estimatedUsd: 6,
      inputTokens: 30,
      outputTokens: 15,
    });
    expect(ledger.summary(undefined, "a")).toMatchObject({ requests: 1, estimatedUsd: 2 });
    expect(ledger.summary(undefined, "b")).toMatchObject({
      requests: 1,
      failures: 1,
      estimatedUsd: 2,
    });
    const summary = ledger.summary(undefined, "a");
    summary.estimatedUsd = 0;
    expect(ledger.summary(undefined, "a").estimatedUsd).toBe(2);
  });

  it("resets totals on month rollover without counting late prior-month records", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 12));
    const ledger = new InMemoryAiUsageLedger(1);
    const previousMonth = entry("a");
    ledger.record(previousMonth);
    vi.setSystemTime(new Date(2026, 9, 1, 12));
    expect(ledger.summary().estimatedUsd).toBe(0);
    expect(ledger.summary(undefined, "a").estimatedUsd).toBe(0);
    ledger.record(previousMonth);
    ledger.record(entry("b"));
    expect(ledger.summary().estimatedUsd).toBe(2);
    expect(ledger.summary(undefined, "a").estimatedUsd).toBe(0);
  });
});
