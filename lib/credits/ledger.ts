import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type CreditAction, creditsForAction, welcomeGrantCredits } from "@/lib/credits/pricing";

const STORE_VERSION = 1;
const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 5_000;

export type LedgerEntryType = "top_up" | "spend" | "adjust" | "refund";
export type CreditActor = "user" | "admin" | "system";

export type LedgerEntry = {
  id: string;
  accountId: string;
  type: LedgerEntryType;
  /** Signed credits. Spend is negative; top-up and refund are positive. */
  amount: number;
  balanceAfter: number;
  reason: string;
  action: string | null;
  relatedEntryId: string | null;
  createdAt: number;
  actor: CreditActor;
  actorEmail: string | null;
};

export type AccountCreditState = {
  balance: number;
  welcomeGranted: boolean;
  updatedAt: number;
};

type PersistedStore = {
  version: 1;
  revision: number;
  accounts: Record<string, AccountCreditState>;
  entries: LedgerEntry[];
};

export type SpendSuccess = {
  ok: true;
  entryId: string;
  credits: number;
  balance: number;
};

export type SpendDenied = {
  ok: false;
  code: "INSUFFICIENT_CREDITS";
  required: number;
  balance: number;
  message: string;
};

export function insufficientCreditsMessage(required: number, balance: number): string {
  return `เครดิตไม่พอสำหรับงานนี้ (ต้องใช้ ${required} เครดิต คงเหลือ ${balance}) ติดต่อผู้ดูแลเพื่อเติมเครดิต`;
}

export function getCreditBalance(accountId: string): number {
  return withStoreLock(() => readStore().accounts[accountId]?.balance ?? 0);
}

export function getCreditState(accountId: string): AccountCreditState {
  return withStoreLock(() => {
    const state = readStore().accounts[accountId];
    return state ? { ...state } : { balance: 0, welcomeGranted: false, updatedAt: 0 };
  });
}

/**
 * Idempotent welcome grant. Safe to call on every login.
 * Does not top up an account that already received the grant.
 */
export function ensureAccountCredits(accountId: string): AccountCreditState {
  return withStoreLock(() => {
    const store = readStore();
    grantWelcome(store, accountId);
    writeStore(store);
    const state = store.accounts[accountId];
    return state ? { ...state } : { balance: 0, welcomeGranted: false, updatedAt: 0 };
  });
}

export function listLedgerEntries(accountId: string, limit = 40): LedgerEntry[] {
  const cap = Math.max(1, Math.min(200, limit));
  return withStoreLock(() =>
    readStore()
      .entries.filter((entry) => entry.accountId === accountId)
      .slice(-cap)
      .reverse(),
  );
}

export function outstandingCredits(): number {
  return withStoreLock(() =>
    Object.values(readStore().accounts).reduce((sum, account) => sum + account.balance, 0),
  );
}

/**
 * Atomic check-and-deduct. Concurrent callers serialize on a lock file so
 * two AI requests cannot both pass the balance check.
 */
export function spendCredits(
  accountId: string,
  action: CreditAction,
  units = 1,
  reason?: string,
): SpendSuccess | SpendDenied {
  const credits = creditsForAction(action, units);
  return withStoreLock(() => {
    const store = readStore();
    grantWelcome(store, accountId);
    const state = store.accounts[accountId];
    const balance = state?.balance ?? 0;
    if (credits <= 0) {
      writeStore(store);
      return {
        ok: true,
        entryId: "",
        credits: 0,
        balance,
      };
    }
    if (balance < credits) {
      writeStore(store);
      return {
        ok: false,
        code: "INSUFFICIENT_CREDITS",
        required: credits,
        balance,
        message: insufficientCreditsMessage(credits, balance),
      };
    }
    const next = balance - credits;
    const entry = appendEntry(store, {
      accountId,
      type: "spend",
      amount: -credits,
      balanceAfter: next,
      reason: reason ?? action,
      action,
      relatedEntryId: null,
      actor: "user",
      actorEmail: null,
    });
    if (state) {
      state.balance = next;
      state.updatedAt = entry.createdAt;
    }
    writeStore(store);
    return { ok: true, entryId: entry.id, credits, balance: next };
  });
}

/** Return a prior spend to the balance. Idempotent per spend entry. */
export function refundSpend(entryId: string, reason: string): LedgerEntry | null {
  if (!entryId) return null;
  return withStoreLock(() => {
    const store = readStore();
    const spend = store.entries.find((entry) => entry.id === entryId && entry.type === "spend");
    if (!spend || spend.amount >= 0) return null;
    const already = store.entries.some(
      (entry) => entry.type === "refund" && entry.relatedEntryId === spend.id,
    );
    if (already) return null;
    const state = store.accounts[spend.accountId] ?? {
      balance: 0,
      welcomeGranted: true,
      updatedAt: Date.now(),
    };
    store.accounts[spend.accountId] = state;
    const credit = Math.abs(spend.amount);
    state.balance += credit;
    const entry = appendEntry(store, {
      accountId: spend.accountId,
      type: "refund",
      amount: credit,
      balanceAfter: state.balance,
      reason: reason.slice(0, 500),
      action: spend.action,
      relatedEntryId: spend.id,
      actor: "system",
      actorEmail: null,
    });
    state.updatedAt = entry.createdAt;
    writeStore(store);
    return entry;
  });
}

