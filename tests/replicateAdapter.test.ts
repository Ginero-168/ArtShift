import { afterEach, describe, expect, it, vi } from "vitest";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import { RoutedAiRuntime } from "@/lib/ai-runtime/runtime";
import { ReplicateAiAdapter } from "@/lib/server/ai/adapters/replicateAdapter";

describe("Replicate AI adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves unknown prediction outcome across the runtime timeout boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "accepted-prediction",
          status: "processing",
          urls: { get: "https://api.replicate.com/v1/predictions/accepted-prediction" },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const runtime = new RoutedAiRuntime({
      adapters: [new ReplicateAiAdapter("test-token")],
      routes: {
        "vision.describe": { economy: [{ provider: "replicate", model: "openai/gpt-4o-mini" }] },
      },
    });
    await expect(
      runtime.execute(
        "vision.describe",
        {
          image: { dataUrl: "data:image/png;base64,AAAA" },
        },
        { cloudConsent: true, timeoutMs: 10 },
      ),
    ).rejects.toMatchObject({
      outcomeUnknown: true,
      predictionId: "accepted-prediction",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains the prediction when timeout interrupts a status fetch", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "polling-prediction",
              status: "processing",
              urls: { get: "https://api.replicate.com/v1/predictions/polling-prediction" },
            }),
            { status: 200 },
          ),
        )
        .mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) => {
              init.signal.addEventListener("abort", () => reject(init.signal.reason), {
                once: true,
              });
            }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const runtime = new RoutedAiRuntime({
        adapters: [new ReplicateAiAdapter("test-token")],
        routes: {
          "vision.describe": { economy: [{ provider: "replicate", model: "openai/gpt-4o-mini" }] },
        },
      });
      const outcome = runtime
        .execute(
          "vision.describe",
          {
            image: { dataUrl: "data:image/png;base64,AAAA" },
          },
          { cloudConsent: true, cache: false, timeoutMs: 1500 },
        )
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(1500);
      expect(await outcome).toMatchObject({
        outcomeUnknown: true,
        predictionId: "polling-prediction",
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
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
        headers: expect.objectContaining({ Prefer: "wait=60", "Cancel-After": "180s" }),
      }),
    );
  });

  it("normalizes a Replicate gpt-oss JSON tool envelope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-chat-1",
          model: "openai/gpt-oss-120b",
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
      model: "openai/gpt-oss-120b@abcdef0123456789abcdef0123456789",
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
    expect(body.input.prompt).toContain("Reasoning: high");
    expect(body.input.prompt).toContain("propose_design_plan");
    expect(body.input.max_tokens).toBeGreaterThanOrEqual(4_096);
  });

  it("normalizes a tool call envelope containing escaped single quotes (e.g. Cat\\'s) and trailing commas", async () => {
    const rawEnvelope =
      '{"kind":"tool_calls","text":"","calls":[{"id":"call-1","name":"propose_creative_direction","input":{"kind":"image-task","summary":"Fierce cat","reviewCriteria":["Cat\\\'s front paw is raised showing two fingers clearly",],"outputCount":1,}}]}';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-chat-escaped",
          model: "openai/gpt-oss-120b",
          status: "succeeded",
          output: [rawEnvelope],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "assistant.chat",
      input: {
        messages: [{ role: "user", content: "อยากให้มันชู 2 นิ้วด้วย" }],
        tools: [
          {
            name: "propose_creative_direction",
            description: "Propose creative direction",
            inputSchema: { type: "object" },
          },
        ],
      },
      model: "openai/gpt-oss-120b",
      signal: new AbortController().signal,
    });

    expect(result.output.stopReason).toBe("tool_use");
    expect(result.output.toolCalls).toHaveLength(1);
    expect(result.output.toolCalls[0].name).toBe("propose_creative_direction");
    expect(result.output.toolCalls[0].input).toMatchObject({
      kind: "image-task",
      summary: "Fierce cat",
      reviewCriteria: ["Cat's front paw is raised showing two fingers clearly"],
      outputCount: 1,
    });
  });

  it("normalizes a direct JSON tool payload without tool_calls envelope", async () => {
    const directPayload = JSON.stringify({
      kind: "clarification",
      question: "คุณต้องการสไตล์ของรูปหมูอย่างไร?",
      options: ["การ์ตูน", "ภาพถ่ายจริง", "มินิมอล"],
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-chat-direct",
          model: "openai/gpt-oss-120b",
          status: "succeeded",
          output: [directPayload],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "assistant.chat",
      input: {
        messages: [{ role: "user", content: "สร้างรูปหมู 3 รูป" }],
        tools: [
          {
            name: "propose_creative_direction",
            description: "Propose creative direction.",
            inputSchema: { type: "object" },
          },
        ],
      },
      model: "openai/gpt-oss-120b",
      signal: new AbortController().signal,
    });

    expect(result.output.stopReason).toBe("tool_use");
    expect(result.output.text).toBe("");
    expect(result.output.toolCalls).toEqual([
      {
        type: "tool_call",
        id: "replicate-call-1",
        name: "propose_creative_direction",
        input: JSON.parse(directPayload),
      },
    ]);
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
      model: "openai/gpt-oss-120b",
      signal: new AbortController().signal,
    });

    expect(result.output).toEqual({ prompt: "A refined design prompt" });
  });

  it("executes google/gemini-2.5-flash chat with system_instruction and conversation prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-gemini-chat-1",
          model: "google/gemini-2.5-flash",
          status: "succeeded",
          output: [
            '{"kind":"tool_calls","text":"","calls":[{"id":"call-gemini-1","name":"propose_creative_direction","input":{"kind":"image-task","summary":"Cat with peace sign","outputCount":1}}]}',
          ],
          metrics: { input_token_count: 500, output_token_count: 150, predict_time: 1.1 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "assistant.chat",
      input: {
        system: "You are the ArtShift Creative Director.",
        messages: [{ role: "user", content: "อยากให้มันชู 2 นิ้วด้วย" }],
        tools: [
          {
            name: "propose_creative_direction",
            description: "Propose creative direction",
            inputSchema: { type: "object" },
          },
        ],
      },
      model: "google/gemini-2.5-flash",
      options: {
        reasoning: { mode: "dynamic" },
      },
      signal: new AbortController().signal,
    });

    expect(result.output.stopReason).toBe("tool_use");
    expect(result.output.toolCalls).toEqual([
      {
        type: "tool_call",
        id: "call-gemini-1",
        name: "propose_creative_direction",
        input: { kind: "image-task", summary: "Cat with peace sign", outputCount: 1 },
      },
    ]);

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.input.system_instruction).toContain("You are the ArtShift Creative Director.");
    expect(body.input.system_instruction).toContain("ArtShift response contract");
    expect(body.input.prompt).toBe("User: อยากให้มันชู 2 นิ้วด้วย");
    expect(body.input.dynamic_thinking).toBe(true);
    expect(body.input.max_output_tokens).toBeGreaterThanOrEqual(4_096);
  });

  it("executes google/gemini-2.5-flash prompt enhancement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "prediction-gemini-prompt-1",
          model: "google/gemini-2.5-flash",
          status: "succeeded",
          output: ["A photorealistic cat raising two fingers in a peace sign"],
          metrics: { input_token_count: 40, output_token_count: 20, predict_time: 0.5 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "prompt.enhance",
      input: { prompt: "รูปแมวชู 2 นิ้ว", purpose: "image" },
      model: "google/gemini-2.5-flash",
      signal: new AbortController().signal,
    });

    expect(result.output).toEqual({
      prompt: "A photorealistic cat raising two fingers in a peace sign",
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.input.system_instruction).toContain("Rewrite the user's request as one precise image-generation prompt");
    expect(body.input.prompt).toBe("รูปแมวชู 2 นิ้ว");
    expect(body.input.dynamic_thinking).toBe(false);
  });

  it("forwards automatic quality and reference images to GPT Image 2", async () => {
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
        quality: "high",
        inputImages: [{ dataUrl: "data:image/png;base64,REF" }],
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
      quality: "high",
      aspect_ratio: "1:1",
      input_images: ["data:image/png;base64,REF"],
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

  it("preserves the prediction identity when the local timeout fires after acceptance", async () => {
    const controller = new AbortController();
    const timeout = new AiRuntimeError("TIMEOUT", "AI execution timed out.");
    let createCalls = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/cancel")) return new Response("{}", { status: 200 });
      createCalls += 1;
      if (createCalls === 1) {
        setTimeout(() => controller.abort(timeout), 10);
        return new Response(
          JSON.stringify({
            id: "prediction-timeout-1",
            status: "processing",
            urls: {
              get: "https://api.replicate.com/v1/predictions/prediction-timeout-1",
              cancel: "https://api.replicate.com/v1/predictions/prediction-timeout-1/cancel",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "image.generate",
        input: { prompt: "a cat", width: 1024, height: 1024 },
        model:
          "openai/gpt-image-2@abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      outcomeUnknown: true,
      predictionId: "prediction-timeout-1",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.replicate.com/v1/predictions/prediction-timeout-1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
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
        headers: expect.objectContaining({ Prefer: "wait=60", "Cancel-After": "180s" }),
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

  it("upscales a raster input with P-Image-Upscale and returns a safe data URL", async () => {
    const imageBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-upscale-1",
            model: "prunaai/p-image-upscale",
            version: "391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf",
            status: "succeeded",
            output: "https://replicate.delivery/upscaled.png",
            metrics: { predict_time: 2.4 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(imageBytes, { status: 200, headers: { "Content-Type": "image/png" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    const result = await adapter.execute({
      task: "image.upscale" as never,
      input: {
        image: { dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png" },
        width: 1024,
        height: 768,
        targetMegapixels: 16,
      } as never,
      model:
        "prunaai/p-image-upscale@391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf",
      signal: new AbortController().signal,
    });

    expect(result.output).toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from(imageBytes).toString("base64")}`,
    });
    expect(result).toMatchObject({
      model:
        "prunaai/p-image-upscale@391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf",
      requestId: "prediction-upscale-1",
      usage: { providerSeconds: 2.4 },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.replicate.com/v1/predictions",
      expect.objectContaining({
        body: JSON.stringify({
          version: "391b1558e068ac45d7df06b75e3e34e485b78769c6e9c634cacf21e1dfa239bf",
          input: {
            image: "data:image/png;base64,AAAA",
            upscale_mode: "target",
            target: 16,
            enhance_details: true,
            enhance_realism: false,
            output_format: "png",
            output_quality: 100,
            disable_safety_checker: false,
          },
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://replicate.delivery/upscaled.png",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("marks a created prediction as outcome-unknown when polling loses transport", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "prediction-uncertain-1",
            status: "processing",
            urls: { get: "https://api.replicate.com/v1/predictions/prediction-uncertain-1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockRejectedValueOnce(new Error("poll network down"));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new ReplicateAiAdapter("test-token");

    await expect(
      adapter.execute({
        task: "vision.ocr",
        input: { image: { dataUrl: "data:image/png;base64,AAAA" } },
        model: "openai/gpt-4o-mini",
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      outcomeUnknown: true,
      predictionId: "prediction-uncertain-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
