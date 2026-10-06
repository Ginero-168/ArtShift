import type { PlanProposal } from "@/lib/designAgent/contracts";

export const CHAT_STATUS_READING = "กำลังอ่านคำขอ";
export const CHAT_STATUS_MAKING = "กำลังสร้างภาพ";
export const CHAT_ONE_STEP_TEXT = "บอกสิ่งที่ต้องการเป็นคำสั่งเดียวได้เลย แชทนี้ไม่เปิดแผนหลายขั้น";

export type ChatAct =
  | { act: "say"; text: string }
  | { act: "ask"; text: string; options: string[] }
  | { act: "make" }
  | { act: "stuck"; text: string }
  | { act: "apply"; proposal: PlanProposal };

type ChatDirection = {
  kind: string;
  text?: string;
  question?: string;
  options?: string[];
  proposal?: PlanProposal;
};

/** One visible act for a director result. A multi-step plan does not become an approval card. */
export function chatActFromDirection(direction: ChatDirection): ChatAct {
  if (direction.kind === "answer" && direction.text?.trim()) {
    return { act: "say", text: direction.text.trim() };
  }
  if (direction.kind === "clarification" && direction.question?.trim()) {
    return {
      act: "ask",
      text: direction.question.trim(),
      options: (direction.options ?? []).filter((option) => option.trim()).slice(0, 4),
    };
  }
  if (direction.kind === "image-task") return { act: "make" };
  if (direction.kind === "design-plan" && direction.proposal) {
    return { act: "apply", proposal: direction.proposal };
  }
  if (direction.kind === "stuck" && direction.text?.trim()) {
    return { act: "stuck", text: direction.text.trim() };
  }
  return { act: "stuck", text: CHAT_ONE_STEP_TEXT };
}
