import { describe, expect, it } from "vitest";
import { diagnoseOrchestratorError } from "@/lib/ai/coPilot";
import {
  sanitizeAndPrepareImagePrompt,
  streamlinePromptForImageGen,
} from "@/lib/ai/imageGeneration";
import { classifyFailure } from "@/lib/ai/orchestration/imageTaskRunner";
import { decideRecovery } from "@/lib/ai/orchestration/recoveryPolicy";

describe("Prompt Streamlining and Sanitization Engine", () => {
  const userThaiPrompt =
    'สร้างภาพโปสเตอร์ โฆษณาอาหารไทยที่เป็นที่นิยม แสดงภาพอาหารไทยจำนวนมาก อลังการ เป็นภาพมุมกว้าง มีวัดไทยอยู่ที่สุดสายตา มี Title ว่า "Thai Food" และมี bubble ข้อความเช่น "อาหารไทย ไม่แพ้ชาติใดในโลก" พร้อมด้วยผู้คนมากมายในฉากรอบๆ';

  it("streamlines complex Thai poster prompt with title and speech bubbles into high-performance visual prompt", () => {
    const streamlined = streamlinePromptForImageGen(userThaiPrompt);

    // Should include typography header
    expect(streamlined).toContain('bold artistic typography header reading "Thai Food"');

    // Should include key visual elements
    expect(streamlined).toContain("commercial advertising poster design");
    expect(streamlined).toContain("authentic Thai cuisine dishes");
    expect(streamlined).toContain("wide-angle perspective");
    expect(streamlined).toContain("temple silhouette in the distant horizon");
    expect(streamlined).toContain("bustling crowd of people");

    // Should safely remove problematic speech bubble Thai clause from base description
    expect(streamlined).not.toContain('bubble ข้อความเช่น "อาหารไทย ไม่แพ้ชาติใดในโลก"');
  });

  it("preserves natural Thai prompts with speech bubbles and titles without destructive stripping", () => {
    const sanitized = sanitizeAndPrepareImagePrompt(userThaiPrompt);
    expect(sanitized).toContain('bubble ข้อความเช่น "อาหารไทย ไม่แพ้ชาติใดในโลก"');
    expect(sanitized).toContain("Thai Food");
    expect(sanitized).toContain("อาหารไทยที่เป็นที่นิยม");
  });

  it("leaves simple clean prompts intact during pre-flight sanitization", () => {
    const simplePrompt = "รูปแมวน่ารักในสวนดอกไม้";
    const sanitized = sanitizeAndPrepareImagePrompt(simplePrompt);
    expect(sanitized).toBe("แมวน่ารักในสวนดอกไม้");
  });

  it("preserves sushi advertising poster with speech bubbles without dropping sushi subject", () => {
    const sushiPrompt =
      'สร้างโปรเตอร์โฆษณาร้านซูชิ โทนสีเอิร์ธโทน ธรรมชาติ สบายใจ ฉากหลังสตูดิโอคลีน สไตล์มินิมอล สะอาดตา สไตล์ภาพถ่ายสมจริง Ultra-realistic คุณภาพสูง มี Bubble ข้อความ "ชิ้นละ 10 บาท" "อร่อย คำโต" "ถูกใจใกล้บ้าน" ขนาด 50x70cm';
    const sanitized = sanitizeAndPrepareImagePrompt(sushiPrompt);
    expect(sanitized).toContain("ซูชิ");
    expect(sanitized).toContain("ชิ้นละ 10 บาท");
    expect(sanitized).not.toBe(
      "commercial advertising poster design, vibrant professional layout, 8k resolution, cinematic lighting, sharp focus, masterwork commercial art",
    );

    const streamlined = streamlinePromptForImageGen(sushiPrompt);
    expect(streamlined).toContain("sushi");
    expect(streamlined).toContain("earth-tone");
  });
});

describe("502 / Provider Error Classification and Self-Healing Recovery", () => {
  it("classifies 502 Bad Gateway status as provider_error", () => {
    const error502 = new Error("AI Image Studio failed with status 502.");
    expect(classifyFailure(error502)).toBe("provider_error");
  });

  it("classifies 504 Gateway Timeout as provider_error", () => {
    const error504 = new Error("Gateway Timeout 504: upstream server took too long");
    expect(classifyFailure(error504)).toBe("provider_error");
  });

  it("classifies 'Image generation failed. Please try again.' as provider_error for auto-recovery", () => {
    const genError = new Error("Image generation failed. Please try again.");
    expect(classifyFailure(genError)).toBe("provider_error");
  });

  it("allows 1 self-healing retry on attempt 1 for provider_error", () => {
    const decision = decideRecovery({
      kind: "provider_error",
      attempt: 1,
      maxAttempts: 2,
    });

    expect(decision).toMatchObject({
      action: "retry",
      nextAttempt: 2,
    });
    expect(decision.reason).toContain("ปรับคำขอให้อัตโนมัติ");
  });

  it("stops when maximum attempts are reached for provider_error", () => {
    const decision = decideRecovery({
      kind: "provider_error",
      attempt: 2,
      maxAttempts: 2,
    });

    expect(decision).toMatchObject({
      action: "stop",
    });
  });
});

describe("Orchestrator Error Diagnosis for 502 / Timeouts", () => {
  it("diagnoses 502 error and always returns errorCard with promptToEdit and alternativePrompt", () => {
    const diagnosis = diagnoseOrchestratorError(
      "AI Image Studio failed with status 502.",
      'สร้างภาพโปสเตอร์ โฆษณาอาหารไทย มี Title ว่า "Thai Food" และมี bubble ข้อความเช่น "อาหารไทย"',
    );

    expect(diagnosis.shortReason).toContain("502");
    expect(diagnosis.errorCard).toBeDefined();
    expect(diagnosis.errorCard?.title).toContain("502");
    expect(diagnosis.errorCard?.actionText).toBe("✏️ ปรับแต่งคำขอใหม่");
    expect(diagnosis.errorCard?.promptToEdit).toBeDefined();
    expect(diagnosis.alternativePrompt).toBeDefined();
    expect(diagnosis.suggestions).toContain("✏️ ปรับแต่งคำขอใหม่");
    expect(diagnosis.suggestions).toContain("🔄 ลองสร้างใหม่อีกครั้ง");
  });

  it("ensures general fallback error also populates errorCard", () => {
    const diagnosis = diagnoseOrchestratorError("Unexpected inference failure", "วาดภาพวิวภูเขา");

    expect(diagnosis.errorCard).toBeDefined();
    expect(diagnosis.errorCard?.promptToEdit).toBeDefined();
    expect(diagnosis.errorCard?.actionText).toBe("✏️ ปรับแต่งคำขอใหม่");
  });
});
