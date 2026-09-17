import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteOpenAiApiKey,
  deleteReplicateApiKey,
  getAccountById,
  getOpenAiCredentialStatus,
  getReplicateCredentialStatus,
  readOpenAiApiKey,
  readReplicateApiKey,
  saveOpenAiApiKey,
  saveReplicateApiKey,
  upsertGoogleAccount,
} from "@/lib/server/auth/accountStore";

const TOKEN = `r8_${"x".repeat(37)}`;
const OPENAI_TOKEN = `sk-${"z".repeat(48)}`;
let storeDir = "";

describe("persistent Google account store", () => {
  beforeAll(() => {
    storeDir = mkdtempSync(join(tmpdir(), "artshift-google-account-test-"));
    process.env.ARTSHIFT_ACCOUNT_STORE_PATH = join(storeDir, "store.json");
  });

  afterAll(() => {
    delete process.env.ARTSHIFT_ACCOUNT_STORE_PATH;
    rmSync(storeDir, { recursive: true, force: true });
  });

  it("creates and reuses an account by Google's stable subject", () => {
    const first = upsertGoogleAccount({
      sub: "google-sub-1",
      email: "Designer@example.com",
      emailVerified: true,
      name: "Design User",
    });
    const second = upsertGoogleAccount({
      sub: "google-sub-1",
      email: "designer@example.com",
      emailVerified: true,
      name: "Updated Design User",
    });

    expect(first.id).toBe(second.id);
    expect(second).toMatchObject({
      provider: "google",
      email: "designer@example.com",
      name: "Updated Design User",
    });
    expect(getAccountById(first.id)).toEqual(second);
  });

  it("encrypts the Replicate key at rest and returns only metadata to status callers", () => {
    const account = upsertGoogleAccount({
      sub: "google-sub-2",
      email: "owner@example.com",
      emailVerified: true,
    });

    saveReplicateApiKey(account.id, TOKEN);
    expect(readReplicateApiKey(account.id)).toBe(TOKEN);
    expect(getReplicateCredentialStatus(account.id)).toMatchObject({
      configured: true,
      keyHint: "r8_••••xxxx",
      storage: "encrypted-account",
    });
    const rawStore = readFileSync(process.env.ARTSHIFT_ACCOUNT_STORE_PATH ?? "", "utf8");
    expect(rawStore).not.toContain(TOKEN);
  });

  it("stores OpenAI and Replicate keys independently for the same account", () => {
    const account = upsertGoogleAccount({
      sub: "google-sub-openai",
      email: "openai@example.com",
      emailVerified: true,
    });

    saveReplicateApiKey(account.id, TOKEN);
    saveOpenAiApiKey(account.id, OPENAI_TOKEN);
    expect(readReplicateApiKey(account.id)).toBe(TOKEN);
    expect(readOpenAiApiKey(account.id)).toBe(OPENAI_TOKEN);
    expect(getOpenAiCredentialStatus(account.id)).toMatchObject({
      configured: true,
      keyHint: "sk-••••zzzz",
    });
    expect(deleteOpenAiApiKey(account.id)).toBe(true);
    expect(readOpenAiApiKey(account.id)).toBeUndefined();
    expect(readReplicateApiKey(account.id)).toBe(TOKEN);
  });

  it("deletes the persisted credential without deleting the Google account", () => {
    const account = upsertGoogleAccount({
      sub: "google-sub-3",
      email: "remove@example.com",
      emailVerified: true,
    });

    saveReplicateApiKey(account.id, TOKEN);
    expect(deleteReplicateApiKey(account.id)).toBe(true);
    expect(readReplicateApiKey(account.id)).toBeUndefined();
    expect(getAccountById(account.id)).toEqual(account);
  });
});
