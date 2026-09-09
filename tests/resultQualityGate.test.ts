import { describe, expect, it } from "vitest";
import {
  runEditPreservationGate,
  runGeneratedImageQualityGate,
} from "@/lib/ai/orchestration/resultQualityGate";

describe("generated image quality gate", () => {
  it("passes deterministic and supported local evidence", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["mug"],
      requiredText: "SALE",
      referenceRequired: true,
      referenceFacts: [
        { caption: "a coffee mug", objects: ["mug"], visibleText: "SALE", limitations: [] },
      ],
      outputAnalysis: {
        caption: "a white mug on a table",
        objects: ["mug", "table"],
        visibleText: "SALE",
        limitations: [],
      },
    });

    expect(result.passed).toBe(true);
    expect(result.review).toBe("local-analysis");
    expect(result.blockers).toEqual([]);
  });

  it("blocks a dimension mismatch before Canvas commit", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 768,
      requestedAspectRatio: "1:1",
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "dimensions")?.passed).toBe(false);
  });

  it("blocks missing required subject or OCR text", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["mug"],
      requiredText: "SALE",
      outputAnalysis: {
        caption: "a landscape photograph",
        objects: ["tree"],
        visibleText: "",
        limitations: [],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "subject")?.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "text")?.passed).toBe(false);
  });

  it("fails closed when a required semantic review is unavailable", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requiredSubjects: ["product"],
    });

    expect(result.passed).toBe(false);
    expect(result.review).toBe("unverifiable");
    expect(result.blockers).toContain("Required subjects need local output analysis.");
  });

  it("does not claim reference fidelity without a source comparison signal", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      referenceRequired: true,
      outputAnalysis: {
        caption: "a landscape photograph",
        objects: ["tree"],
        visibleText: "",
        limitations: [],
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "reference")?.passed).toBe(false);
  });

  it("passes technical dimensions and aspect ratio check when technicalFallback is active", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["pig"],
      requiredText: "SALE",
      referenceRequired: true,
      technicalFallback: true,
    });

    expect(result.passed).toBe(true);
    expect(result.review).toBe("deterministic");
    expect(result.blockers).toEqual([]);
  });

  it("still blocks aspect ratio mismatch even when technicalFallback is active", () => {
    const result = runGeneratedImageQualityGate({
      outputWidth: 1024,
      outputHeight: 768,
      requestedAspectRatio: "1:1",
      requiredSubjects: ["pig"],
      technicalFallback: true,
    });

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "dimensions")?.passed).toBe(false);
  });
});

describe("edit preservation quality gate", () => {
  it("passes preservation review when requested delta and invariants are satisfied", () => {
    const result = runEditPreservationGate({
      requestedChanges: ["เปลี่ยนสีแก้วเป็นเขียว"],
      invariants: ["รักษาโลโก้ ArtShift", "รักษามุมกล้อง"],
      exactText: ["ArtShift"],
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      outputAnalysis: {
        caption: "a green coffee mug with ArtShift logo",
        objects: ["green mug", "ArtShift logo"],
        visibleText: "ArtShift Cafe",
        limitations: [],
      },
    });

    expect(result.verified).toBe(true);
    expect(result.canApply).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.criteria.every((c) => c.status === "passed")).toBe(true);
  });

  it("fails verified and blocks apply when an invariant is violated", () => {
    const result = runEditPreservationGate({
      requestedChanges: ["เปลี่ยนสีแก้ว"],
      invariants: ["รักษาโลโก้ ArtShift"],
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      outputAnalysis: {
        caption: "a green mug",
        objects: ["mug"],
        visibleText: "",
        limitations: ["logo removed during generation"],
      },
    });

    expect(result.verified).toBe(false);
    expect(result.canApply).toBe(false);
    expect(result.failureReasons).toContain("preservation-miss");
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("fails verified when required criteria are not_checked without outputAnalysis", () => {
    const result = runEditPreservationGate({
      requestedChanges: ["เปลี่ยนสีแก้ว"],
      invariants: ["รักษาโลโก้"],
      exactText: ["ArtShift"],
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
    });

    expect(result.verified).toBe(false);
    expect(result.canApply).toBe(false);
    expect(result.criteria.some((c) => c.status === "not_checked")).toBe(true);
  });

  it("fails text check and records text-miss when exact text is missing from output", () => {
    const result = runEditPreservationGate({
      requestedChanges: ["เปลี่ยนสีแก้ว"],
      invariants: ["รักษามุมกล้อง"],
      exactText: ["ArtShift Cafe"],
      outputWidth: 1024,
      outputHeight: 1024,
      requestedAspectRatio: "1:1",
      outputAnalysis: {
        caption: "a green mug",
        objects: ["mug"],
        visibleText: "Coffee House",
        limitations: [],
      },
    });

    expect(result.verified).toBe(false);
    expect(result.canApply).toBe(false);
    expect(result.failureReasons).toContain("text-miss");
  });
});
