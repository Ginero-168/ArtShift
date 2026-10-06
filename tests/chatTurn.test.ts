import { describe, expect, it } from "vitest";
import { chatActFromDirection } from "@/lib/ai/orchestration/chatTurn";

describe("chat turn", () => {
  it("keeps a sentence, a question, and an image as three different acts", () => {
    expect(chatActFromDirection({ kind: "answer", text: "โทนครีมใช้ได้" })).toEqual({
      act: "say",
      text: "โทนครีมใช้ได้",
    });
    expect(
      chatActFromDirection({
        kind: "clarification",
        question: "โปรโมทอะไรเป็นหลัก",
        options: ["กาแฟ", "หนังสือ"],
      }),
    ).toEqual({
      act: "ask",
      text: "โปรโมทอะไรเป็นหลัก",
      options: ["กาแฟ", "หนังสือ"],
    });
    expect(chatActFromDirection({ kind: "image-task" })).toEqual({ act: "make" });
  });

  it("applies one canvas plan and refuses a multi-step plan", () => {
    const proposal = {
      protocolVersion: 1 as const,
      planId: "p1",
      executionToken: "t1",
      baseRevision: 1,
      summary: "แก้หัวเรื่อง",
      commands: [],
      estimatedRemoteCostUsd: 0,
      requiresApproval: true,
    };
    expect(chatActFromDirection({ kind: "design-plan", proposal })).toEqual({
      act: "apply",
      proposal,
    });
    expect(chatActFromDirection({ kind: "sequential-plan" })).toEqual({
      act: "stuck",
      text: "บอกสิ่งที่ต้องการเป็นคำสั่งเดียวได้เลย แชทนี้ไม่เปิดแผนหลายขั้น",
    });
  });
});
