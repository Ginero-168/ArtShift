import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

describe("Image Completion Summary Format", () => {
  it("defines formatImageCompletionReply with bullet points and friendly closing", () => {
    expect(source).toContain("function formatImageCompletionReply(");
    expect(source).toContain("เสร็จแล้ว ${count} รูปค่ะ");
    expect(source).toContain("• รูปที่ ${idx + 1}: ${cleanBrief");
    expect(source).toContain("ถ้าอยากให้ปรับสไตล์ ท่าทาง หรือสีสันเพิ่มเติม บอกได้เลยนะคะ");
  });

  it("extracts clean subject from prompt or direction summary", () => {
    expect(source).toContain("function extractSubject(");
    expect(source).toContain("cleanFromSummary");
  });

  it("uses formatImageCompletionReply in both context-aware batch run and remote turn paths", () => {
    expect(source).toMatch(/runResult\.completedCount,\s*direction\.outputBriefs/);
    expect(source).toMatch(/formatImageCompletionReply\(subject,\s*1,\s*briefs\)/);
  });
});
