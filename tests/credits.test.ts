import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  adminChangeCredits,
  ensureAccountCredits,
  getCreditBalance,
  refundSpend,
  resetCreditStoreForTests,
  spendCredits,
} from "@/lib/credits/ledger";
import {
  COST_PLUS_MARGIN,
  CREDIT_THB,
  creditsForAction,
  creditsForProviderUsd,
  USD_TO_THB,
  WELCOME_GRANT_CREDITS,
  welcomeGrantCredits,
} from "@/lib/credits/pricing";

describe("credit pricing", () => {
  it("converts provider USD to credits at 0.01 THB with a 25% margin", () => {
    expect(CREDIT_THB).toBe(0.01);
    expect(COST_PLUS_MARGIN).toBe(1.25);
    const providerUsd = 0.012;
    const billedThb = providerUsd * USD_TO_THB * COST_PLUS_MARGIN;
    expect(creditsForProviderUsd(providerUsd)).toBe(Math.ceil(billedThb / CREDIT_THB - 1e-9));
    expect(creditsForAction("moodboard.image")).toBe(creditsForProviderUsd(0.012));
    expect(creditsForAction("moodboard.image", 9)).toBe(creditsForProviderUsd(0.012) * 9);
  });

  it("documents a small welcome grant of 200 credits unless overridden", () => {
    expect(WELCOME_GRANT_CREDITS).toBe(200);
    const previous = process.env.ARTSHIFT_WELCOME_CREDITS;
    delete process.env.ARTSHIFT_WELCOME_CREDITS;
    try {
      expect(welcomeGrantCredits()).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.ARTSHIFT_WELCOME_CREDITS;
      else process.env.ARTSHIFT_WELCOME_CREDITS = previous;
    }
  });
});

describe("credit ledger", () => {
  let dir = "";
  const previousWelcome = process.env.ARTSHIFT_WELCOME_CREDITS;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "artshift-credits-"));
    process.env.ARTSHIFT_CREDIT_STORE_PATH = join(dir, "credits.json");
    process.env.ARTSHIFT_WELCOME_CREDITS = "200";
    resetCreditStoreForTests();
  });

  afterAll(() => {
    delete process.env.ARTSHIFT_CREDIT_STORE_PATH;
    if (previousWelcome === undefined) delete process.env.ARTSHIFT_WELCOME_CREDITS;
    else process.env.ARTSHIFT_WELCOME_CREDITS = previousWelcome;
    rmSync(dir, { recursive: true, force: true });
  });

  it("grants welcome credits once and blocks an overdraft", () => {
    const state = ensureAccountCredits("user-a");
    expect(state.balance).toBe(200);
    expect(ensureAccountCredits("user-a").balance).toBe(200);

    const cost = creditsForAction("image.generate.high");
    expect(cost).toBeGreaterThan(200);
    const denied = spendCredits("user-a", "image.generate.high");
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.code).toBe("INSUFFICIENT_CREDITS");
      expect(denied.balance).toBe(200);
      expect(denied.message).toContain("เครดิตไม่พอ");
    }
    expect(getCreditBalance("user-a")).toBe(200);
  });

  it("deducts once when two spends race for the same balance", async () => {
    process.env.ARTSHIFT_WELCOME_CREDITS = "0";
    adminChangeCredits({
      accountId: "user-b",
      mode: "top_up",
      amount: creditsForAction("image.poseSkeleton"),
      reason: "seed one skeleton",
      actorEmail: "admin@example.com",
    });
    const [first, second] = await Promise.all([
      Promise.resolve().then(() => spendCredits("user-b", "image.poseSkeleton")),
      Promise.resolve().then(() => spendCredits("user-b", "image.poseSkeleton")),
    ]);
    const successes = [first, second].filter((result) => result.ok);
    expect(successes).toHaveLength(1);
    expect(getCreditBalance("user-b")).toBe(0);
  });

  it("refunds a failed spend once and records an admin top-up", () => {
    process.env.ARTSHIFT_WELCOME_CREDITS = "0";
    const topped = adminChangeCredits({
      accountId: "user-c",
      mode: "top_up",
      amount: 80,
      reason: "manual transfer",
      actorEmail: "admin@example.com",
    });
    expect(topped.ok).toBe(true);
    const spent = spendCredits("user-c", "prompt.enhance");
    expect(spent.ok).toBe(true);
    if (!spent.ok) return;
    expect(refundSpend(spent.entryId, "provider failed")?.type).toBe("refund");
    expect(refundSpend(spent.entryId, "again")).toBeNull();
    expect(getCreditBalance("user-c")).toBe(80);

    const negative = adminChangeCredits({
      accountId: "user-c",
      mode: "adjust",
      amount: -20,
      reason: "correction",
      actorEmail: "admin@example.com",
    });
    expect(negative.ok).toBe(true);
    if (negative.ok) expect(negative.balance).toBe(60);
    process.env.ARTSHIFT_WELCOME_CREDITS = "200";
    expect(ensureAccountCredits("user-c").balance).toBe(60);
    expect(
      adminChangeCredits({
        accountId: "user-c",
        mode: "adjust",
        amount: -1_000,
        reason: "too much",
        actorEmail: "admin@example.com",
      }).ok,
    ).toBe(false);
  });
});
