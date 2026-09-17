import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const STORE_VERSION = 2;
const CREDENTIAL_KEY_BYTES = 32;

export type AiCredentialProvider = "replicate" | "openai";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: true;
  name?: string;
  picture?: string;
};

export type AccountPublic = {
  id: string;
  provider: "google";
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: number;
};

export type StoredCredentialStatus = {
  configured: boolean;
  keyHint: string | null;
  storage: "encrypted-account";
  updatedAt: number | null;
};

/** @deprecated Prefer StoredCredentialStatus — kept for existing imports. */
export type ReplicateCredentialStatus = StoredCredentialStatus;

type PersistedUser = {
  id: string;
  provider: "google";
  providerSubject: string;
  email: string;
  name?: string;
  picture?: string;
  createdAt: number;
  updatedAt: number;
};

type PersistedCredential = {
  provider: AiCredentialProvider;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyHint: string;
  updatedAt: number;
};

type PersistedStore = {
  version: 2;
  users: Record<string, PersistedUser>;
  /** Key format: `${accountId}::${provider}` */
  credentials: Record<string, PersistedCredential>;
};

export function upsertGoogleAccount(profile: GoogleProfile): AccountPublic {
  const normalized = normalizeGoogleProfile(profile);
  const store = readStore();
  const existing = Object.values(store.users).find(
    (user) =>
      user.provider === "google" &&
      (user.providerSubject === normalized.sub || user.email === normalized.email),
  );
  const now = Date.now();
  if (existing) {
    existing.provider = "google";
    existing.providerSubject = normalized.sub;
    existing.email = normalized.email;
    if (normalized.name) existing.name = normalized.name;
    if (normalized.picture) existing.picture = normalized.picture;
    existing.updatedAt = now;
    writeStore(store);
    return toPublicUser(existing);
  }

  const user: PersistedUser = {
    id: randomUUID(),
    provider: "google",
    providerSubject: normalized.sub,
    email: normalized.email,
    ...(normalized.name ? { name: normalized.name } : {}),
    ...(normalized.picture ? { picture: normalized.picture } : {}),
    createdAt: now,
    updatedAt: now,
  };
  store.users[user.id] = user;
  writeStore(store);
  return toPublicUser(user);
}

export function getAccountById(accountId: string): AccountPublic | null {
  const user = readStore().users[accountId];
  return user ? toPublicUser(user) : null;
}

export function saveReplicateApiKey(accountId: string, token: string): void {
  saveProviderApiKey(accountId, "replicate", token);
}

export function readReplicateApiKey(accountId: string): string | undefined {
  return readProviderApiKey(accountId, "replicate");
}

export function getReplicateCredentialStatus(accountId: string): StoredCredentialStatus {
  return getProviderCredentialStatus(accountId, "replicate");
}

export function deleteReplicateApiKey(accountId: string): boolean {
  return deleteProviderApiKey(accountId, "replicate");
}

export function saveOpenAiApiKey(accountId: string, token: string): void {
  saveProviderApiKey(accountId, "openai", token);
}

export function readOpenAiApiKey(accountId: string): string | undefined {
  return readProviderApiKey(accountId, "openai");
}

export function getOpenAiCredentialStatus(accountId: string): StoredCredentialStatus {
  return getProviderCredentialStatus(accountId, "openai");
}

export function deleteOpenAiApiKey(accountId: string): boolean {
  return deleteProviderApiKey(accountId, "openai");
}

export function getServerKeyMaterial(name: string): Buffer {
  const configured = process.env[name];
  if (!configured) {
    if (process.env.NODE_ENV === "test") {
      return createHash("sha256").update(`artshift-test-key:${name}`).digest();
    }
    throw new Error(`${name} is not configured.`);
  }
  const key = Buffer.from(configured, "base64url");
  if (key.length !== CREDENTIAL_KEY_BYTES) throw new Error(`${name} is invalid.`);
  return key;
}

