import { describe, expect, it } from "vitest";
import { isToolCoPilotPrompt } from "@/lib/ai/coPilot";
import {
  routeUnifiedPrompt,
  UNIFIED_AI_SYSTEM,
  type UnifiedPromptRoute,
} from "@/lib/ai/unifiedSystem";
import { planVisualRequest } from "@/lib/ai/visualOrchestrator";

describe("unified AI system", () => {
  it("exposes one user-facing assistant without selectable execution modes", () => {
    expect(UNIFIED_AI_SYSTEM).toMatchObject({
      label: "AI Assistance",
      userSelectableModes: false,
      localFirst: true,
      harnessVersion: "2.2",
      harnessRuleIds: expect.arrayContaining(["REFERENCE_ANALYSIS", "QUALITY_GATE"]),
    });
    expect(UNIFIED_AI_SYSTEM.description).toContain("automatically");
  });

  it.each([
    [{ hasLocalPlan: true, hasToolCommand: true }, "local-plan"],
    [{ hasLocalPlan: true, hasToolCommand: false }, "local-plan"],
    [{ hasLocalPlan: false, hasToolCommand: true }, "tool-command"],
    [{ hasLocalPlan: false, hasToolCommand: false }, "design-agent"],
  ] as const)("routes %j to %s", (input, expected: UnifiedPromptRoute) => {
    expect(routeUnifiedPrompt(input)).toBe(expected);
  });

  it("routes image generation to the Director-first tool path even when visual planning calls it complex", () => {
    const visualPlan = planVisualRequest("สร้างรูปหมู 3 รูป ต่างสีกัน", {
      hasSelection: false,
      elementCount: 0,
    });

    expect(
      routeUnifiedPrompt({
        hasLocalPlan: false,
        hasToolCommand: true,
        isImageGeneration: true,
        visualPlan,
      }),
    ).toBe("tool-command");
  });

  it("prioritizes Director-first image routing over a coincidental local edit plan", () => {
    const visualPlan = planVisualRequest("สร้างรูปหมู 3 รูป ต่างสีกัน", {
      hasSelection: true,
      elementCount: 2,
    });

    expect(
      routeUnifiedPrompt({
        hasLocalPlan: true,
        hasToolCommand: true,
        isImageGeneration: true,
        visualPlan,
      }),
    ).toBe("tool-command");
  });

  it("keeps complex non-image visual plans on the Design Agent path", () => {
    const visualPlan = planVisualRequest("วางแผนโปสเตอร์หนังสือ 3 แบบ พร้อมข้อความภาษาไทย", {
      hasSelection: false,
      elementCount: 0,
    });

    expect(
      routeUnifiedPrompt({
        hasLocalPlan: false,
        hasToolCommand: true,
        isImageGeneration: false,
        visualPlan,
      }),
    ).toBe("design-agent");
  });

  it("keeps deterministic layout requests on the built-in tool path", () => {
    expect(isToolCoPilotPrompt("จัด Layout สไลด์นี้แบบ 60-30-10")).toBe(true);
    expect(isToolCoPilotPrompt("ออกแบบแคมเปญใหม่จาก reference")).toBe(false);
  });

  it("keeps one local-first policy with no selectable mode", () => {
    expect(UNIFIED_AI_SYSTEM.localFirst).toBe(true);
    expect(UNIFIED_AI_SYSTEM.userSelectableModes).toBe(false);
  });
});
