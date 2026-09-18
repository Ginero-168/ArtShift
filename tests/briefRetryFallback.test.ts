import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUD_BRIEF_ATTEMPTS, fetchBriefDataForImage } from "@/lib/ai/briefGenerator";
import { isUsableBriefLayout } from "@/lib/ai/briefParser";

describe("Convert to Brief cloud retry (no local fallback)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses exactly 3 cloud attempts", () => {
    expect(CLOUD_BRIEF_ATTEMPTS).toBe(3);
  });

  it("retries cloud brief requests before succeeding", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ success: false, retryable: true, error: "unusable_layout" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          result: {
            aspectRatio: { width: 1000, height: 700 },
            backgroundPartitions: [{ name: "พื้นหลัง", box: [0, 0, 1000, 1000], color: "#e2e8f0" }],
            dividers: [],
            focalObjects: [],
            texts: [],
          },
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const attempts: number[] = [];
    const result = await fetchBriefDataForImage(
      "data:image/png;base64,aaa",
      undefined,
      (n) => {
        attempts.push(n);
      },
      { cloudConsent: true },
    );
    expect(isUsableBriefLayout(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(attempts).toEqual([1, 2]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      cloudConsent: true,
    });
  });

  it("does not fetch without explicit cloud consent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBriefDataForImage("data:image/png;base64,aaa")).rejects.toThrow(
      "Cloud consent is required",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails only after exactly 3 cloud attempts with no local fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ success: false, retryable: true, error: "unusable_layout" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchBriefDataForImage("data:image/png;base64,aaa", undefined, undefined, {
        cloudConsent: true,
      }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
