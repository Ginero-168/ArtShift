import { describe, expect, it } from "vitest";
import { createBookMockup, createRect, createText } from "@/lib/engine/factory";
import { cloneElementsForDuplicate, useEngine } from "@/lib/engine/store";

describe("Alt+Drag Duplicate", () => {
  it("clones elements with new IDs, matching coordinates, and preserves relationships", () => {
    const rect = createRect({ x: 100, y: 150, width: 200, height: 100 });
    const text = createText({ x: 120, y: 170, text: "Sample Text", fontSize: 24 });
    const book = createBookMockup({
      x: 300,
      y: 400,
      width: 300,
      height: 450,
      fileId: "cover1",
      naturalWidth: 1200,
      naturalHeight: 1800,
    });

    const cloned = cloneElementsForDuplicate([rect, text, book], 0, 0);

    expect(cloned).toHaveLength(3);
    // New distinct IDs
    expect(cloned[0].id).not.toBe(rect.id);
    expect(cloned[1].id).not.toBe(text.id);
    expect(cloned[2].id).not.toBe(book.id);

    // Matching positions
    expect(cloned[0].x).toBe(rect.x);
    expect(cloned[0].y).toBe(rect.y);
    expect(cloned[1].x).toBe(text.x);
    expect(cloned[1].y).toBe(text.y);
    expect(cloned[2].x).toBe(book.x);
    expect(cloned[2].y).toBe(book.y);

    // Preserves types and properties
    expect(cloned[0].type).toBe("rect");
    expect(cloned[1].type).toBe("text");
    expect(cloned[2].type).toBe("bookMockup");
  });

  it("addElements adds multiple cloned elements in a single batch to the store", () => {
    const st = useEngine.getState();
    const slide = st.doc.slides[0];
    const initialCount = slide.elements.length;

    const el1 = createRect({ x: 50, y: 50, width: 100, height: 100 });
    const el2 = createRect({ x: 200, y: 50, width: 100, height: 100 });

    st.addElements([el1, el2], "duplicate element");

    const updatedSlide = useEngine.getState().doc.slides[0];
    expect(updatedSlide.elements.length).toBe(initialCount + 2);
    expect(useEngine.getState().selectedIds.has(el1.id)).toBe(true);
    expect(useEngine.getState().selectedIds.has(el2.id)).toBe(true);
  });
});
