import { describe, expect, it } from "vitest";
import {
  type PlanProposal,
  parseAgentEvent,
  parsePlanProposal,
  requirePlanApproval,
} from "@/lib/designAgent/contracts";
import { classifyDesignIntent, getExecutionPolicy } from "@/lib/designAgent/policy";
import { prepareDesignTurn } from "@/lib/designAgent/server";

const proposal: PlanProposal = {
  protocolVersion: 1,
  planId: "plan-1",
  executionToken: "token-1",
  baseRevision: 100,
  summary: "เปลี่ยนหัวข้อและสีให้เข้ากับงาน",
  commands: [
    {
      id: "command-1",
      kind: "update",
      target: {
        docId: "doc-1",
        artworkId: "artwork-1",
        objectId: "title-1",
        elementVersion: 1,
        baseRevision: 100,
      },
      patch: { text: "ข้อความจริง 299 บาท", backgroundColor: "#123456" },
    },
  ],
  estimatedRemoteCostUsd: 0,
  requiresApproval: false,
};

describe("Design Agent contracts", () => {
  it("parses a valid proposal without changing exact user content", () => {
    const result = parsePlanProposal(proposal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.commands[0]).toEqual(proposal.commands[0]);
    expect(result.value.summary).toBe(proposal.summary);
  });

  it("rejects malformed and oversized proposals", () => {
    expect(parsePlanProposal({ ...proposal, commands: [] }).ok).toBe(false);
    expect(parsePlanProposal({ ...proposal, summary: "x".repeat(20_001) }).ok).toBe(false);
    expect(
      parsePlanProposal({
        ...proposal,
        commands: [{ ...proposal.commands[0], kind: "unknown" }],
      }).ok,
    ).toBe(false);
  });

  it("accepts editable insertion commands with bounded geometry", () => {
    const result = parsePlanProposal({
      ...proposal,
      commands: [
        {
          id: "insert-1",
          kind: "insert_text",
          target: { docId: "doc-1", artworkId: "artwork-1", layerId: "layer-1", baseRevision: 100 },
          payload: { text: "Headline", x: 10, y: 20, width: 300, height: 80 },
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("forces every remote proposal through the review step", () => {
    expect(requirePlanApproval(proposal).requiresApproval).toBe(true);
  });

  it("parses only allowlisted agent event types", () => {
    const events: unknown[] = [
      { protocolVersion: 1, type: "text", delta: "hello" },
      { protocolVersion: 1, type: "question", id: "q1", text: "เลือกแบบไหน" },
      { protocolVersion: 1, type: "proposal", proposal },
      { protocolVersion: 1, type: "done" },
    ];
    for (const event of events) {
      const result = parseAgentEvent(event);
      expect(result.ok).toBe(true);
    }
    expect(parseAgentEvent({ protocolVersion: 1, type: "mutation", input: {} }).ok).toBe(false);
  });
});

describe("Design Agent policy", () => {
  it("classifies a no-key request before attempting remote execution", async () => {
    const result = await prepareDesignTurn(
      [{ role: "user", content: "อธิบายความแตกต่างระหว่าง Fill กับ Stroke" }],
      {
        docId: "doc-1",
        baseRevision: 100,
        artworkId: "artwork-1",
        artworkWidth: 1080,
        artworkHeight: 1080,
        hasSelection: false,
        selectedObjectIds: [],
        snapshot: {},
      },
    );
    expect(result).toMatchObject({ type: "text" });
    expect(result.type === "text" ? result.text : "").toContain("AI Provider Settings");
  });

  it("keeps exact deterministic edits local and does not require analysis", () => {
    expect(classifyDesignIntent("เปลี่ยนข้อความนี้เป็น Summer Sale", true)).toBe("local-edit");
    expect(getExecutionPolicy("เปลี่ยนสีเป็น #ff0000", true)).toMatchObject({
      kind: "local-edit",
      requiresApproval: false,
      needsVisualAnalysis: false,
    });
  });

  it("requires a reviewed plan for multi-step design work", () => {
    expect(classifyDesignIntent("ออกแบบโปสเตอร์ 3 แบบพร้อม 3 ขนาด", false)).toBe("complex-design");
    expect(getExecutionPolicy("สร้างดีไซน์ใหม่จาก reference image", false)).toMatchObject({
      kind: "complex-design",
      requiresApproval: true,
      needsVisualAnalysis: true,
    });
  });

  it("flags destructive operations and vague prompts", () => {
    expect(getExecutionPolicy("ลบ Object ที่เลือก", true)).toMatchObject({
      kind: "destructive",
      requiresApproval: true,
    });
    expect(getExecutionPolicy("สร้างรูป", false).kind).toBe("clarification");
  });
});
