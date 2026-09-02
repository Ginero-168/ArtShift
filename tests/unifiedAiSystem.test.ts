import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
    [{ hasLocalPlan: true, specialized: true }, "local-plan"],
    [{ hasLocalPlan: true, specialized: false }, "local-plan"],
    [{ hasLocalPlan: false, specialized: true }, "local-tool"],
    [{ hasLocalPlan: false, specialized: false }, "design-agent"],
  ] as const)("routes %j to %s", (input, expected: UnifiedPromptRoute) => {
    expect(routeUnifiedPrompt(input)).toBe(expected);
  });

  it("keeps the live chat surface free of legacy execution-mode controls", () => {
    const chatSource = readFileSync(join(process.cwd(), "components/AI/AICoPilotBar.tsx"), "utf8");
    const storeSource = readFileSync(join(process.cwd(), "lib/engine/store.ts"), "utf8");

    expect(chatSource).toContain("routeUnifiedPrompt");
    expect(chatSource).not.toContain("AI_MODE_CONFIG");
    expect(chatSource).not.toContain('role="radiogroup"');
    expect(chatSource).not.toMatch(/\b(?:Eco|Fast)\b/);
    expect(storeSource).not.toContain("rasterExecutionMode");
  });
});
