import { describe, expect, it } from "vitest";
import {
  looksLikeChatMarkdown,
  parseChatMarkdown,
  parseChatMdInlines,
} from "@/lib/ai/chatMarkdownLite";

describe("chatMarkdownLite", () => {
  it("parses bold spans", () => {
    expect(parseChatMdInlines("Hello **world** ok")).toEqual([
      { type: "text", text: "Hello " },
      { type: "bold", text: "world" },
      { type: "text", text: " ok" },
    ]);
  });

  it("parses headings, lists, and skips horizontal rules", () => {
    const blocks = parseChatMarkdown(
      ["### 1. ภาพรวม", "โพสเตอร์ 1:1", "", "---", "", "- โลโก้", "- ส่วนลด **50 บาท**"].join("\n"),
    );
    expect(blocks[0]).toMatchObject({ type: "heading", level: 3 });
    expect(blocks.some((b) => b.type === "list")).toBe(true);
    expect(
      blocks.some(
        (b) => b.type === "heading" && "inlines" in b && b.inlines[0]?.text.includes("ภาพรวม"),
      ),
    ).toBe(true);
    const list = blocks.find((b) => b.type === "list");
    expect(list?.type === "list" && list.items).toHaveLength(2);
  });

  it("detects markdown-ish chat replies", () => {
    expect(looksLikeChatMarkdown("plain")).toBe(false);
    expect(looksLikeChatMarkdown("**ภาพรวม:** โพสเตอร์")).toBe(true);
    expect(looksLikeChatMarkdown("- item\n- item2")).toBe(true);
  });
});
