import { describe, expect, it } from "vitest";
import { isToolCoPilotPrompt } from "@/lib/ai/coPilot";
import {
  routeUnifiedPrompt,
  UNIFIED_AI_SYSTEM,
  type UnifiedPromptRoute,
} from "@/lib/ai/unifiedSystem";

describe("unified AI system", () => {
  it("exposes one user-facing assistant without selectable execution modes", () => {
    expect(UNIFIED_AI_SYSTEM).toMatchObject({
      label: "AI Assistance",
      userSelectableModes: false,
      localFirst: true,
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

  it("keeps deterministic layout requests on the built-in tool path", () => {
    expect(isToolCoPilotPrompt("จัด Layout สไลด์นี้แบบ 60-30-10")).toBe(true);
    expect(isToolCoPilotPrompt("ออกแบบแคมเปญใหม่จาก reference")).toBe(false);
  });

  it("keeps one local-first policy with no selectable mode", () => {
    expect(UNIFIED_AI_SYSTEM.localFirst).toBe(true);
    expect(UNIFIED_AI_SYSTEM.userSelectableModes).toBe(false);
  });
});
