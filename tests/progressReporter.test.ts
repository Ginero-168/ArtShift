import { describe, expect, it } from "vitest";
import { reportAIResult, subscribeAIProgress } from "@/lib/ai/progressReporter";

describe("AI Assistance activity reporter", () => {
  it("publishes a tool result for rendering as an assistant chat message", () => {
    const events: Parameters<Parameters<typeof subscribeAIProgress>[0]>[0][] = [];
    const unsubscribe = subscribeAIProgress((event) => events.push(event));

    reportAIResult({
      taskId: "explain-1",
      operation: "Explain Image",
      message: "Detailed explanation",
      timestamp: 123,
    });
    unsubscribe();

    expect(events).toEqual([
      {
        taskId: "explain-1",
        operation: "Explain Image",
        stage: "result",
        message: "Detailed explanation",
        status: "success",
        presentation: "result",
        progress: 100,
        timestamp: 123,
      },
    ]);
  });
});
