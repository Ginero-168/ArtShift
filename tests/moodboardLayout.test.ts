import { describe, expect, it } from "vitest";
import { createMoodboardItem } from "@/lib/moodboard/factory";
import { layoutMoodboardByRoles, ROLE_CLUSTER_ORIGINS } from "@/lib/moodboard/layout";

describe("moodboard role cluster layout", () => {
  it("places items into spatially separated role clusters", () => {
    const items = [
      createMoodboardItem({ kind: "image", role: "subject", text: "A" }),
      createMoodboardItem({ kind: "image", role: "setting", text: "B" }),
      createMoodboardItem({ kind: "image", role: "prop", text: "C" }),
      createMoodboardItem({ kind: "chip", role: "mood", text: "humid" }),
      createMoodboardItem({ kind: "chip", role: "color", text: "gold", color: "#d4af37" }),
    ];
    const laidOut = layoutMoodboardByRoles(items, () => 0.5);
    const byRole = Object.fromEntries(laidOut.map((item) => [item.role, item]));
    expect(byRole.subject.x).toBeCloseTo(ROLE_CLUSTER_ORIGINS.subject.x, 0);
    expect(byRole.setting.x).toBeGreaterThan(byRole.subject.x + 400);
    expect(byRole.prop.y).toBeGreaterThan(byRole.subject.y + 400);
    expect(byRole.mood.x).toBeGreaterThan(byRole.prop.x + 400);
    expect(laidOut.every((item) => Math.abs(item.rotation) < 0.3)).toBe(true);
  });
});
