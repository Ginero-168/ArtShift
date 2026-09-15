import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InlineTagEditorHandle } from "@/components/AI/InlineTagEditor";
import { useCanvasSelectionBridge } from "@/components/AI/useCanvasSelectionBridge";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { useEngine } from "@/lib/engine/store";
import type { ImageElement } from "@/lib/engine/types";

describe("useCanvasSelectionBridge — Multi-turn Canvas Tag Selection", () => {
  const sampleImage1 = {
    id: "img-test-1",
    type: "image",
    fileId: "file-test-1",
    name: "Hero Photo",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    angle: 0,
    opacity: 1,
    isDeleted: false,
    version: 1,
    naturalWidth: 800,
    naturalHeight: 600,
  } as ImageElement;

  const sampleImage2 = {
    id: "img-test-2",
    type: "image",
    fileId: "file-test-2",
    name: "Logo Badge",
    x: 350,
    y: 100,
    width: 100,
    height: 100,
    angle: 0,
    opacity: 1,
    isDeleted: false,
    version: 1,
    naturalWidth: 400,
    naturalHeight: 400,
  } as ImageElement;

  let mockEditor: InlineTagEditorHandle;
  let insertedTags: ComposerImageRef[];

  beforeEach(() => {
    insertedTags = [];
    mockEditor = {
      insertTag: vi.fn((ref) => {
        insertedTags.push(ref);
      }),
      getValue: vi.fn(() => ""),
      setValue: vi.fn(),
      clear: vi.fn(),
      focus: vi.fn(),
    };

    // Cleanly reset store state
    useEngine.setState((state) => ({
      ...state,
      selectedIds: new Set<string>(),
      selectionVersion: 0,
      doc: {
        ...state.doc,
        slides: state.doc.slides.map((s, idx) =>
          idx === 0 ? { ...s, elements: [sampleImage1, sampleImage2] } : s,
        ),
      },
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("inserts name tag on 1st click, and successfully re-inserts on 2nd click after tag removal", () => {
    const { result } = renderHook(() => useCanvasSelectionBridge());

    act(() => {
      result.current.setEditorRef(mockEditor);
    });

    // 1st click on canvas: select image 1
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });

    expect(mockEditor.insertTag).toHaveBeenCalledTimes(1);
    expect(insertedTags[0]?.objectId).toBe("img-test-1");
    expect(result.current.attachedImageIds).toContain("img-test-1");

    // User removes the tag from chat composer (e.g. backspace / cross button)
    act(() => {
      result.current.handleInlineTagsChange([]);
    });

    expect(result.current.attachedImageIds).toEqual([]);

    // 2nd click on canvas: user selects image 1 again
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });

    // The tag MUST be inserted on the 2nd click!
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(2);
    expect(insertedTags[1]?.objectId).toBe("img-test-1");
    expect(result.current.attachedImageIds).toContain("img-test-1");
  });

  it("successfully re-inserts name tag when user deselects on canvas and clicks again", () => {
    const { result } = renderHook(() => useCanvasSelectionBridge());

    act(() => {
      result.current.setEditorRef(mockEditor);
    });

    // 1st click: select image 1
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(1);

    // User deselects on canvas (clicks canvas background)
    act(() => {
      useEngine.getState().clearSelection();
    });

    // User removes tag from composer
    act(() => {
      result.current.handleInlineTagsChange([]);
    });

    // 2nd click: user selects image 1 again
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });

    // Tag must be inserted on 2nd click
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(2);
    expect(insertedTags[1]?.objectId).toBe("img-test-1");
  });

  it("allows sequential selection of multiple images and re-selection of previous images", () => {
    const { result } = renderHook(() => useCanvasSelectionBridge());

    act(() => {
      result.current.setEditorRef(mockEditor);
    });

    // Click Image 1
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(1);
    expect(insertedTags[0]?.objectId).toBe("img-test-1");

    // Click Image 2
    act(() => {
      useEngine.getState().selectOnly(["img-test-2"]);
    });
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(2);
    expect(insertedTags[1]?.objectId).toBe("img-test-2");

    // Remove Image 1 from composer
    act(() => {
      result.current.handleInlineTagsChange(["img-test-2"]);
    });

    // Click Image 1 again (re-selection)
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(3);
    expect(insertedTags[2]?.objectId).toBe("img-test-1");
  });

  it("re-inserts tag if user clicks an already-selected image after removing its tag", () => {
    const { result } = renderHook(() => useCanvasSelectionBridge());

    act(() => {
      result.current.setEditorRef(mockEditor);
    });

    // 1st click: select image 1
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(1);

    // Remove tag in composer without deselecting canvas (simulate backspacing in chat)
    act(() => {
      result.current.setAttachedImageIds([]);
    });

    // User clicks the image on canvas again
    act(() => {
      useEngine.getState().selectOnly(["img-test-1"]);
    });

    // Tag must be re-inserted
    expect(mockEditor.insertTag).toHaveBeenCalledTimes(2);
  });
});
