import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Sub-Agent Thought Details & Execution Tracking", () => {
  it("keeps Thought UI human and minimal without sub-agent score charts", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    expect(threadSource).toContain("DEFAULT_CLOUD_VISION_LABEL");
    expect(threadSource).toContain("DEFAULT_CREATING_MODEL_LABEL");
    expect(threadSource).toContain(">Thought</span>");
    expect(threadSource).not.toContain("การสั่งงาน Sub-Agents");
    expect(threadSource).not.toContain("Detail: {taskItem.detailScore}");
    expect(threadSource).not.toContain("Precision: {taskItem.precisionScore}");
  });

  it("tracks sub-agent lifecycle in AICoPilotBar for internal orchestration", () => {
    const barSource = readFileSync("components/AI/AICoPilotBar.tsx", "utf8");

    expect(barSource).toContain("Image Analyzer");
    expect(barSource).toContain("DEFAULT_CLOUD_VISION_LABEL");
    expect(barSource).toContain('analysisAction.status = "success";');
    expect(barSource).toContain("Creative Director (");
    expect(barSource).toContain("directorModelStep().id");
    expect(barSource).toContain('directorAction.status = "success";');
    expect(barSource).toContain("const imageTaskAction: SubAgentActionLog = {");
    expect(barSource).toContain("formatThoughtText");
    expect(barSource).toContain("buildImageCompletionSummary");
  });

  it("exposes expand + prompt-structure controls on result thumbs", () => {
    const resultSource = readFileSync("components/AI/ChatImageResult.tsx", "utf8");
    expect(resultSource).toContain("ChatResultImageThumb");
    expect(resultSource).toContain("ImageExpandOverlay");
    expect(resultSource).toContain("PromptStructureModal");
    expect(resultSource).toContain("How I created this");
    expect(resultSource).toContain("ขยายรูป");
    expect(resultSource).toContain("โครงสร้าง Prompt");
  });
});