export function resetAccountStoreForTests(): void {
  try {
    unlinkSync(getStorePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function saveProviderApiKey(
  accountId: string,
  provider: AiCredentialProvider,
  token: string,
): void {
  const store = readStore();
  if (!store.users[accountId]) throw new Error("Account not found.");
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(`${providerLabel(provider)} API Key is required.`);
  }

  const encrypted = encryptCredential(accountId, provider, token);
  store.credentials[credentialKey(accountId, provider)] = {
    provider,
    ...encrypted,
    keyHint: maskApiKey(provider, token),
    updatedAt: Date.now(),
  };
  writeStore(store);
}

function readProviderApiKey(
  accountId: string,
  provider: AiCredentialProvider,
): string | undefined {
  const record = readStore().credentials[credentialKey(accountId, provider)];
  if (record?.provider !== provider) return undefined;
  return decryptCredential(accountId, provider, record);
}

function getProviderCredentialStatus(
  accountId: string,
  provider: AiCredentialProvider,
): StoredCredentialStatus {
  const record = readStore().credentials[credentialKey(accountId, provider)];
  if (record?.provider !== provider) {
    return { configured: false, keyHint: null, storage: "encrypted-account", updatedAt: null };
  }
  return {
    configured: true,
    keyHint: record.keyHint,
    storage: "encrypted-account",
    updatedAt: record.updatedAt,
  };
}

function deleteProviderApiKey(accountId: string, provider: AiCredentialProvider): boolean {
  const store = readStore();
  const key = credentialKey(accountId, provider);
  if (!store.credentials[key]) return false;
  delete store.credentials[key];
  writeStore(store);
  return true;
}

function normalizeGoogleProfile(profile: GoogleProfile): GoogleProfile {
  if (
    typeof profile.sub !== "string" ||
    profile.sub.length < 2 ||
    profile.sub.length > 255 ||
    profile.emailVerified !== true
  ) {
    throw new Error("Invalid Google identity.");
  }
  const email = profile.email.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid Google email.");
  }
  return {
    sub: profile.sub,
    email,
    emailVerified: true,
    ...(typeof profile.name === "string" && profile.name.length <= 200
      ? { name: profile.name }
      : {}),
    ...(typeof profile.picture === "string" && profile.picture.length <= 2_000
      ? { picture: profile.picture }
      : {}),
  };
}

function encryptCredential(accountId: string, provider: AiCredentialProvider, token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_CREDENTIAL_ENCRYPTION_KEY"),
    iv,
  );
  cipher.setAAD(Buffer.from(`${provider}:${accountId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: encode(ciphertext),
    iv: encode(iv),
    authTag: encode(cipher.getAuthTag()),
  };
}

function decryptCredential(
  accountId: string,
  provider: AiCredentialProvider,
  record: PersistedCredential,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getServerKeyMaterial("ARTSHIFT_CREDENTIAL_ENCRYPTION_KEY"),
    decode(record.iv),
  );
  decipher.setAAD(Buffer.from(`${provider}:${accountId}`, "utf8"));
  decipher.setAuthTag(decode(record.authTag));
  return Buffer.concat([decipher.update(decode(record.ciphertext)), decipher.final()]).toString(
    "utf8",
  );
}

function readStore(): PersistedStore {
  try {
    const parsed = JSON.parse(readFileSync(getStorePath(), "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.users) || !isRecord(parsed.credentials)) {
      throw new Error("invalid store");
    }
    if (parsed.version === 2) {
      return parsed as PersistedStore;
    }
    if (parsed.version === 1) {
      const migrated = migrateStoreV1ToV2(parsed);
      writeStore(migrated);
      return migrated;
    }
    throw new Error("invalid store");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    if (error instanceof SyntaxError || (error as Error).message === "invalid store") {
      throw new Error("Account store is invalid.");
    }
    throw error;
  }
}

function migrateStoreV1ToV2(parsed: Record<string, unknown>): PersistedStore {
  const users = parsed.users as Record<string, PersistedUser>;
  const oldCredentials = parsed.credentials as Record<string, PersistedCredential>;
  const credentials: Record<string, PersistedCredential> = {};
  for (const [accountId, record] of Object.entries(oldCredentials)) {
    if (!record || typeof record !== "object") continue;
    const provider = record.provider === "openai" ? "openai" : "replicate";
    credentials[credentialKey(accountId, provider)] = { ...record, provider };
  }
  return { version: 2, users, credentials };
}

function writeStore(store: PersistedStore): void {
  const path = getStorePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporaryPath = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
  chmodSync(path, 0o600);
}

function emptyStore(): PersistedStore {
  return { version: STORE_VERSION, users: {}, credentials: {} };
}

function getStorePath(): string {
  return (
    process.env.ARTSHIFT_ACCOUNT_STORE_PATH ??
    (process.env.NODE_ENV === "test"
      ? join(tmpdir(), "artshift-account-store-test.json")
      : process.env.NODE_ENV === "production"
        ? "/var/lib/artshift/auth/store.json"
        : join(process.cwd(), ".artshift", "auth", "store.json"))
  );
}

function toPublicUser(user: PersistedUser): AccountPublic {
  return {
    id: user.id,
    provider: "google",
    email: user.email,
    name: user.name ?? null,
    picture: user.picture ?? null,
    createdAt: user.createdAt,
  };
}

function credentialKey(accountId: string, provider: AiCredentialProvider): string {
  return `${accountId}::${provider}`;
}

function providerLabel(provider: AiCredentialProvider): string {
  return provider === "openai" ? "OpenAI" : "Replicate";
}

function maskApiKey(provider: AiCredentialProvider, token: string): string {
  if (provider === "openai") {
    const prefix = token.startsWith("sk-proj-") ? "sk-proj-" : "sk-";
    return `${prefix}••••${token.slice(-4)}`;
  }
  return `${token.slice(0, 3)}••••${token.slice(-4)}`;
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
