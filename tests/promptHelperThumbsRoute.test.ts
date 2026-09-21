import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountMock = vi.hoisted(() => ({ value: { id: "account-test" } as { id: string } | null }));
const tokenMock = vi.hoisted(() => ({ value: "r8_account-token" as string | undefined }));
const ensureMock = vi.hoisted(() => vi.fn());
const listMock = vi.hoisted(() => vi.fn());
const failedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server/ai/userCredentials", () => ({
  getUserAccount: () => accountMock.value,
  getAccountReplicateToken: () => tokenMock.value,
  getSessionReplicateToken: () => process.env.REPLICATE_API_TOKEN,
}));
vi.mock("@/lib/ai/orchestration/promptHelperThumbsEnsure", () => ({
  ensurePromptHelperThumbs: (...args: unknown[]) => ensureMock(...args),
  listExistingPromptHelperThumbIds: (...args: unknown[]) => listMock(...args),
  listFailedPromptHelperThumbIds: (...args: unknown[]) => failedMock(...args),
}));

import { GET, POST } from "../app/api/ai/prompt-helper/thumbs/route";

function postRequest(body: unknown): NextRequest {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    headers: new Headers({ "content-length": String(bytes.byteLength) }),
    arrayBuffer: async () => bytes.buffer,
    signal: new AbortController().signal,
  } as unknown as NextRequest;
}

function getRequest(ids?: string): NextRequest {
  const url = new URL("https://artshift.test/api/ai/prompt-helper/thumbs");
  if (ids) url.searchParams.set("ids", ids);
  return {
    headers: new Headers(),
    nextUrl: url,
  } as unknown as NextRequest;
}

describe("Prompt Helper thumbs API", () => {
  beforeEach(() => {
    accountMock.value = { id: "account-test" };
    tokenMock.value = "r8_account-token";
    ensureMock.mockReset();
    listMock.mockReset();
    failedMock.mockReset();
    listMock.mockResolvedValue(["cinematic"]);
    failedMock.mockResolvedValue([]);
    ensureMock.mockResolvedValue({
      existing: ["cinematic"],
      queued: ["flat"],
      skippedNoPrompt: [],
      skippedNoToken: false,
    });
    process.env.REPLICATE_API_TOKEN = "r8_env_must_not_be_used";
  });

  it("requires authentication to list thumbs", async () => {
    accountMock.value = null;
    const response = await GET(getRequest("cinematic"));
    expect(response.status).toBe(401);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated generation", async () => {
    accountMock.value = null;
    const response = await POST(postRequest({ optionIds: ["flat"], cloudConsent: true }));
    expect(response.status).toBe(401);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("rejects generation without explicit cloud consent", async () => {
    const response = await POST(postRequest({ optionIds: ["flat"] }));
    expect(response.status).toBe(403);
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("does not use REPLICATE_API_TOKEN when the account has no BYOK key", async () => {
    tokenMock.value = undefined;
    const response = await POST(postRequest({ optionIds: ["flat"], cloudConsent: true }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "PROVIDER_AUTH" });
    expect(ensureMock).not.toHaveBeenCalled();
  });

  it("queues generation with the account BYOK token after consent", async () => {
    const response = await POST(postRequest({ optionIds: ["flat"], cloudConsent: true }));
    expect(response.status).toBe(200);
    expect(ensureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        optionIds: ["flat"],
        token: "r8_account-token",
        maxQueue: 48,
      }),
    );
  });
});
