import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sub-Agent Execution Details in Thinking Drawer (CollapsibleThought)", () => {
  it("verifies ChatThread defines Sub-Agent task metadata and status renderer", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    // Sub-Agent Task Data structure & helper functions
    expect(threadSource).toContain("interface SubAgentTaskItem");
    expect(threadSource).toContain("function getAgentMeta");
    expect(threadSource).toContain("function renderStatusBadge");

    // Sub-Agent Role and Model mapping
    expect(threadSource).toContain("Image Analyzer");
    expect(threadSource).toContain("Creative Director");
    expect(threadSource).toContain("Image Specialist");
    expect(threadSource).toContain("Quality Reviewer");
    expect(threadSource).toContain("Layout Specialist");

    // Sub-Agent Status Badges
    expect(threadSource).toContain("เสร็จสิ้น");
    expect(threadSource).toContain("กำลังทำ...");
    expect(threadSource).toContain("รอดำเนินการ");
    expect(threadSource).toContain("ไม่สำเร็จ");

    // Sub-Agent Header & Container
    expect(threadSource).toContain("การสั่งงาน Sub-Agents");
    expect(threadSource).toContain("renderSubAgentPanel");
  });

  it("verifies CollapsibleThought receives actions and toolLabel props", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    // CollapsibleThought signature
    expect(threadSource).toContain("actions?: SubAgentActionLog[];");
    expect(threadSource).toContain("toolLabel?: string;");

    // Both historical and live invocations pass actions and toolLabel
    expect(threadSource).toContain("actions={msg.actions}");
    expect(threadSource).toContain("toolLabel={msg.toolLabel}");
    expect(threadSource).toContain("actions={liveAssistantState.actions || currentActions}");
    expect(threadSource).toContain("toolLabel={liveAssistantState.toolLabel}");
  });

  it("verifies AICoPilotBar tracks distinct Sub-Agent lifecycle (Analyzer, Director, Image Specialist, Reviewer)", () => {
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

    // Distinct Sub-Agents tracked
    expect(barSource).toContain("Image Analyzer (วิเคราะห์ภาพต้นฉบับ)");
    expect(barSource).toContain("Creative Director (gpt-oss-120b)");
    expect(barSource).toContain("Quality Reviewer (ตรวจเช็คคุณภาพ)");

    // Actions passed to liveAssistantState
    expect(barSource).toContain("actions: [...actions]");
    expect(barSource).toContain("actions: [analysisAction]");
  });
});
