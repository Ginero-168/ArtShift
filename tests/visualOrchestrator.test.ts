import { describe, expect, it } from "vitest";
import {
  planVisualRequest,
  resolveVisualCapability,
  VISUAL_CAPABILITY_REGISTRY,
} from "@/lib/ai/visualOrchestrator";

describe("Visual Orchestrator Kernel", () => {
  it("defers short image requests to the Director", () => {
    const plan = planVisualRequest("ขอภาพแมว", {
      hasSelection: false,
      elementCount: 0,
    });

    expect(plan).toMatchObject({
      intent: "generation",
      route: "orchestrator",
      requiresApproval: true,
    });
    expect(plan.clarification).toBeUndefined();
  });

  it("defers vague requests rather than inventing a question", () => {
    const plan = planVisualRequest("สร้างรูป", { hasSelection: false, elementCount: 0 });

    expect(plan).toMatchObject({
      intent: "generation",
      route: "orchestrator",
      requiresApproval: true,
    });
    expect(plan.clarification).toBeUndefined();
  });

  it("routes complex text work through the current image generation alias with high-quality policy", () => {
    const plan = planVisualRequest("สร้างโปสเตอร์หนังสือ 3 แบบ พร้อมข้อความภาษาไทย", {
      hasSelection: false,
      elementCount: 0,
    });

    expect(plan).toMatchObject({
      taskClass: "complex",
      capabilityAlias: "IMAGE_DEFAULT",
      route: "direct",
      capabilityAvailable: true,
      requiresApproval: false,
      needsVisualAnalysis: false,
    });
  });

  it("routes reference-conditioned edits through the available IMAGE_EDIT contract", () => {
    const plan = planVisualRequest("เปลี่ยนพื้นหลังของรูปนี้จาก reference", {
      hasSelection: true,
      selectedObjectCount: 1,
      elementCount: 4,
      hasImageAsset: true,
      hasReference: true,
    });

    expect(plan).toMatchObject({
      capabilityAlias: "IMAGE_EDIT",
      route: "direct",
      capabilityAvailable: true,
      modelAlias: "image-gpt-2",
      needsVisualAnalysis: true,
      requiresApproval: false,
    });
  });

  it("keeps the registry capability-based and exposes only the current wired alias as available", () => {
    expect(resolveVisualCapability("IMAGE_DEFAULT")).toMatchObject({
      alias: "IMAGE_DEFAULT",
      execution: "image.generate",
      modelAlias: "image-gpt-2",
      available: true,
    });
    expect(resolveVisualCapability("IMAGE_PRO").available).toBe(false);
    expect(Object.keys(VISUAL_CAPABILITY_REGISTRY)).toEqual(
      expect.arrayContaining([
        "ORCHESTRATOR_DEFAULT",
        "VISION_DEFAULT",
        "IMAGE_DEFAULT",
        "IMAGE_FAST",
        "IMAGE_PRO",
        "IMAGE_EDIT",
        "IMAGE_TEXT",
        "IMAGE_VECTOR",
        "IMAGE_CREATIVE",
      ]),
    );
  });
});
