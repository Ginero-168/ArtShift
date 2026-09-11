import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Chat Image Drag and Drop to Canvas", () => {
  it("verifies ChatThread AI generated images and reference previews are draggable with proper payloads", () => {
    const threadSource = readFileSync("components/AI/ChatThread.tsx", "utf8");

    // Assistant generated images
    expect(threadSource).toContain("draggable={true}");
    expect(threadSource).toContain("application/x-artshift-chat-image");
    expect(threadSource).toContain("artshift/file-id");
    expect(threadSource).toContain("text/uri-list");
    expect(threadSource).toContain("cursor: \"grab\"");
    expect(threadSource).toContain("ลากไปวางบน Canvas ได้");
  });

  it("verifies StagedVariationsCard candidates are draggable to canvas", () => {
    const cardsSource = readFileSync("components/AI/ChatActionCards.tsx", "utf8");
    expect(cardsSource).toContain("draggable={true}");
    expect(cardsSource).toContain("application/x-artshift-chat-image");
    expect(cardsSource).toContain("artshift/file-id");
  });

  it("verifies usePasteDrop handles chat image and URI drop payloads", () => {
    const dropSource = readFileSync("components/Canvas/usePasteDrop.ts", "utf8");
    expect(dropSource).toContain("application/x-artshift-chat-image");
    expect(dropSource).toContain("artshift/file-id");
    expect(dropSource).toContain("text/uri-list");
    expect(dropSource).toContain("dropEffect = \"copy\"");
    expect(dropSource).toContain("handleImageEntry");
  });
});
