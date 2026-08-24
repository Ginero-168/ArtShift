import { describe, expect, it } from "vitest";
import { parseObjectProposals } from "@/lib/server/ai/adapters/shared";

describe("AI provider output validation", () => {
  it("clamps and deduplicates untrusted normalized boxes", () => {
    const objects = parseObjectProposals(`\`\`\`json
      {"objects":[
        {"label":"cup","confidence":1.4,"box":{"x":-0.1,"y":0.2,"width":0.8,"height":0.9}},
        {"label":"cup","confidence":0.8,"box":{"x":0,"y":0.2,"width":0.8,"height":0.8}},
        {"label":"bad","box":{"x":"no","y":0,"width":1,"height":1}}
      ]}
    \`\`\``);

    expect(objects).toHaveLength(1);
    expect(objects[0]).toEqual({
      label: "cup",
      confidence: 1,
      box: { x: 0, y: 0.2, width: 0.8, height: 0.8 },
    });
  });

  it("returns an empty list instead of trusting malformed provider JSON", () => {
    expect(parseObjectProposals("not json at all")).toEqual([]);
  });
});
