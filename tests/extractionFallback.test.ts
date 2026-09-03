import { describe, expect, it, vi } from "vitest";
import { runRmbgWithFallback, shouldUseServerRmbg } from "@/lib/ai/extractionFallback";
import { resetModelRuntimeStatus } from "@/lib/ai/modelRegistry";
import { removeBackgroundWithRuntime } from "@/lib/ai/removeBg";

const localImage = "data:image/png;base64,LOCAL";
const serverImage = "data:image/png;base64,SERVER";

describe("RMBG Local-first/VPS fallback routing", () => {
  it.each(["lazy", "loading", "failed"] as const)(
    "uses VPS when the local model is %s and fallback consent is enabled",
    async (localStatus) => {
      const runLocal = vi.fn(async () => localImage);
      const runServer = vi.fn(async () => serverImage);

      expect(shouldUseServerRmbg(localStatus, true)).toBe(true);
      await expect(
        runRmbgWithFallback({ localStatus, allowServerFallback: true, runLocal, runServer }),
      ).resolves.toEqual({ dataUrl: serverImage, runtime: "vps-fallback" });
      expect(runServer).toHaveBeenCalledOnce();
      expect(runLocal).not.toHaveBeenCalled();
    },
  );

  it("keeps a loaded local model local and never calls VPS", async () => {
    const runLocal = vi.fn(async () => localImage);
    const runServer = vi.fn(async () => serverImage);

    expect(shouldUseServerRmbg("loaded", true)).toBe(false);
    await expect(
      runRmbgWithFallback({
        localStatus: "loaded",
        allowServerFallback: true,
        runLocal,
        runServer,
      }),
    ).resolves.toEqual({ dataUrl: localImage, runtime: "local" });
    expect(runLocal).toHaveBeenCalledOnce();
    expect(runServer).not.toHaveBeenCalled();
  });

  it("does not upload when fallback consent is disabled", async () => {
    const runLocal = vi.fn(async () => localImage);
    const runServer = vi.fn(async () => serverImage);

    expect(shouldUseServerRmbg("loading", false)).toBe(false);
    await expect(
      runRmbgWithFallback({
        localStatus: "loading",
        allowServerFallback: false,
        runLocal,
        runServer,
      }),
    ).resolves.toEqual({ dataUrl: localImage, runtime: "local" });
    expect(runLocal).toHaveBeenCalledOnce();
    expect(runServer).not.toHaveBeenCalled();
  });

  it("tries VPS after a local inference failure when fallback is enabled", async () => {
    const localError = new Error("local model failed");
    const runLocal = vi.fn(async () => {
      throw localError;
    });
    const runServer = vi.fn(async () => serverImage);

    await expect(
      runRmbgWithFallback({
        localStatus: "loaded",
        allowServerFallback: true,
        runLocal,
        runServer,
      }),
    ).resolves.toEqual({ dataUrl: serverImage, runtime: "vps-fallback" });
    expect(runLocal).toHaveBeenCalledOnce();
    expect(runServer).toHaveBeenCalledOnce();
  });

  it("uses the browser fallback client contract without loading Transformers when local is lazy", async () => {
    resetModelRuntimeStatus("rmbg-1.4");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          result: { dataUrl: serverImage, width: 1, height: 1 },
          runtime: "vps-fallback",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      removeBackgroundWithRuntime(localImage, { allowServerFallback: true }),
    ).resolves.toEqual({ dataUrl: serverImage, runtime: "vps-fallback" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/local-ai/rmbg",
      expect.objectContaining({ method: "POST", signal: undefined }),
    );
    vi.unstubAllGlobals();
  });
});
