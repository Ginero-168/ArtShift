import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cloudVisionStatusMessage,
  DEFAULT_CLOUD_VISION_LABEL,
  formatVisionModelLabel,
  LOCAL_VISION_LABEL,
  resolveVisionBackendOrder,
} from "@/lib/ai/orchestration/visionPreference";

describe("vision backend preference", () => {
  it("puts cloud Gemini API first whenever consent is present", () => {
    expect(resolveVisionBackendOrder({ cloudConsent: true })).toEqual([
      "cloud-api",
      "local-florence",
    ]);
  });

  it("never lists Florence before the cloud API", () => {
    const withConsent = resolveVisionBackendOrder({ cloudConsent: true });
    const withConsentNoLocal = resolveVisionBackendOrder({
      cloudConsent: true,
      allowLocalFallback: false,
    });
    expect(withConsent[0]).toBe("cloud-api");
    expect(withConsentNoLocal).toEqual(["cloud-api"]);
    expect(withConsent.indexOf("local-florence")).toBeGreaterThan(0);
  });

  it("uses Florence only when the API is unavailable and fallback is allowed", () => {
    expect(resolveVisionBackendOrder({ cloudConsent: false })).toEqual(["local-florence"]);
    expect(resolveVisionBackendOrder({ cloudConsent: false, allowLocalFallback: false })).toEqual(
      [],
    );
  });

  it("labels Gemini 3 Flash for Replicate pins and Florence only for local", () => {
    expect(formatVisionModelLabel("google/gemini-3-flash", "cloud-api")).toBe(
      DEFAULT_CLOUD_VISION_LABEL,
    );
    expect(formatVisionModelLabel(`google/gemini-3-flash@${"a".repeat(64)}`, "cloud-api")).toBe(
      DEFAULT_CLOUD_VISION_LABEL,
    );
    expect(formatVisionModelLabel(undefined, "cloud-api")).toBe(DEFAULT_CLOUD_VISION_LABEL);
    expect(formatVisionModelLabel("onnx-community/Florence-2-base-ft", "local-florence")).toBe(
      LOCAL_VISION_LABEL,
    );
    expect(cloudVisionStatusMessage()).toContain(DEFAULT_CLOUD_VISION_LABEL);
    expect(cloudVisionStatusMessage()).not.toContain(LOCAL_VISION_LABEL);
  });

  it("wires generate-path vision through Gemini API consent, not Florence-first", () => {
    const coPilot = readFileSync("lib/ai/coPilot.ts", "utf8");
    const runner = readFileSync("lib/ai/orchestration/imageTaskRunner.ts", "utf8");
    const analysis = readFileSync("lib/ai/orchestration/referenceAnalysis.ts", "utf8");

    expect(coPilot).toContain("analyzeImageReferences(");
    expect(coPilot).toContain("{ cloudConsent: true }");
    expect(runner).toContain("tryCloudVisionTurbo");
    expect(runner).toContain("DEFAULT_CLOUD_VISION_LABEL");
    expect(analysis).toContain('order[0] === "cloud-api"');
    expect(analysis).not.toMatch(/Local Florence-2 Fallback pass[\s\S]{0,80}if \(!turboSuccess\)/);
  });
});
