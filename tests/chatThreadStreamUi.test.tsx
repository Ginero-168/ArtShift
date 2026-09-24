import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

  it("keeps only Copy under an assistant message and shows a readable model name", () => {
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

    const chip = screen.getByTestId("chat-model-meta");
    expect(chip.textContent).toContain("Gemini 3 Flash");
    expect(chip.textContent).not.toContain("google/");
    expect(chip.textContent).not.toContain("@hidden");
    expect(chip.getAttribute("title")).toBe("google/gemini-3-flash");
    expect(screen.getByText("สวัสดีครับ วันนี้ช่วยวางแนวภาพได้เลย")).toBeTruthy();
  });

  it("shows growing director text in the live Thought body instead of the canned rotator", () => {
    render(
      <CollapsibleThought
        thought="สวัสดีครับ กำลังดูโจทย์"
        isLive
        stage="planning"
        statusMessage="กำลังเข้าใจคำสั่งและวางแผนจนจบงาน..."
        toolLabel="google/gemini-3-flash"
      />,
    );

    expect(screen.getByText("สวัสดีครับ กำลังดูโจทย์")).toBeTruthy();
    expect(screen.queryByText("กำลังอ่านคำขอ...")).toBeNull();
    expect(screen.queryByText("กำลังคิดแนวทางสร้างภาพให้ตรงคำขอ...")).toBeNull();
    expect(screen.queryByText("กำลังเข้าใจคำสั่งและวางแผนจนจบงาน...")).toBeNull();
  });

  it("keeps an image-generation status instead of pretending pixels are tokens", () => {
    render(
      <CollapsibleThought
        thought="แมวนั่งริมหน้าต่าง โทนอบอุ่น"
        isLive
        stage="generating"
        statusMessage="กำลังสร้างรูปภาพด้วย Gemini 3 Flash..."
      />,
    );

    expect(screen.getByText("แมวนั่งริมหน้าต่าง โทนอบอุ่น")).toBeTruthy();
    expect(screen.getByText("กำลังสร้างรูปภาพด้วย Gemini 3 Flash...")).toBeTruthy();
  });
});
