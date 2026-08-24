import { afterEach, describe, expect, it, vi } from "vitest";
import { ReplicateAiAdapter } from "@/lib/server/ai/adapters/replicateAdapter";

describe("Replicate AI adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps official-model output and optional metrics to the normalized contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-1",
          model: "openai/gpt-4o-mini",
          version: "abcdef0123456789abcdef0123456789",
          status: "succeeded",
          output: [
            '{"objects":[{"label":"cup","confidence":0.9,"box":{"x":0.1,"y":0.2,"width":0.3,"height":0.4}}]}',
          ],
          metrics: { input_token_count: 120, output_token_count: 30, predict_time: 0.8 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "vision.propose",
      input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
      model: "openai/gpt-4o-mini@abcdef0123456789abcdef0123456789",
      signal: new AbortController().signal,
    });

    expect(result.output.objects).toEqual([
      {
        label: "cup",
        confidence: 0.9,
        box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    ]);
    expect(result).toMatchObject({
      model: "openai/gpt-4o-mini@abcdef0123456789abcdef0123456789",
      requestId: "prediction-1",
      usage: { inputTokens: 120, outputTokens: 30, providerSeconds: 0.8 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions",
      expect.objectContaining({
        headers: expect.objectContaining({ Prefer: "wait=60", "Cancel-After": "90s" }),
      }),
    );
  });
});
