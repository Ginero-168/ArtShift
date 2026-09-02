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
});
