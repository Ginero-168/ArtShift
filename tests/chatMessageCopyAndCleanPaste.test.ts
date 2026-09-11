import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import {
  buildPromptWithTagsForCopy,
  formatDisplayPrompt,
  parseInlineTagTokens,
} from "@/lib/ai/orchestration/inlineTagSynthesis";

describe("Chat Message Copy & Clean Paste with Name Tag", () => {
  const sampleRef: ComposerImageRef = {
    objectId: "img-mountain-01",
    elementVersion: 1,
    fileId: "file-xyz-123",
    displayName: "ภาพทิวทัศน์ภูเขา",
    sourceWidth: 800,
    sourceHeight: 600,
    width: 400,
    height: 300,
    angle: 0,
  };

  it("builds copy text preserving existing inline tags", () => {
    const copyText = buildPromptWithTagsForCopy(
      "@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสงให้เป็นช่วง Golden hour",
      [sampleRef],
    );
    expect(copyText).toBe("@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสงให้เป็นช่วง Golden hour");
  });

  it("builds copy text with Name Tag prepended if image was attached via selection", () => {
    const copyText = buildPromptWithTagsForCopy(
      "ปรับโทนแสงให้เป็นช่วง Golden hour",
      [sampleRef],
    );
    expect(copyText).toBe("@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสงให้เป็นช่วง Golden hour");
  });

  it("builds copy text cleanly for plain text message without images", () => {
    const copyText = buildPromptWithTagsForCopy(
      "สร้างรูปแมวส้มนั่งบนเบาะนุ่มๆ",
      undefined,
    );
    expect(copyText).toBe("สร้างรูปแมวส้มนั่งบนเบาะนุ่มๆ");
  });

  it("parses copied prompt with Name Tag cleanly into tag and text segments", () => {
    const copiedText = "@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสงให้เป็นช่วง Golden hour";
    const segments = parseInlineTagTokens(copiedText);

    expect(segments.length).toBe(2);
    expect(segments[0].type).toBe("tag");
    if (segments[0].type === "tag") {
      expect(segments[0].displayName).toBe("ภาพทิวทัศน์ภูเขา");
      expect(segments[0].objectId).toBe("img-mountain-01");
    }
    expect(segments[1].type).toBe("text");
    if (segments[1].type === "text") {
      expect(segments[1].text).toBe(" ปรับโทนแสงให้เป็นช่วง Golden hour");
    }
  });

  it("formats display prompt cleanly with @DisplayName tag", () => {
    const copiedText = "@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสงให้เป็นช่วง Golden hour";
    const displayPrompt = formatDisplayPrompt(copiedText);
    expect(displayPrompt).toBe("@ภาพทิวทัศน์ภูเขา ปรับโทนแสงให้เป็นช่วง Golden hour");
  });

  it("strips rich HTML tags from pasted content so no white text or formatting leaks", () => {
    const richHTMLContent =
      '<span style="color: #ffffff; background: rgb(79, 70, 229);">@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสง</span>';
    // When pasted into plain text clipboard, rich HTML tags are stripped:
    const plainTextFromClipboard = richHTMLContent.replace(/<[^>]+>/g, "");
    expect(plainTextFromClipboard).toBe("@[ภาพทิวทัศน์ภูเขา:img-mountain-01] ปรับโทนแสง");

    const segments = parseInlineTagTokens(plainTextFromClipboard);
    expect(segments[0].type).toBe("tag");
    expect(segments[1].type).toBe("text");
  });

  it("verifies ChatIcons contains ChatCopyIcon with overlapping rectangles", () => {
    const iconsSource = readFileSync("components/AI/ChatIcons.tsx", "utf8");
    expect(iconsSource).toContain("export function ChatCopyIcon");
    expect(iconsSource).toContain("<rect width=\"12.5\" height=\"12.5\"");
  });

  it("verifies ChatThread renders copy message button with ChatCopyIcon and data-testid", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");
    expect(threadSource).toContain("ChatCopyIcon");
    expect(threadSource).toContain("copy-user-message-");
    expect(threadSource).toContain("คัดลอกข้อความพร้อม Name Tag");
    expect(threadSource).toContain("copy-assistant-message-");
  });

  it("verifies InlineTagEditor strips formatting on paste and parses Name Tags", () => {
    const editorSource = readFileSync("components/AI/InlineTagEditor.tsx", "utf8");
    expect(editorSource).toContain("onPaste={handlePaste}");
    expect(editorSource).toContain("e.clipboardData.getData(\"text/plain\")");
    expect(editorSource).toContain(".artshift-inline-editor *");
    expect(editorSource).toContain("color: inherit !important;");
  });

  it("verifies InlineTagRenderer allows text selection on tag pills so Name Tag is not skipped", () => {
    const rendererSource = readFileSync("components/AI/InlineTagRenderer.tsx", "utf8");
    expect(rendererSource).toContain("userSelect: \"text\"");
  });
});
