import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatThread, { CollapsibleThought } from "@/components/AI/ChatThread";
import type { CoPilotMessage } from "@/lib/ai/coPilot";

const assistant: CoPilotMessage = {
  id: "msg-1",
  role: "assistant",
  content: "สวัสดีครับ",
  thought: "สวัสดีครับ วันนี้ช่วยวางแนวภาพได้เลย",
  toolLabel: "google/gemini-3-flash@hidden",
  usedModels: [{ id: "google/gemini-3-flash@hidden", role: "chat" }],
  timestamp: 1,
  suggestions: ["ขอให้จัด Layout ต่อ", "ขอให้สร้าง direction ใหม่", "ใช้เครื่องมือแก้ไขเฉพาะทาง"],
};

describe("chat thread streaming UI", () => {
  afterEach(() => cleanup());

  it("keeps Copy under a director reply and does not name the model on Thought", () => {
    render(
      <ChatThread
        messages={[assistant]}
        busy={false}
        liveAssistantState={null}
        streamingText=""
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
      />,
    );

    expect(screen.getByTestId("copy-assistant-message-msg-1")).toBeTruthy();
    expect(screen.queryByTitle("คำตอบมีประโยชน์")).toBeNull();
    expect(screen.queryByTitle("คำตอบยังไม่ตรงใจ")).toBeNull();
    expect(screen.queryByText("ขอให้จัด Layout ต่อ")).toBeNull();
    expect(screen.queryByText("ขอให้สร้าง direction ใหม่")).toBeNull();
    expect(screen.queryByText("ใช้เครื่องมือแก้ไขเฉพาะทาง")).toBeNull();
    expect(screen.queryByTestId("chat-model-meta")).toBeNull();
    expect(screen.queryByText("Gemini 3 Flash")).toBeNull();
    expect(screen.queryByTitle("google/gemini-3-flash")).toBeNull();

    const thought = screen.getByTestId("thought-panel");
    expect(thought.textContent).toContain("Thought");
    expect(thought.textContent).not.toContain("Gemini");
    expect(thought.textContent).not.toContain("google/");
    expect(screen.getByTestId("thought-header").contains(screen.getByTestId("thought-rail"))).toBe(
      false,
    );
    expect(screen.getByTestId("thought-body").textContent).toContain(
      "สวัสดีครับ วันนี้ช่วยวางแนวภาพได้เลย",
    );
  });

  it("shows the image model on a generated result and hides the director model", () => {
    render(
      <ChatThread
        messages={[
          {
            id: "img-1",
            role: "assistant",
            content: "สร้างภาพให้แล้วครับ",
            thought: "แมวนั่งริมหน้าต่าง โทนอบอุ่น",
            toolLabel: "google/gemini-3-flash → openai/gpt-image-2.5-sunburst",
            usedModels: [
              { id: "google/gemini-3-flash", role: "chat" },
              { id: "openai/gpt-image-2.5-sunburst", role: "image" },
            ],
            images: [
              {
                url: "https://example.com/cat.png",
                fileId: "file-1",
                label: "แมว",
                width: 1024,
                height: 1024,
              },
            ],
            timestamp: 2,
          },
        ]}
        busy={false}
        liveAssistantState={null}
        streamingText=""
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
      />,
    );

    const chip = screen.getByTestId("chat-model-meta");
    expect(chip.textContent).toContain("GPT Image 2.5 Sunburst");
    expect(chip.textContent).not.toContain("Gemini");
    expect(chip.getAttribute("title")).toBe("openai/gpt-image-2.5-sunburst");
    const thought = screen.getByTestId("thought-panel");
    expect(thought.textContent).not.toContain("Gemini");
    expect(thought.textContent).not.toContain("GPT Image");
    expect(screen.getByTestId("copy-assistant-message-img-1")).toBeTruthy();
  });

  it("hides the model chip while the director is thinking and shows it only when generating", async () => {
    const { rerender } = render(
      <ChatThread
        messages={[]}
        busy
        liveAssistantState={{
          stage: "planning",
          thought: "กำลังดูโจทย์",
          toolLabel: "google/gemini-3-flash",
          statusMessage: "Creative Director กำลังวางแผนงาน...",
          activeModels: [{ id: "google/gemini-3-flash", role: "chat" }],
        }}
        streamingText=""
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
      />,
    );

    expect(screen.queryByTestId("chat-model-status")).toBeNull();
    expect(screen.getByTestId("thought-panel").textContent).not.toContain("Gemini");
    await waitFor(() => {
      expect(screen.getByTestId("thought-body").textContent).toContain("กำลังดูโจทย์");
    });

    rerender(
      <ChatThread
        messages={[]}
        busy
        liveAssistantState={{
          stage: "generating",
          thought: "แมวนั่งริมหน้าต่าง",
          toolLabel: "google/gemini-3-flash → openai/gpt-image-2.5-sunburst",
          statusMessage: "กำลังสร้างรูปภาพด้วย GPT Image 2.5 Sunburst...",
          activeModels: [
            { id: "google/gemini-3-flash", role: "chat" },
            { id: "openai/gpt-image-2.5-sunburst", role: "image" },
          ],
        }}
        streamingText=""
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
      />,
    );

    const liveChip = screen.getByTestId("chat-model-status");
    expect(liveChip.textContent).toContain("GPT Image 2.5 Sunburst");
    expect(liveChip.textContent).not.toContain("Gemini");
    expect(screen.getByText("กำลังสร้างรูปภาพด้วย GPT Image 2.5 Sunburst...")).toBeTruthy();
  });

  it("shows growing director text in the live Thought body instead of the canned rotator", async () => {
    const { rerender } = render(
      <CollapsibleThought
        thought="สวัสดี"
        isLive
        stage="planning"
        statusMessage="กำลังเข้าใจคำสั่งและวางแผนจนจบงาน..."
        toolLabel="google/gemini-3-flash"
      />,
    );

    const header = screen.getByTestId("thought-header");
    const body = screen.getByTestId("thought-body");
    const rail = screen.getByTestId("thought-rail");
    expect(header.querySelector('[data-testid="thought-icon"] svg')).toBeTruthy();
    expect(header.textContent).toContain("Thought");
    expect(header.textContent).not.toContain("gemini");
    expect(header.textContent).not.toContain("google/");
    expect(body.textContent).not.toContain("gemini");
    expect(header.contains(body)).toBe(false);
    expect(header.contains(rail)).toBe(false);
    expect(screen.getByTestId("thought-stream").contains(rail)).toBe(true);
    expect(screen.getByTestId("thought-stream").contains(body)).toBe(true);
    await waitFor(() => {
      expect(body.textContent).toContain("สวัสดี");
    });
    expect(body.textContent).not.toContain("กำลังเข้าใจคำสั่งและวางแผนจนจบงาน...");
    expect(screen.queryByText("กำลังอ่านคำขอ...")).toBeNull();
    expect(screen.queryByText("กำลังคิดแนวทางสร้างภาพให้ตรงคำขอ...")).toBeNull();

    rerender(
      <CollapsibleThought
        thought="สวัสดีครับ กำลังดูโจทย์"
        isLive
        stage="planning"
        statusMessage="กำลังเข้าใจคำสั่งและวางแผนจนจบงาน..."
        toolLabel="google/gemini-3-flash"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("thought-body").textContent).toContain("สวัสดีครับ กำลังดูโจทย์");
    });
    expect(screen.queryByText("กำลังเข้าใจคำสั่งและวางแผนจนจบงาน...")).toBeNull();
  });

  it("keeps an image-generation status instead of pretending pixels are tokens", async () => {
    render(
      <CollapsibleThought
        thought="แมวนั่งริมหน้าต่าง โทนอบอุ่น"
        isLive
        stage="generating"
        statusMessage="กำลังสร้างรูปภาพด้วย Gemini 3 Flash..."
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("แมวนั่งริมหน้าต่าง โทนอบอุ่น")).toBeTruthy();
    });
    expect(screen.getByText("กำลังสร้างรูปภาพด้วย Gemini 3 Flash...")).toBeTruthy();
  });

  it("types the reply in the bubble and keeps Thought on a short status", async () => {
    render(
      <ChatThread
        messages={[]}
        busy
        liveAssistantState={{
          stage: "planning",
          thought: "กำลังอ่านคำขอ",
          statusMessage: "กำลังอ่านคำขอ",
        }}
        streamingText="โทนครีมใช้ได้"
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-stream-bubble").textContent).toBe("โทนครีมใช้ได้");
    });
    expect(screen.getByTestId("thought-body").textContent).toContain("กำลังอ่านคำขอ");
    expect(screen.getByTestId("thought-body").textContent).not.toContain("โทนครีม");
  });

  it("sends a lettered choice and opens the composer for Other", () => {
    const onChooseChoice = vi.fn();
    const reply = [
      "ไม่ทราบว่าวันนี้คุณอยากให้ผมช่วยเรื่องไหนดีครับ?",
      "",
      "A) สร้างรูปภาพใหม่ตามไอเดียของคุณ",
      "Other) อื่นๆ (สามารถพิมพ์บอกสิ่งที่ต้องการได้เลยครับ)",
    ].join("\n");
    render(
      <ChatThread
        messages={[
          {
            id: "ask-1",
            role: "assistant",
            content: reply,
            timestamp: 3,
          },
        ]}
        busy={false}
        liveAssistantState={null}
        streamingText=""
        currentActions={[]}
        scrollRef={{ current: null }}
        onSelectCanvasImage={() => undefined}
        onClearHistory={() => undefined}
        onChooseChoice={onChooseChoice}
      />,
    );

    expect(screen.getByText("ไม่ทราบว่าวันนี้คุณอยากให้ผมช่วยเรื่องไหนดีครับ?")).toBeTruthy();
    expect(screen.queryByText("A) สร้างรูปภาพใหม่ตามไอเดียของคุณ")).toBeNull();
    expect(screen.getByTestId("chat-choice-ask-1-A").textContent).toContain("A");
    expect(screen.getByTestId("chat-choice-ask-1-D").textContent).toContain("พิมพ์คำตอบเอง");
    fireEvent.click(screen.getByTestId("chat-choice-ask-1-A"));
    fireEvent.click(screen.getByTestId("chat-choice-ask-1-D"));
    expect(onChooseChoice.mock.calls.map((call) => call[0])).toEqual([
      { key: "A", label: "สร้างรูปภาพใหม่ตามไอเดียของคุณ", action: "send" },
      { key: "D", label: "พิมพ์คำตอบเอง", action: "compose" },
    ]);
  });
});
