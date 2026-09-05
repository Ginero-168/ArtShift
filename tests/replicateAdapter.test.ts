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

  it("normalizes a Replicate gpt-oss JSON tool envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-chat-1",
          model: "openai/gpt-oss-20b",
          version: "abcdef0123456789abcdef0123456789",
          status: "succeeded",
          output: [
            '{"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"propose_design_plan","input":{"summary":"Make it minimal","commands":[]}}]}',
          ],
          metrics: { input_token_count: 800, output_token_count: 120, predict_time: 1.2 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "assistant.chat",
      input: {
        system: "You are ArtShift.",
        messages: [{ role: "user", content: "Create a plan." }],
        tools: [
          {
            name: "propose_design_plan",
            description: "Propose a plan.",
            inputSchema: { type: "object" },
          },
        ],
      },
      model: "openai/gpt-oss-20b@abcdef0123456789abcdef0123456789",
      signal: new AbortController().signal,
    });

    expect(result.output.stopReason).toBe("tool_use");
    expect(result.output.text).toBe("");
    expect(result.output.toolCalls).toEqual([
      {
        type: "tool_call",
        id: "call-1",
        name: "propose_design_plan",
        input: { summary: "Make it minimal", commands: [] },
      },
    ]);
    expect(result.usage).toMatchObject({
      inputTokens: 800,
      outputTokens: 120,
      providerSeconds: 1.2,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.input.prompt).toContain("<｜start｜>system");
    expect(body.input.prompt).toContain("propose_design_plan");
    expect(body.input.max_tokens).toBeGreaterThan(0);
  });

  it("returns prompt enhancement text through the same Replicate provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-prompt-1",
          status: "succeeded",
          output: ["A refined design prompt"],
          metrics: { input_token_count: 50, output_token_count: 10 },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "prompt.enhance",
      input: { prompt: "make a premium poster", purpose: "design" },
      model: "openai/gpt-oss-20b",
      signal: new AbortController().signal,
    });

    expect(result.output).toEqual({ prompt: "A refined design prompt" });
  });

  it("generates a low-quality GPT Image 2 file through Replicate", async () => {
    const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-image-1",
            model: "openai/gpt-image-2",
            status: "succeeded",
            output: ["https://replicate.delivery/image.webp"],
            metrics: { predict_time: 12.4, image_output_count: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(imageBytes, { status: 200, headers: { "Content-Type": "image/webp" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "image.generate",
      input: {
        prompt: "A warm editorial portrait of a cat",
        width: 1024,
        height: 1024,
        aspectRatio: "1:1",
      },
      model: "openai/gpt-image-2",
      signal: new AbortController().signal,
    });

    expect(result.output).toMatchObject({
      dataUrl: `data:image/webp;base64,${Buffer.from(imageBytes).toString("base64")}`,
      prompt: "A warm editorial portrait of a cat",
      width: 1024,
      height: 1024,
    });
    expect(result).toMatchObject({
      model: "openai/gpt-image-2",
      requestId: "prediction-image-1",
      usage: { providerSeconds: 12.4 },
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.input).toEqual({
      prompt: "A warm editorial portrait of a cat",
      quality: "low",
      aspect_ratio: "1:1",
      number_of_images: 1,
      output_format: "webp",
      output_compression: 90,
      background: "opaque",
      moderation: "auto",
    });
    expect(body.input).not.toHaveProperty("openai_api_key");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://replicate.delivery/image.webp",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects an image output URL outside Replicate delivery storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "prediction-image-unsafe",
            status: "succeeded",
            output: ["https://example.com/unsafe.webp"],
          }),
          { status: 200 },
        ),
      ),
    );
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "image.generate",
        input: { prompt: "a cat", width: 1024, height: 1024 },
        model: "openai/gpt-image-2",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
  });

  it("rejects an oversized generated image before importing it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-image-large",
            status: "succeeded",
            output: ["https://replicate.delivery/large.webp"],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response("not-read", {
          status: 200,
          headers: {
            "Content-Type": "image/webp",
            "Content-Length": String(20 * 1024 * 1024 + 1),
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "image.generate",
        input: { prompt: "a cat", width: 1024, height: 1024 },
        model: "openai/gpt-image-2",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redacts raw Replicate error bodies for image generation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("provider-internal-detail", { status: 401 })),
    );
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "image.generate",
        input: { prompt: "a cat", width: 1024, height: 1024 },
        model: "openai/gpt-image-2",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_AUTH",
      message: "Replicate rejected this request.",
    });
  });

  it("vectorizes a raster input with Recraft and validates the returned SVG file", async () => {
    const svg = '<svg viewBox="0 0 256 256"><path fill="#ff0000" d="M0 0h256v256H0z"/></svg>';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-vectorize-1",
            model: "recraft-ai/recraft-vectorize",
            version: "abcdef0123456789abcdef0123456789",
            status: "succeeded",
            output: "https://replicate.delivery/example.svg",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(svg, { status: 200, headers: { "Content-Type": "image/svg+xml" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "vectorize.recraft",
      input: {
        image: { dataUrl: "data:image/png;base64,AAAA" },
        width: 256,
        height: 256,
      },
      model: "recraft-ai/recraft-vectorize",
      signal: new AbortController().signal,
    });

    expect(result.output).toEqual({ svg });
    expect(result).toMatchObject({
      model: "recraft-ai/recraft-vectorize@abcdef0123456789abcdef0123456789",
      requestId: "prediction-vectorize-1",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.replicate.com/v1/models/recraft-ai/recraft-vectorize/predictions",
      expect.objectContaining({
        headers: expect.objectContaining({ Prefer: "wait=60", "Cancel-After": "90s" }),
        body: JSON.stringify({ input: { image: "data:image/png;base64,AAAA" } }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://replicate.delivery/example.svg",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects a Recraft output URL outside Replicate delivery storage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "prediction-vectorize-unsafe",
            status: "succeeded",
            output: "https://example.com/unsafe.svg",
          }),
          { status: 200 },
        ),
      ),
    );
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "vectorize.recraft",
        input: {
          image: { dataUrl: "data:image/png;base64,AAAA" },
          width: 256,
          height: 256,
        },
        model: "recraft-ai/recraft-vectorize",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
  });

  it("rejects active content in a Recraft SVG before it reaches the editor", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-vectorize-unsafe-svg",
            status: "succeeded",
            output: "https://replicate.delivery/unsafe.svg",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response('<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>', {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "vectorize.recraft",
        input: {
          image: { dataUrl: "data:image/png;base64,AAAA" },
          width: 256,
          height: 256,
        },
        model: "recraft-ai/recraft-vectorize",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_SCHEMA" });
  });

  it("redacts raw Replicate error bodies for Recraft requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("provider-internal-detail", { status: 401 })),
    );
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "vectorize.recraft",
        input: {
          image: { dataUrl: "data:image/png;base64,AAAA" },
          width: 256,
          height: 256,
        },
        model: "recraft-ai/recraft-vectorize",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_AUTH",
      message: "Replicate rejected this request.",
    });
  });
});
