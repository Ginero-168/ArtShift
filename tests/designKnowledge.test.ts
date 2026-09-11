import { describe, expect, it } from "vitest";
import {
  DESIGN_KNOWLEDGE_SKILLS,
  retrieveDesignKnowledge,
} from "@/lib/ai/knowledge/designKnowledge";

describe("local design knowledge retrieval", () => {
  it("indexes the requested core design specialties", () => {
    expect(DESIGN_KNOWLEDGE_SKILLS.map((skill) => skill.id)).toEqual([
      "poster-design",
      "branding-logo",
      "instagram-post",
      "product-image",
      "character-design",
      "brochure-design",
      "ui-design",
      "signage-banner",
    ]);
  });

  it("retrieves product-image guidance for a Thai product brief", () => {
    const results = retrieveDesignKnowledge(
      "สร้างภาพโฆษณาขวดเซรั่มแบบ product photography ให้ดู premium",
      3,
    );

    expect(results[0]).toMatchObject({ id: "product-image" });
    expect(results.every((result) => result.score > 0)).toBe(true);
  });

  it("retrieves poster guidance for an infographic poster", () => {
    const results = retrieveDesignKnowledge("ออกแบบโปสเตอร์อินโฟกราฟิกเรื่องถั่ว", 2);
    expect(results.map((result) => result.id)).toContain("poster-design");
  });

  it("returns a bounded result without leaking the full catalog", () => {
    expect(retrieveDesignKnowledge("ออกแบบ", 2)).toHaveLength(2);
  });
});
