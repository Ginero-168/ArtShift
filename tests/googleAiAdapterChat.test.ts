import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GoogleAiAdapter, compileGeminiSchema } from "@/lib/server/ai/adapters/googleAdapter";
import { AiRuntimeError } from "@/lib/ai-runtime/errors";
import type { AiAssistantChatInput } from "@/lib/ai-runtime/contracts";

describe("GoogleAiAdapter assistant.chat & schema compiler", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("status()", () => {
    it("reports assistant.chat in supported tasks and provides creative-director alias", async () => {
      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const status = await adapter.status();

      expect(status.id).toBe("google");
      expect(status.configured).toBe(true);
      expect(status.state).toBe("ready");
      expect(status.tasks).toContain("assistant.chat");
      expect(status.tasks).toContain("prompt.enhance");
      expect(status.models.some((m) => m.alias === "creative-director")).toBe(true);
    });

    it("reports missing-key when no API key provided", async () => {
      const adapter = new GoogleAiAdapter("", "gemini-2.5-flash");
      const status = await adapter.status();

      expect(status.configured).toBe(false);
      expect(status.state).toBe("missing-key");
    });
  });

  describe("compileGeminiSchema()", () => {
    it("compiles standard object schemas and preserves properties and required", () => {
      const input = {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string", description: "The entity name" },
          count: { type: "integer" },
        },
        required: ["name"],
      };
      const compiled = compileGeminiSchema(input);

      expect(compiled.type).toBe("object");
      expect(compiled.properties).toHaveProperty("name");
      expect(compiled.properties).toHaveProperty("count");
      expect(compiled.required).toEqual(["name"]);
      expect(compiled).not.toHaveProperty("additionalProperties");
    });

    it("flattens allOf into parent properties and merges required arrays", () => {
      const input = {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["design", "image"] },
        },
        required: ["kind"],
        allOf: [
          {
            properties: {
              prompt: { type: "string" },
            },
            required: ["prompt"],
          },
          {
            properties: {
              steps: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        ],
      };
      const compiled = compileGeminiSchema(input);

      expect(compiled.type).toBe("object");
      expect(compiled).not.toHaveProperty("allOf");
      const props = compiled.properties as Record<string, unknown>;
      expect(props).toHaveProperty("kind");
      expect(props).toHaveProperty("prompt");
      expect(props).toHaveProperty("steps");
      expect(compiled.required).toEqual(expect.arrayContaining(["kind", "prompt"]));
    });

    it("handles array schemas with items recursively", () => {
      const input = {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
      };
      const compiled = compileGeminiSchema(input);

      expect(compiled.type).toBe("array");
      expect(compiled.items).toEqual({
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      });
    });
  });

  describe("executeChat()", () => {
    it("fails with PROVIDER_AUTH if apiKey is missing", async () => {
      const adapter = new GoogleAiAdapter("", "gemini-2.5-flash");
      const controller = new AbortController();

      await expect(
        adapter.execute({
          task: "assistant.chat",
          model: "gemini-2.5-flash",
          signal: controller.signal,
          input: { messages: [{ role: "user", content: "hello" }] },
        }),
      ).rejects.toThrowError(AiRuntimeError);
    });

    it("sends systemInstruction, converts messages, maps tools, and parses text output", async () => {
      let sentUrl = "";
      let sentBody: Record<string, unknown> = {};
      let sentHeaders: Record<string, string> = {};

      globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
        sentUrl = url;
        sentBody = JSON.parse(init.body as string);
        sentHeaders = init.headers as Record<string, string>;

        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "Hello from Gemini 2.5 Flash!" }],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            modelVersion: "gemini-2.5-flash-001",
            responseId: "resp-12345",
            usageMetadata: {
              promptTokenCount: 150,
              candidatesTokenCount: 25,
              cachedContentTokenCount: 50,
              thoughtsTokenCount: 10,
              totalTokenCount: 185,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new GoogleAiAdapter("test-gemini-key", "gemini-2.5-flash");
      const controller = new AbortController();

      const input: AiAssistantChatInput = {
        system: "You are the ArtShift Creative Director.",
        messages: [
          { role: "user", content: "Design a coffee poster" },
          { role: "assistant", content: "Here is a proposal" },
          { role: "user", content: "Make it warmer" },
        ],
        tools: [
          {
            name: "propose_creative_direction",
            description: "Propose next steps",
            inputSchema: {
              type: "object",
              properties: { kind: { type: "string" } },
              required: ["kind"],
            },
          },
        ],
      };

      const result = await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input,
      });

      expect(sentUrl).toContain("/models/gemini-2.5-flash:generateContent");
      expect(sentHeaders["x-goog-api-key"]).toBe("test-gemini-key");

      // Verify systemInstruction
      expect(sentBody.systemInstruction).toEqual({
        parts: [{ text: "You are the ArtShift Creative Director." }],
      });

      // Verify contents mapping
      const contents = sentBody.contents as Array<{ role: string; parts: Array<{ text: string }> }>;
      expect(contents).toHaveLength(3);
      expect(contents[0].role).toBe("user");
      expect(contents[0].parts[0].text).toBe("Design a coffee poster");
      expect(contents[1].role).toBe("model");
      expect(contents[1].parts[0].text).toBe("Here is a proposal");
      expect(contents[2].role).toBe("user");
      expect(contents[2].parts[0].text).toBe("Make it warmer");

      // Verify tools mapping
      expect(sentBody.tools).toEqual([
        {
          functionDeclarations: [
            {
              name: "propose_creative_direction",
              description: "Propose next steps",
              parameters: {
                type: "object",
                properties: { kind: { type: "string" } },
                required: ["kind"],
              },
            },
          ],
        },
      ]);

      // Verify output
      expect(result.output.text).toBe("Hello from Gemini 2.5 Flash!");
      expect(result.output.stopReason).toBe("end_turn");
      expect(result.output.toolCalls).toHaveLength(0);
      expect(result.output.assistantMessage.role).toBe("assistant");
      expect(result.output.assistantMessage.content).toEqual([
        { type: "text", text: "Hello from Gemini 2.5 Flash!" },
      ]);

      // Verify usage
      expect(result.usage?.inputTokens).toBe(150);
      expect(result.usage?.outputTokens).toBe(25);
      expect(result.usage?.cachedInputTokens).toBe(50);
      expect(result.usage?.reasoningTokens).toBe(10);
      expect(result.usage?.totalTokens).toBe(185);
      expect(result.model).toBe("gemini-2.5-flash-001");
      expect(result.requestId).toBe("resp-12345");
    });

    it("parses functionCall parts into toolCalls and sets stopReason to tool_use", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "I have prepared the creative direction:" },
                    {
                      functionCall: {
                        name: "propose_creative_direction",
                        args: {
                          kind: "image-task",
                          refinedPrompt: "A cozy coffee shop in warm autumn colors",
                          outputCount: 3,
                        },
                      },
                    },
                  ],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            modelVersion: "gemini-2.5-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const controller = new AbortController();

      const result = await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: {
          messages: [{ role: "user", content: "Create a coffee image" }],
        },
      });

      expect(result.output.text).toBe("I have prepared the creative direction:");
      expect(result.output.stopReason).toBe("tool_use");
      expect(result.output.toolCalls).toHaveLength(1);
      expect(result.output.toolCalls[0].name).toBe("propose_creative_direction");
      expect(result.output.toolCalls[0].input).toEqual({
        kind: "image-task",
        refinedPrompt: "A cozy coffee shop in warm autumn colors",
        outputCount: 3,
      });
    });

    it("omits internal thoughts from visible output text", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: "Thinking about lighting and color theory...", thought: true },
                    { text: "Here is your autumn-themed coffee poster plan." },
                  ],
                  role: "model",
                },
                finishReason: "STOP",
              },
            ],
            modelVersion: "gemini-2.5-flash",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const controller = new AbortController();

      const result = await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: {
          messages: [{ role: "user", content: "Plan poster" }],
        },
      });

      expect(result.output.text).toBe("Here is your autumn-themed coffee poster plan.");
      expect(result.output.text).not.toContain("Thinking about lighting");
    });

    it("maps thinking budget in generationConfig based on options.reasoning", async () => {
      let sentBody: Record<string, unknown> = {};
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        sentBody = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "Done" }] }, finishReason: "STOP" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const controller = new AbortController();

      // Test mode: off -> thinkingBudget: 0
      await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: { messages: [{ role: "user", content: "test" }] },
        options: { reasoning: { mode: "off" } },
      });
      expect(
        (sentBody.generationConfig as Record<string, unknown>).thinkingConfig,
      ).toEqual({ thinkingBudget: 0 });

      // Test mode: fixed -> thinkingBudget: 1024
      await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: { messages: [{ role: "user", content: "test" }] },
        options: { reasoning: { mode: "fixed", budgetTokens: 1024 } },
      });
      expect(
        (sentBody.generationConfig as Record<string, unknown>).thinkingConfig,
      ).toEqual({ thinkingBudget: 1024 });

      // Test mode: dynamic -> thinkingBudget: -1
      await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: { messages: [{ role: "user", content: "test" }] },
        options: { reasoning: { mode: "dynamic" } },
      });
      expect(
        (sentBody.generationConfig as Record<string, unknown>).thinkingConfig,
      ).toEqual({ thinkingBudget: -1 });
    });

    it("throws POLICY_DENIED when candidate finishReason is SAFETY", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [] },
                finishReason: "SAFETY",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const controller = new AbortController();

      await expect(
        adapter.execute({
          task: "assistant.chat",
          model: "gemini-2.5-flash",
          signal: controller.signal,
          input: { messages: [{ role: "user", content: "unsafe content" }] },
        }),
      ).rejects.toThrowError(/safety policy/i);
    });

    it("streams text deltas when onTextDelta is provided", async () => {
      const deltas: string[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain(":streamGenerateContent?alt=sse");
        const sseBody = [
          `data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}`,
          `data: {"candidates":[{"content":{"parts":[{"text":"World!"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}`,
          `data: [DONE]`,
        ].join("\n\n");

        return new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      });

      const adapter = new GoogleAiAdapter("test-key", "gemini-2.5-flash");
      const controller = new AbortController();

      const result = await adapter.execute({
        task: "assistant.chat",
        model: "gemini-2.5-flash",
        signal: controller.signal,
        input: { messages: [{ role: "user", content: "say hello" }] },
        onTextDelta: (d) => deltas.push(d),
      });

      expect(deltas).toEqual(["Hello ", "World!"]);
      expect(result.output.text).toBe("Hello World!");
      expect(result.usage?.totalTokens).toBe(15);
    });
  });
});
