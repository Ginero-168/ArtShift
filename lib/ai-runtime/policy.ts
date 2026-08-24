import type { AiExecutionOptions, AiTaskKind, AiTaskLocality } from "./contracts";
import { AiRuntimeError } from "./errors";

export type AiTaskPolicy = {
  locality: AiTaskLocality;
  cacheable: boolean;
  recordsContent: false;
};

export const LOCAL_ONLY_AI_FEATURES = [
  "remove-background",
  "extract-objects",
  "raster-selection",
  "pixel-mask",
] as const;

export const AI_TASK_POLICIES: Record<AiTaskKind, AiTaskPolicy> = {
  "assistant.chat": { locality: "cloud-required", cacheable: false, recordsContent: false },
  "vision.describe": { locality: "cloud-opt-in", cacheable: true, recordsContent: false },
  "vision.propose": { locality: "cloud-opt-in", cacheable: true, recordsContent: false },
  "vision.ocr": { locality: "cloud-opt-in", cacheable: true, recordsContent: false },
  "prompt.enhance": { locality: "cloud-opt-in", cacheable: true, recordsContent: false },
  "image.generate": { locality: "cloud-required", cacheable: false, recordsContent: false },
};

export function assertAiTaskPolicy(task: AiTaskKind, options: AiExecutionOptions): void {
  const policy = AI_TASK_POLICIES[task];
  if (policy.locality === "local-only") {
    throw new AiRuntimeError("POLICY_DENIED", `${task} is restricted to the local runtime.`);
  }
  if (policy.locality === "cloud-opt-in" && options.cloudConsent !== true) {
    throw new AiRuntimeError(
      "POLICY_DENIED",
      `${task} requires explicit cloud consent before image or prompt data leaves this device.`,
    );
  }
  if (options.profile === "local") {
    throw new AiRuntimeError(
      "NO_PROVIDER",
      `${task} has no server-side local adapter. Use the browser-local ArtShift tool instead.`,
    );
  }
}
