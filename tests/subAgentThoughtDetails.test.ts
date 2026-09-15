import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sub-Agent Thought Details & Execution Tracking", () => {
  it("verifies ChatThread defines SubAgentTaskItem and getAgentMeta with rich metadata", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    // Interface definition
    expect(threadSource).toContain("interface SubAgentTaskItem");
    expect(threadSource).toContain("modelBadge?: string;");
    expect(threadSource).toContain("task: string;");
    expect(threadSource).toContain('status: "running" | "success" | "error" | "pending";');
    expect(threadSource).toContain("statusText?: string;");

    // Agent metadata resolver
    expect(threadSource).toContain("function getAgentMeta(agent: string, title: string)");
    expect(threadSource).toContain('"Image Analyzer"');
    expect(threadSource).toContain('"Creative Director"');
    expect(threadSource).toContain('"Image Specialist"');
    expect(threadSource).toContain('"Quality Reviewer"');
    expect(threadSource).toContain('"Layout Specialist"');
    expect(threadSource).toContain('"Vector Specialist"');
  });

  it("verifies renderStatusBadge covers success, running, error, and pending with descriptive badges", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    expect(threadSource).toContain("function renderStatusBadge(");
    expect(threadSource).toContain('"เสร็จสิ้น"');
    expect(threadSource).toContain('"กำลังทำ..."');
    expect(threadSource).toContain('"ไม่สำเร็จ"');
    expect(threadSource).toContain('"รอดำเนินการ"');
    expect(threadSource).toContain("CheckIcon");
    expect(threadSource).toContain("SpinnerIcon");
  });

  it("verifies renderSubAgentPanel displays who was assigned, what task, and completion status", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    expect(threadSource).toContain("const renderSubAgentPanel = () =>");
    expect(threadSource).toContain("การสั่งงาน Sub-Agents");
    expect(threadSource).toContain("{completedCount}/{subAgentTasks.length} เสร็จสิ้น");

    // Card structure
    expect(threadSource).toContain("taskItem.icon");
    expect(threadSource).toContain("taskItem.name");
    expect(threadSource).toContain("taskItem.modelBadge");
    expect(threadSource).toContain("taskItem.task");
    expect(threadSource).toContain("renderStatusBadge(taskItem.status, taskItem.statusText)");
  });

  it("verifies CollapsibleThought supports both real-time actions and intelligent fallback defaults", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    // Action handling in CollapsibleThought
    expect(threadSource).toContain("actions?: SubAgentActionLog[];");
    expect(threadSource).toContain("const subAgentTasks = React.useMemo<SubAgentTaskItem[]>(() => {");
    expect(threadSource).toContain("if (actions && actions.length > 0) {");

    // Intelligent default items when actions not explicitly provided
    expect(threadSource).toContain("id: \"step-analyzer\"");
    expect(threadSource).toContain("id: \"step-director\"");
    expect(threadSource).toContain("id: \"step-specialist\"");
    expect(threadSource).toContain("id: \"step-reviewer\"");
    expect(threadSource).toContain("Vision Quality Gate");
  });

  it("verifies AICoPilotBar tracks sub-agent lifecycle and passes actions to liveAssistantState and history", () => {
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

    // Image Analyzer action tracking
    expect(barSource).toContain('title: "Image Analyzer (วิเคราะห์ภาพต้นฉบับ)"');
    expect(barSource).toContain("analysisAction.status = \"success\";");

    // Creative Director action tracking
    expect(barSource).toContain('title: "Creative Director (Gemini 3 Flash)"');
    expect(barSource).toContain("directorAction.status = \"success\";");

    // Image Specialist action tracking
    expect(barSource).toContain("const imageTaskAction: SubAgentActionLog = {");
    expect(barSource).toContain("imageTaskAction.status = \"success\";");

    // Quality Reviewer action tracking
    expect(barSource).toContain('title: "Quality Reviewer (ตรวจเช็คคุณภาพ)"');
    expect(barSource).toContain('status: "success"');
    expect(barSource).toContain('stage: "succeeded"');

    // Passing actions to liveAssistantState & message history
    expect(barSource).toContain("actions: [...actions]");
  });

  it("verifies Detail Score and Precision Score are evaluated, attached to action logs, and rendered on Sub-Agent cards", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

    // ChatThread interface and badge rendering
    expect(threadSource).toContain("detailScore?: number;");
    expect(threadSource).toContain("precisionScore?: number;");
    expect(threadSource).toContain("Detail: {taskItem.detailScore}/10");
    expect(threadSource).toContain("Precision: {taskItem.precisionScore}/10");

    // AICoPilotBar attaches scores and formats in description
    expect(barSource).toContain("directorAction.detailScore = direction.detailScore;");
    expect(barSource).toContain("directorAction.precisionScore = direction.precisionScore;");
    expect(barSource).toContain("Detail Score & Precision Score");
  });
});
