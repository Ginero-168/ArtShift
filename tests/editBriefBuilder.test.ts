import { describe, expect, it } from "vitest";
import { buildEditBrief, parseEditBrief } from "@/lib/ai/orchestration/editBriefBuilder";
import type { ImageWorkSpec } from "@/lib/ai/orchestration/imageWorkSpec";

describe("editBriefBuilder", () => {
  const sampleSpec: ImageWorkSpec = {
    operation: "edit",
    userPrompt: "เปลี่ยนสีแก้วเป็นเขียวมรกต แต่ห้ามเปลี่ยนโลโก้",
    refinedPrompt: "เปลี่ยนสีแก้วเซรามิกเป็นเขียวมรกต",
    outputCount: 1,
    target: {
      artworkId: "art-123",
      artworkRevision: 2,
      objectId: "obj-456",
    },
    references: [
      { assetRef: "asset://layer-1", role: "base" },
      { assetRef: "asset://palette-emerald", role: "palette" },
    ],
    requestedChanges: ["เปลี่ยนสีแก้วเซรามิกเป็นเขียวมรกต"],
    invariants: ["ห้ามเปลี่ยนโลโก้และตัวอักษรทุกจุด", "รักษามุมกล้องและแสงเงาเดิม"],
    exactText: ["ArtShift Cafe"],
    finalUse: true,
    speedPreference: "normal",
    output: {
      width: 1024,
      height: 1024,
      format: "png",
      background: "auto",
    },
  };

  it("builds a structured EditBrief with all required sections", () => {
    const brief = buildEditBrief(sampleSpec);

    expect(brief).toContain("CHANGE:\n- เปลี่ยนสีแก้วเซรามิกเป็นเขียวมรกต");
    expect(brief).toContain("PRESERVE:\n- ห้ามเปลี่ยนโลโก้และตัวอักษรทุกจุด\n- รักษามุมกล้องและแสงเงาเดิม");
    expect(brief).toContain(
      "REFERENCE ROLES:\n- image 1 (asset://layer-1) = base image to edit\n- image 2 (asset://palette-emerald) = color reference only",
    );
    expect(brief).toContain("SUCCESS CRITERIA:");
    expect(brief).toContain('Exact text must be preserved or rendered accurately: "ArtShift Cafe"');
  });

  it("parses an EditBrief string back into its constituent structured parts", () => {
    const brief = buildEditBrief(sampleSpec);
    const parsed = parseEditBrief(brief);

    expect(parsed.changes).toEqual(["เปลี่ยนสีแก้วเซรามิกเป็นเขียวมรกต"]);
    expect(parsed.invariants).toHaveLength(2);
    expect(parsed.invariants[0]).toBe("ห้ามเปลี่ยนโลโก้และตัวอักษรทุกจุด");
    expect(parsed.referenceRoles).toHaveLength(2);
    expect(parsed.successCriteria.length).toBeGreaterThan(0);
  });

  it("provides sensible default invariants and changes when spec arrays are empty", () => {
    const emptySpec: ImageWorkSpec = {
      operation: "edit",
      userPrompt: "make it brighter",
      refinedPrompt: "make it brighter",
      outputCount: 1,
      references: [],
      requestedChanges: [],
      invariants: [],
      exactText: [],
      finalUse: false,
      speedPreference: "normal",
      output: {
        width: 1024,
        height: 1024,
        format: "webp",
        background: "auto",
      },
    };

    const brief = buildEditBrief(emptySpec);
    const parsed = parseEditBrief(brief);

    expect(parsed.changes).toEqual(["make it brighter"]);
    expect(parsed.invariants.length).toBeGreaterThan(0);
  });
});
