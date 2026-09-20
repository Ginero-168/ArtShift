import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
const librarySource = readFileSync("components/Builder/BlockLibrary.tsx", "utf8");
const cssSource = readFileSync("components/Builder/Builder.module.css", "utf8");
const replySource = readFileSync("lib/ai/imageCompletionReply.ts", "utf8");
const presentationSource = readFileSync("lib/ai/imageResultPresentation.ts", "utf8");
const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

describe("Image Completion Summary Format", () => {
  it("defines formatImageCompletionReply via human Scene/Tone/Framing summary", () => {
    expect(replySource).toContain("function formatImageCompletionReply(");
    expect(presentationSource).toContain("function buildImageResultSummary(");
    expect(presentationSource).toContain('label: "Scene"');
    expect(presentationSource).toContain('label: "Tone"');
    expect(presentationSource).toContain('label: "Framing"');
    expect(presentationSource).toContain("ถ้าอยากให้ปรับโทน / องค์ประกอบ / รายละเอียด");
    expect(presentationSource).toContain("ถ้าอยากให้ Upscale หรือปรับโทน");
  });

  it("extracts clean subject from prompt or direction summary without clarification history leak", () => {
    expect(replySource).toContain("function extractSubject(");
    expect(replySource).toContain("cleanFromSummary");
    expect(replySource).toContain("User reply:");
    expect(replySource).toContain("Director question:");
  });

  it("uses formatImageCompletionReply in both context-aware batch run and remote turn paths", () => {
    expect(source).toContain("usedModels: turnModels.snapshot()");
    expect(source).toContain("activeModels:");
    expect(source).toContain("turnModels.using()");
    expect(source).toContain("direction.outputBriefs");
    expect(source).toMatch(/formatImageCompletionReply\(subject,\s*1,\s*briefs/);
  });

  it("renders aspect-true thumbs and structured summary in ChatThread", () => {
    expect(threadSource).toContain("ChatResultImageThumb");
    expect(threadSource).toContain("ImageResultSummaryBlock");
    expect(threadSource).toContain("Thought");
    expect(threadSource).toContain("export function ChatModelMeta(");
    expect(threadSource).toContain("chat-model-status");
    expect(threadSource).toContain("chat-model-meta");
    expect(threadSource).toContain("chat-header-model");
    expect(threadSource).not.toContain("DEFAULT_CREATING_MODEL_LABEL");
  });

  it("expands AI Assistance tab to 2x width (476px)", () => {
    expect(librarySource).toContain("styles.libraryAssistantActive");
    expect(cssSource).toContain(".libraryAssistantActive {");
    expect(cssSource).toContain("width: 476px;");
  });
});
