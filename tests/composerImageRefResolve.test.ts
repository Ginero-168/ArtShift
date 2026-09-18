import { describe, expect, it } from "vitest";
import {
  type ComposerImageRef,
  resolveComposerImageRef,
  uniqueComposerImageRefsByName,
} from "@/lib/ai/orchestration/imageReferences";

function ref(
  partial: Partial<ComposerImageRef> &
    Pick<ComposerImageRef, "objectId" | "fileId" | "displayName">,
): ComposerImageRef {
  return {
    elementVersion: 1,
    sourceWidth: 100,
    sourceHeight: 100,
    width: 100,
    height: 100,
    angle: 0,
    ...partial,
  };
}

describe("resolveComposerImageRef", () => {
  const sushi = ref({
    objectId: "uuid-sushi",
    fileId: "file-sushi",
    displayName: "ภาพเซตซูชิ",
  });
  const photoA = ref({
    objectId: "uuid-photo-a",
    fileId: "file-photo-a",
    displayName: "Photo",
  });
  const photoB = ref({
    objectId: "uuid-photo-b",
    fileId: "file-photo-b",
    displayName: "Photo",
  });

  it("prefers exact objectId even when another image shares the display name", () => {
    const resolved = resolveComposerImageRef("uuid-photo-b", "Photo", [photoA, photoB, sushi]);
    expect(resolved.objectId).toBe("uuid-photo-b");
    expect(resolved.fileId).toBe("file-photo-b");
  });

  it("does not grab the first Photo when the tag only has a bare name", () => {
    const resolved = resolveComposerImageRef("Photo", "Photo", [photoA, photoB, sushi]);
    // Ambiguous — return stub without stealing photoA's pixels
    expect(resolved.fileId).toBe("");
    expect(resolved.objectId).toBe("Photo");
  });

  it("resolves a unique bare name to that single image", () => {
    const resolved = resolveComposerImageRef("ภาพเซตซูชิ", "ภาพเซตซูชิ", [photoA, sushi]);
    expect(resolved.fileId).toBe("file-sushi");
    expect(resolved.objectId).toBe("uuid-sushi");
  });

  it("lists only unique display names for bare @Name paste matching", () => {
    const unique = uniqueComposerImageRefsByName([photoA, photoB, sushi]);
    expect(unique.has("photo")).toBe(false);
    expect(unique.get("ภาพเซตซูชิ")?.objectId).toBe("uuid-sushi");
  });
});