export function adminChangeCredits(input: {
  accountId: string;
  mode: "top_up" | "adjust";
  amount: number;
  reason: string;
  actorEmail: string;
}): { ok: true; balance: number; entry: LedgerEntry } | { ok: false; error: string } {
  const reason = input.reason.trim();
  if (reason.length < 2 || reason.length > 500) {
    return { ok: false, error: "ต้องระบุเหตุผล" };
  }
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    return { ok: false, error: "จำนวนเครดิตต้องเป็นจำนวนเต็มที่ไม่ใช่ศูนย์" };
  }
  if (input.mode === "top_up" && input.amount < 0) {
    return { ok: false, error: "การเติมเครดิตต้องเป็นจำนวนบวก" };
  }
  return withStoreLock(() => {
    const store = readStore();
    const state = store.accounts[input.accountId] ?? {
      balance: 0,
      welcomeGranted: false,
      updatedAt: Date.now(),
    };
    // An admin write is authoritative. Do not stack the welcome grant on top later.
    state.welcomeGranted = true;
    store.accounts[input.accountId] = state;
    const next = state.balance + input.amount;
    if (next < 0) {
      return { ok: false, error: "ยอดหลังปรับต้องไม่ติดลบ" };
    }
    state.balance = next;
    const entry = appendEntry(store, {
      accountId: input.accountId,
      type: input.mode === "top_up" ? "top_up" : "adjust",
      amount: input.amount,
      balanceAfter: next,
      reason,
      action: null,
      relatedEntryId: null,
      actor: "admin",
      actorEmail: input.actorEmail,
    });
    state.updatedAt = entry.createdAt;
    writeStore(store);
    return { ok: true, balance: next, entry };
  });
}

export function resetCreditStoreForTests(): void {
  try {
    unlinkSync(getStorePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    unlinkSync(lockPath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function grantWelcome(store: PersistedStore, accountId: string): void {
  const existing = store.accounts[accountId];
  if (existing?.welcomeGranted) return;
  const grant = welcomeGrantCredits();
  const state = existing ?? { balance: 0, welcomeGranted: false, updatedAt: Date.now() };
  store.accounts[accountId] = state;
  state.welcomeGranted = true;
  if (grant > 0) {
    state.balance += grant;
    const entry = appendEntry(store, {
      accountId,
      type: "top_up",
      amount: grant,
      balanceAfter: state.balance,
      reason: "welcome grant",
      action: null,
      relatedEntryId: null,
      actor: "system",
      actorEmail: null,
    });
    state.updatedAt = entry.createdAt;
  } else {
    state.updatedAt = Date.now();
  }
}

function appendEntry(
  store: PersistedStore,
  input: Omit<LedgerEntry, "id" | "createdAt">,
): LedgerEntry {
  const entry: LedgerEntry = {
    id: randomUUID(),
    createdAt: Date.now(),
    ...input,
  };
  store.entries.push(entry);
  return entry;
}

function withStoreLock<T>(fn: () => T): T {
  const path = lockPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const started = Date.now();
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(path, "wx");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > LOCK_STALE_MS) unlinkSync(path);
      } catch {
        // Another worker removed the stale lock.
      }
      if (Date.now() - started > LOCK_WAIT_MS) {
        throw new Error("Credit ledger lock timed out.");
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    try {
      unlinkSync(path);
    } catch {
      // Lock already cleared.
    }
  }
}

function readStore(): PersistedStore {
  try {
    const parsed = JSON.parse(readFileSync(getStorePath(), "utf8")) as unknown;
    if (!isStore(parsed)) throw new Error("invalid store");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    if (error instanceof SyntaxError || (error as Error).message === "invalid store") {
      throw new Error("Credit ledger is invalid.");
    }
    throw error;
  }
}

function writeStore(store: PersistedStore): void {
  store.revision += 1;
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  try {
    chmodSync(dirname(path), 0o700);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
  }
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function emptyStore(): PersistedStore {
  return { version: STORE_VERSION, revision: 0, accounts: {}, entries: [] };
}

function getStorePath(): string {
  return (
    process.env.ARTSHIFT_CREDIT_STORE_PATH ??
    (process.env.NODE_ENV === "test"
      ? join(tmpdir(), "artshift-credits-test", "credits.json")
      : process.env.NODE_ENV === "production"
        ? "/var/lib/artshift/auth/credits.json"
        : join(process.cwd(), ".artshift", "auth", "credits.json"))
  );
}

function lockPath(): string {
  return `${getStorePath()}.lock`;
}

function isStore(value: unknown): value is PersistedStore {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const store = value as Record<string, unknown>;
  return (
    store.version === 1 &&
    typeof store.revision === "number" &&
    typeof store.accounts === "object" &&
    store.accounts !== null &&
    Array.isArray(store.entries)
  );
}
