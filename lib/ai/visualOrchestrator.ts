import type { DesignIntentKind } from "@/lib/designAgent/policy";
import { classifyDesignIntent } from "@/lib/designAgent/policy";
import { cleanImagePrompt, isImageGenerationPrompt } from "./imageGeneration";
import { assessImageIntent } from "./orchestration/intentCompleteness";

export type VisualTaskClass = "simple" | "complex";
export type VisualRoute = "direct" | "orchestrator" | "clarify";
export type VisualCapabilityAlias =
  | "ORCHESTRATOR_DEFAULT"
  | "ORCHESTRATOR_MAX"
  | "VISION_DEFAULT"
  | "IMAGE_DEFAULT"
  | "IMAGE_FAST"
  | "IMAGE_PRO"
  | "IMAGE_EDIT"
  | "IMAGE_TEXT"
  | "IMAGE_VECTOR"
  | "IMAGE_CREATIVE";
export type VisualExecution =
  | "answer"
  | "local-edit"
  | "vision.analyze"
  | "image.generate"
  | "design-agent";

export type VisualContext = {
  hasSelection: boolean;
  selectedObjectCount?: number;
  elementCount?: number;
  hasReference?: boolean;
  hasImageAsset?: boolean;
};

export type VisualCapabilityRoute = {
  alias: VisualCapabilityAlias;
  execution: VisualExecution;
  modelAlias?: string;
  available: boolean;
  reason: string;
};

export type VisualRoutePlan = {
  prompt: string;
  intent: DesignIntentKind;
  taskClass: VisualTaskClass;
  capabilityAlias: VisualCapabilityAlias;
  route: VisualRoute;
  capabilityAvailable: boolean;
  modelAlias?: string;
  requiresApproval: boolean;
  needsVisualAnalysis: boolean;
  reason: string;
  clarification?: string;
};

export const VISUAL_CAPABILITY_REGISTRY: Readonly<
  Record<VisualCapabilityAlias, VisualCapabilityRoute>
> = Object.freeze({
  ORCHESTRATOR_DEFAULT: {
    alias: "ORCHESTRATOR_DEFAULT",
    execution: "design-agent",
    available: true,
    reason: "Use the standard reviewable Design Agent preparation path.",
  },
  ORCHESTRATOR_MAX: {
    alias: "ORCHESTRATOR_MAX",
    execution: "design-agent",
    available: true,
    reason: "Reserved for coordinated multi-output or repeated planning failures.",
  },
  VISION_DEFAULT: {
    alias: "VISION_DEFAULT",
    execution: "vision.analyze",
    available: false,
    reason: "A dedicated visual-analysis transport is not wired into the chat kernel yet.",
  },
  IMAGE_DEFAULT: {
    alias: "IMAGE_DEFAULT",
    execution: "image.generate",
    modelAlias: "image-gpt-2",
    available: true,
    reason: "Current general image generation route is available through the server alias.",
  },
  IMAGE_FAST: {
    alias: "IMAGE_FAST",
    execution: "image.generate",
    available: false,
    reason: "No separate fast image adapter is wired into ArtShift yet.",
  },
  IMAGE_PRO: {
    alias: "IMAGE_PRO",
    execution: "image.generate",
    available: false,
    reason: "No separate professional image adapter is wired into ArtShift yet.",
  },
  IMAGE_EDIT: {
    alias: "IMAGE_EDIT",
    execution: "image.generate",
    modelAlias: "image-gpt-2",
    available: true,
    reason:
      "Reference-conditioned generation is available through the server image route with bounded input images.",
  },
  IMAGE_TEXT: {
    alias: "IMAGE_TEXT",
    execution: "image.generate",
    available: false,
    reason: "A dedicated typography model is not wired into ArtShift yet.",
  },
  IMAGE_VECTOR: {
    alias: "IMAGE_VECTOR",
    execution: "image.generate",
    available: false,
    reason: "The current generation route does not produce vector output.",
  },
  IMAGE_CREATIVE: {
    alias: "IMAGE_CREATIVE",
    execution: "image.generate",
    available: false,
    reason: "A dedicated creative image adapter is not wired into ArtShift yet.",
  },
});

