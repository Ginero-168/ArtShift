import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");
const librarySource = readFileSync("components/Builder/BlockLibrary.tsx", "utf8");
const cssSource = readFileSync("components/Builder/Builder.module.css", "utf8");

describe("Image Completion Summary Format", () => {
  it("defines formatImageCompletionReply with bullet points and friendly closing", () => {
    expect(source).toContain("function formatImageCompletionReply(");
    expect(source).toContain("เสร็จแล้ว ${count} รูปค่ะ");
    expect(source).toContain("• รูปที่ ${idx + 1}: ${cleanBrief");
    expect(source).toContain("ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ");
  });

  it("extracts clean subject from prompt or direction summary without clarification history leak", () => {
    expect(source).toContain("function extractSubject(");
    expect(source).toContain("cleanFromSummary");
    expect(source).toContain("User reply:");
    expect(source).toContain("Director question:");
  });

  it("uses formatImageCompletionReply in both context-aware batch run and remote turn paths", () => {
    expect(source).toMatch(/runResult\.completedCount,\s*direction\.outputBriefs/);
    expect(source).toMatch(/formatImageCompletionReply\(subject,\s*1,\s*briefs\)/);
  });

  it("expands AI Assistance tab to 2x width (476px)", () => {
    expect(librarySource).toContain("styles.libraryAssistantActive");
    expect(cssSource).toContain(".libraryAssistantActive {");
    expect(cssSource).toContain("width: 476px;");
  });
});
