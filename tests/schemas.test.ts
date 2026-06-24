import { describe, expect, it } from "vitest";
import {
  AddShapeInputSchema,
  AddTextInputSchema,
  ApplyTemplateInputSchema,
  SetBackgroundInputSchema,
  safeParse,
} from "@/lib/schemas";

describe("apply_template coercion guard", () => {
  it("rejects data-as-string (must be coerced by caller first)", () => {
    // Anthropic streaming sometimes returns data as a JSON-encoded string.
    // The schema should REJECT that — chat.ts is expected to JSON.parse first.
    const strInput = {
      template: "title-bullets",
      data: JSON.stringify({ title: "T", bullets: ["a"] }),
    };
    expect(safeParse(ApplyTemplateInputSchema, strInput)).toBeNull();

    // After caller coerces the string, it parses fine.
    const parsed = {
      template: "title-bullets",
      data: JSON.parse(strInput.data),
    };
    expect(safeParse(ApplyTemplateInputSchema, parsed)).not.toBeNull();
  });
});

describe("AI input schemas", () => {
  it("accepts minimal valid add_text", () => {
    const r = safeParse(AddTextInputSchema, { text: "hi" });
    expect(r).not.toBeNull();
    expect(r?.text).toBe("hi");
  });

  it("rejects add_text without text", () => {
    expect(safeParse(AddTextInputSchema, {})).toBeNull();
  });

  it("rejects invalid font style", () => {
    const r = safeParse(AddTextInputSchema, { text: "x", fontStyle: "strange" });
    expect(r).toBeNull();
  });

  it("accepts hex and oklch colors for set_background", () => {
    expect(safeParse(SetBackgroundInputSchema, { color: "#ff00aa" })).not.toBeNull();
    expect(safeParse(SetBackgroundInputSchema, { color: "oklch(50% 0.1 250)" })).not.toBeNull();
    expect(safeParse(SetBackgroundInputSchema, { color: "not-a-color" })).toBeNull();
  });

  it("requires a known shape kind for add_shape", () => {
    expect(safeParse(AddShapeInputSchema, { shape: "rect" })).not.toBeNull();
    expect(safeParse(AddShapeInputSchema, { shape: "pentagon" })).toBeNull();
  });
});
