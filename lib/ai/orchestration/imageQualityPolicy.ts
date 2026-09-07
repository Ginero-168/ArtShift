import type { AiImageQuality } from "./taskMachine";

export type ImageQualityDecision = {
  quality: AiImageQuality;
  rationale: string;
  maxAttempts: number;
};

type ImageQualityInput = {
  prompt: string;
  taskClass: "simple" | "complex";
  hasReference: boolean;
  requiresExactText?: boolean;
  finalUse?: boolean;
};

export function chooseImageQuality(input: ImageQualityInput): ImageQualityDecision {
  const prompt = input.prompt.toLocaleLowerCase();
  const requiresHighQuality =
    input.hasReference ||
    input.requiresExactText ||
    input.finalUse ||
    input.taskClass === "complex" ||
    /(?:product|สินค้า|packaging|บรรจุภัณฑ์|typography|ข้อความ|poster|โปสเตอร์|print|พิมพ์)/iu.test(prompt);
  if (requiresHighQuality) {
    return {
      quality: "high",
      rationale: "ต้องรักษาความถูกต้องของ reference, สินค้า, ข้อความ หรือองค์ประกอบซับซ้อน",
      maxAttempts: 2,
    };
  }
  if (
    /(?:quick|draft|ร่าง|ทดลอง|เร็ว|ด่วน)/iu.test(prompt) &&
    !input.hasReference &&
    !input.requiresExactText
  ) {
    return {
      quality: "low",
      rationale: "ผู้ใช้ระบุว่าเป็นงานร่าง/ทดลองและไม่มี reference หรือข้อความที่ต้องรักษา",
      maxAttempts: 1,
    };
  }
  return {
    quality: "medium",
    rationale: "มาตรฐานเริ่มต้นสำหรับงานที่ intent ครบและต้องการคุณภาพใช้งานได้จริง",
    maxAttempts: 2,
  };
}
