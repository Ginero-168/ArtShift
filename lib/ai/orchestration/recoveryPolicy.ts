export type RecoveryFailureKind =
  | "auth"
  | "invalid_input"
  | "safety"
  | "budget"
  | "cancelled"
  | "polling"
  | "quality"
  | "network"
  | "capability";

export type RecoveryInput = {
  kind: RecoveryFailureKind;
  attempt: number;
  maxAttempts: number;
  predictionId?: string;
};

export type RecoveryDecision =
  | { action: "stop"; reason: string }
  | { action: "resume"; reason: string }
  | { action: "retry"; nextAttempt: number; reason: string };

export function decideRecovery(input: RecoveryInput): RecoveryDecision {
  if (
    ["auth", "invalid_input", "safety", "budget", "cancelled", "capability"].includes(input.kind)
  ) {
    return { action: "stop", reason: `ไม่ retry สำหรับความล้มเหลวประเภท ${input.kind}` };
  }
  if (input.kind === "polling" && input.predictionId) {
    return { action: "resume", reason: "ติดตาม prediction เดิมเพื่อป้องกันงานซ้ำ" };
  }
  if (input.attempt >= input.maxAttempts) {
    return { action: "stop", reason: "ถึงขีดจำกัดจำนวน attempt แล้ว" };
  }
  if (input.kind === "quality") {
    return {
      action: "retry",
      nextAttempt: input.attempt + 1,
      reason: "แก้เงื่อนไขที่ Quality Gate ระบุและลองใหม่หนึ่งครั้ง",
    };
  }
  if (input.kind === "network") {
    return {
      action: "retry",
      nextAttempt: input.attempt + 1,
      reason: "ลอง transport ใหม่ภายใน budget ที่กำหนด",
    };
  }
  return { action: "stop", reason: "ไม่มี recovery strategy ที่ยืนยันได้" };
}