export function resolveVisualCapability(alias: VisualCapabilityAlias): VisualCapabilityRoute {
  return VISUAL_CAPABILITY_REGISTRY[alias];
}

export function planVisualRequest(
  prompt: string,
  context: VisualContext = { hasSelection: false },
): VisualRoutePlan {
  const normalizedPrompt = prompt.trim();
  const imageRequest = isImageGenerationPrompt(normalizedPrompt);
  const intent = imageRequest
    ? ("generation" as const)
    : classifyDesignIntent(normalizedPrompt, context.hasSelection);
  const hasReference =
    context.hasReference === true ||
    /\b(?:reference|จากรูป|จากภาพ|รูปนี้|ภาพนี้|ref)\b/i.test(normalizedPrompt);
  const taskClass = classifyTaskClass(normalizedPrompt, intent, hasReference);
  const needsVisualAnalysis =
    hasReference ||
    context.hasImageAsset === true ||
    (context.hasSelection && intent !== "generation");

  const imageAssessment = imageRequest
    ? assessImageIntent({
        prompt: normalizedPrompt,
        analyses: [],
        hasSelection: context.hasSelection,
      })
    : undefined;
  if (
    intent === "clarification" ||
    (imageRequest &&
      (!cleanImagePrompt(normalizedPrompt) || imageAssessment?.kind === "clarification"))
  ) {
    return {
      prompt: normalizedPrompt,
      intent: "clarification",
      taskClass: "simple",
      capabilityAlias: "ORCHESTRATOR_DEFAULT",
      route: "clarify",
      capabilityAvailable: true,
      requiresApproval: false,
      needsVisualAnalysis: false,
      reason: "The request does not identify a concrete visual subject or change.",
      clarification:
        imageAssessment?.kind === "clarification"
          ? imageAssessment.question
          : context.hasSelection
            ? "ต้องการให้สร้างหรือปรับอะไรจาก Object ที่เลือกครับ?"
            : "ต้องการสร้างภาพอะไรครับ? ระบุ subject, style หรือการใช้งานเพิ่มอีกนิดได้เลยครับ",
    };
  }

  const capabilityAlias = selectCapability(normalizedPrompt, intent, hasReference);
  const capability = resolveVisualCapability(capabilityAlias);
  const route: VisualRoute = capability.available ? "direct" : "orchestrator";
  return {
    prompt: normalizedPrompt,
    intent,
    taskClass,
    capabilityAlias,
    route,
    capabilityAvailable: capability.available,
    ...(capability.modelAlias ? { modelAlias: capability.modelAlias } : {}),
    requiresApproval: route !== "direct",
    needsVisualAnalysis,
    reason: `${capabilityAlias}: ${capability.reason}`,
  };
}

function classifyTaskClass(
  prompt: string,
  intent: DesignIntentKind,
  hasReference: boolean,
): VisualTaskClass {
  if (
    intent === "complex-design" ||
    hasReference ||
    /(?:\b\d+\s*(?:แบบ|ภาพ|variations?|versions?)\b|หลาย\s*(?:แบบ|ภาพ))/i.test(prompt)
  ) {
    return "complex";
  }
  return "simple";
}

function selectCapability(
  prompt: string,
  intent: DesignIntentKind,
  hasReference: boolean,
): VisualCapabilityAlias {
  if (intent === "answer") return "ORCHESTRATOR_DEFAULT";
  if (intent === "local-edit" || intent === "destructive" || hasReference) return "IMAGE_EDIT";
  if (/โลโก้|ไอคอน|vector|เวกเตอร์|logo|icon/i.test(prompt)) return "IMAGE_VECTOR";
  return "IMAGE_DEFAULT";
}
