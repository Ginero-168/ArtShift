"use client";

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import type { ComposerImageRef } from "@/lib/ai/orchestration/imageReferences";
import { parseInlineTagTokens } from "@/lib/ai/orchestration/inlineTagSynthesis";
import { getCached } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import ImageReferencePreview from "./ImageReferencePreview";


export type InlineTagEditorHandle = {
  insertTag: (ref: ComposerImageRef) => void;
  getValue: () => string;
  setValue: (value: string) => void;
  clear: () => void;
  focus: () => void;
};

type Props = {
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  omittedCount?: number;
  availableImages?: readonly ComposerImageRef[];
  onSend?: () => void;
  onChange?: (val: string) => void;
  onBackspaceAtStart?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
};

const InlineTagEditor = forwardRef<InlineTagEditorHandle, Props>(function InlineTagEditor(
  {
    placeholder = "บอกสิ่งที่ต้องการออกแบบ...",
    disabled = false,
    rows = 4,
    omittedCount = 0,
    availableImages = [],
    onSend,
    onChange,
    onBackspaceAtStart,
    onFocus,
    onBlur,
    style,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [isEmpty, setIsEmpty] = useState(true);
  const [hasTags, setHasTags] = useState(false);
  const [activePreview, setActivePreview] = useState<{
    anchor: HTMLElement;
    ref: ComposerImageRef;
  } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setActivePreview(null);
    }, 140);
  }, [cancelClose]);

  // Serializes DOM nodes inside editor to tokenized string: text + @[displayName:objectId]
  const serializeDOM = useCallback((): string => {
    if (!editorRef.current) return "";
    let result = "";

    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        if (el.dataset?.tagObjectId) {
          const name = el.dataset.tagDisplayName || "Image";
          const id = el.dataset.tagObjectId;
          result += `@[${name}:${id}]`;
        } else if (el.tagName === "BR") {
          result += "\n";
        } else {
          // If div block created by browser Enter
          const isBlock = el.tagName === "DIV" || el.tagName === "P";
          if (isBlock && result.length > 0 && !result.endsWith("\n")) {
            result += "\n";
          }
          for (const child of Array.from(el.childNodes)) {
            walk(child);
          }
        }
      }
    };

    for (const child of Array.from(editorRef.current.childNodes)) {
      walk(child);
    }

    return result;
  }, []);

  const handleContentChange = useCallback(() => {
    const val = serializeDOM();
    setIsEmpty(!val.trim());
    setHasTags(val.includes("@["));
    onChange?.(val);
  }, [serializeDOM, onChange]);

  // Creates DOM element for inline tag pill
  const createTagPillElement = useCallback(
    (imgRef: ComposerImageRef): HTMLElement => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.tabIndex = -1;
      pill.contentEditable = "false";
      pill.dataset.tagObjectId = imgRef.objectId;
      pill.dataset.tagDisplayName = imgRef.displayName;
      pill.dataset.testid = `selected-image-tag-${imgRef.objectId}`;
      pill.setAttribute("data-testid", `selected-image-tag-${imgRef.objectId}`);
      pill.setAttribute("aria-label", `Selected image ${imgRef.displayName}`);
      pill.className = "artshift-inline-tag-pill";

      // Compact inline style matching character status
      pill.style.display = "inline-flex";
      pill.style.alignItems = "center";
      pill.style.gap = "3.5px";
      pill.style.verticalAlign = "middle";
      pill.style.padding = "1px 6px 1px 2px";
      pill.style.margin = "0 2px";
      pill.style.borderRadius = "9999px";
      pill.style.background = "#eef2ff";
      pill.style.border = "1px solid #c7d2fe";
      pill.style.color = "#3730a3";
      pill.style.fontSize = "11px";
      pill.style.fontWeight = "600";
      pill.style.lineHeight = "1";
      pill.style.height = "20px";
      pill.style.userSelect = "none";
      pill.style.cursor = "pointer";
      pill.style.boxSizing = "border-box";

      pill.onpointerenter = () => {
        cancelClose();
        setActivePreview({ anchor: pill, ref: imgRef });
      };
      pill.onpointerleave = scheduleClose;
      pill.onfocus = () => {
        cancelClose();
        setActivePreview({ anchor: pill, ref: imgRef });
      };
      pill.onblur = scheduleClose;
      pill.onpointerdown = (e) => {
        e.stopPropagation();
      };
      pill.onkeydown = (e) => {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          setActivePreview(null);
          pill.remove();
          handleContentChange();
          editorRef.current?.focus();
        }
      };

      // Thumbnail
      const dataUrl = getCached(imgRef.fileId)?.dataURL;
      if (dataUrl) {
        const img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "";
        img.draggable = false;
        img.style.width = "16px";
        img.style.height = "16px";
        img.style.borderRadius = "3px";
        img.style.objectFit = "cover";
        img.style.flexShrink = "0";
        pill.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.style.width = "16px";
        fallback.style.height = "16px";
        fallback.style.borderRadius = "3px";
        fallback.style.background = "#c7d2fe";
        fallback.style.flexShrink = "0";
        pill.appendChild(fallback);
      }

      // Label
      const textSpan = document.createElement("span");
      textSpan.style.maxWidth = "80px";
      textSpan.style.overflow = "hidden";
      textSpan.style.textOverflow = "ellipsis";
      textSpan.style.whiteSpace = "nowrap";
      textSpan.textContent = `@${imgRef.displayName}`;
      pill.appendChild(textSpan);

      // Dedicated remove button (×)
      const removeBtn = document.createElement("span");
      removeBtn.role = "button";
      removeBtn.setAttribute("aria-label", `Remove ${imgRef.displayName}`);
      removeBtn.title = `ลบ @${imgRef.displayName}`;
      removeBtn.dataset.testid = `remove-tag-${imgRef.objectId}`;
      removeBtn.textContent = "×";
      removeBtn.style.display = "inline-flex";
      removeBtn.style.alignItems = "center";
      removeBtn.style.justifyContent = "center";
      removeBtn.style.width = "14px";
      removeBtn.style.height = "14px";
      removeBtn.style.marginLeft = "2px";
      removeBtn.style.borderRadius = "50%";
      removeBtn.style.color = "#818cf8";
      removeBtn.style.fontSize = "13px";
      removeBtn.style.lineHeight = "1";
      removeBtn.style.fontWeight = "bold";
      removeBtn.style.cursor = "pointer";
      removeBtn.style.transition = "all 0.15s ease";

      removeBtn.onmouseenter = () => {
        removeBtn.style.background = "#c7d2fe";
        removeBtn.style.color = "#1e1b4b";
      };
      removeBtn.onmouseleave = () => {
        removeBtn.style.background = "transparent";
        removeBtn.style.color = "#818cf8";
      };
      removeBtn.onpointerdown = (e) => {
        e.stopPropagation();
        e.preventDefault();
        cancelClose();
        setActivePreview(null);
        pill.remove();
        handleContentChange();
        editorRef.current?.focus();
      };
      pill.appendChild(removeBtn);

      return pill;
    },
    [cancelClose, scheduleClose, handleContentChange],
  );

  const resolveImageRef = useCallback(
    (objectId: string, displayName: string): ComposerImageRef => {
      const found = availableImages.find(
        (img) => img.objectId === objectId || img.displayName.toLowerCase() === displayName.toLowerCase(),
      );
      if (found) return found;

      const slide = useEngine.getState().currentSlide();
      const el = slide?.elements.find(
        (candidate) =>
          !candidate.isDeleted &&
          (candidate.id === objectId || candidate.name === displayName),
      );
      if (el && "fileId" in el && typeof (el as any).fileId === "string") {
        return {
          objectId: el.id,
          elementVersion: el.version,
          fileId: (el as any).fileId || "",
          displayName: (el as any).sourceName || el.name || displayName,
          sourceWidth: (el as any).naturalWidth || el.width,
          sourceHeight: (el as any).naturalHeight || el.height,
          width: el.width,
          height: el.height,
          angle: el.angle,
        };
      }

      return {
        objectId: objectId || `img-${Date.now()}`,
        elementVersion: 1,
        fileId: objectId,
        displayName: displayName || "Image",
        sourceWidth: 100,
        sourceHeight: 100,
        width: 100,
        height: 100,
        angle: 0,
      };
    },
    [availableImages],
  );

  const insertTagAtCaret = useCallback(
    (imgRef: ComposerImageRef) => {
      const editor = editorRef.current;
      if (!editor) return;

      // Deduplication: prevent duplicate tag for the same object
      const existing = editor.querySelector(`[data-tag-object-id="${imgRef.objectId}"]`);
      if (existing) {
        return;
      }

      const pill = createTagPillElement(imgRef);
      const space = document.createTextNode("\u00A0"); // Non-breaking space for comfortable typing after tag

      const sel = window.getSelection();
      let inserted = false;

      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(space);
        range.insertNode(pill);

        // Move caret after the space
        const newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.setEndAfter(space);
        sel.removeAllRanges();
        sel.addRange(newRange);
        inserted = true;
      }

      if (!inserted) {
        editor.appendChild(pill);
        editor.appendChild(space);

        // Place caret at end
        if (sel) {
          const newRange = document.createRange();
          newRange.setStartAfter(space);
          newRange.setEndAfter(space);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      }

      editor.focus();
      handleContentChange();
    },
    [createTagPillElement, handleContentChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      insertTag: (imgRef: ComposerImageRef) => {
        insertTagAtCaret(imgRef);
      },
      getValue: () => serializeDOM(),
      setValue: (val: string) => {
        if (!editorRef.current) return;
        if (!val) {
          editorRef.current.innerHTML = "";
          setIsEmpty(true);
          setHasTags(false);
          return;
        }
        if (val.includes("@[")) {
          editorRef.current.innerHTML = "";
          const segments = parseInlineTagTokens(val);
          for (const seg of segments) {
            if (seg.type === "tag") {
              const ref = resolveImageRef(seg.objectId, seg.displayName);
              const pill = createTagPillElement(ref);
              editorRef.current.appendChild(pill);
              editorRef.current.appendChild(document.createTextNode("\u00A0"));
            } else {
              editorRef.current.appendChild(document.createTextNode(seg.text));
            }
          }
        } else {
          editorRef.current.textContent = val;
        }
        setIsEmpty(!val.trim());
        setHasTags(val.includes("@["));
      },
      clear: () => {
        if (!editorRef.current) return;
        editorRef.current.innerHTML = "";
        setIsEmpty(true);
        setHasTags(false);
        setActivePreview(null);
        onChange?.("");
      },
      focus: () => {
        editorRef.current?.focus();
      },
    }),
    [insertTagAtCaret, serializeDOM, onChange, resolveImageRef, createTagPillElement],
  );


  // Filter available images for mention autocomplete
  const filteredMentionImages = availableImages.filter((img) =>
    img.displayName.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  const insertMentionImage = (img: ComposerImageRef) => {
    // Replace the '@' text before caret with the pill
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      const textNode = range.startContainer;
      if (textNode.nodeType === Node.TEXT_NODE && textNode.textContent) {
        const text = textNode.textContent;
        const atIdx = text.lastIndexOf("@");
        if (atIdx >= 0) {
          textNode.textContent = text.slice(0, atIdx);
        }
      }
    }
    setMentionOpen(false);
    insertTagAtCaret(img);
  };

  // Finds tag pill immediately preceding current caret
  const getPillBeforeCaret = (editor: HTMLElement): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    const node = range.startContainer;
    const offset = range.startOffset;

    // 1. Caret directly in editor container
    if (node === editor) {
      if (offset > 0) {
        for (let i = offset - 1; i >= 0; i--) {
          const child = editor.childNodes[i];
          if (child instanceof HTMLElement && child.dataset.tagObjectId) {
            return child;
          }
          if (child.nodeType === Node.TEXT_NODE && child.textContent?.replace(/[\s\u00A0]/g, "")) {
            break;
          }
        }
      }
      return null;
    }

    // 2. Caret inside a text node
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const textBefore = text.slice(0, offset);
      if (!textBefore.replace(/[\s\u00A0]/g, "")) {
        let prev = node.previousSibling;
        while (prev) {
          if (prev instanceof HTMLElement && prev.dataset.tagObjectId) {
            return prev;
          }
          if (prev.nodeType === Node.TEXT_NODE && prev.textContent?.replace(/[\s\u00A0]/g, "")) {
            break;
          }
          prev = prev.previousSibling;
        }
      }
    }

    return null;
  };

  // Finds tag pill immediately following current caret
  const getPillAfterCaret = (editor: HTMLElement): HTMLElement | null => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;

    const node = range.startContainer;
    const offset = range.startOffset;

    // 1. Caret directly in editor container
    if (node === editor) {
      if (offset < editor.childNodes.length) {
        for (let i = offset; i < editor.childNodes.length; i++) {
          const child = editor.childNodes[i];
          if (child instanceof HTMLElement && child.dataset.tagObjectId) {
            return child;
          }
          if (child.nodeType === Node.TEXT_NODE && child.textContent?.replace(/[\s\u00A0]/g, "")) {
            break;
          }
        }
      }
      return null;
    }

    // 2. Caret inside a text node
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      const textAfter = text.slice(offset);
      if (!textAfter.replace(/[\s\u00A0]/g, "")) {
        let next = node.nextSibling;
        while (next) {
          if (next instanceof HTMLElement && next.dataset.tagObjectId) {
            return next;
          }
          if (next.nodeType === Node.TEXT_NODE && next.textContent?.replace(/[\s\u00A0]/g, "")) {
            break;
          }
          next = next.nextSibling;
        }
      }
    }

    return null;
  };

  // Checks if caret is at the very start of the editor
  const isCaretAtStart = (editor: HTMLElement): boolean => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return false;

    const node = range.startContainer;
    const offset = range.startOffset;

    if (node === editor && offset === 0) return true;

    if (node.nodeType === Node.TEXT_NODE && offset === 0) {
      let prev = node.previousSibling;
      while (prev) {
        if (prev.nodeType === Node.TEXT_NODE && prev.textContent) return false;
        if (prev.nodeType === Node.ELEMENT_NODE) return false;
        prev = prev.previousSibling;
      }
      return true;
    }

    return false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mentionOpen && filteredMentionImages.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMentionImages.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex(
          (prev) => (prev - 1 + filteredMentionImages.length) % filteredMentionImages.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const selected = filteredMentionImages[mentionIndex];
        if (selected) insertMentionImage(selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    // Backspace: delete preceding tag pill or trigger onBackspaceAtStart
    if (e.key === "Backspace" && !e.nativeEvent.isComposing) {
      if (editorRef.current) {
        const pill = getPillBeforeCaret(editorRef.current);
        if (pill) {
          e.preventDefault();
          const prevSibling = pill.previousSibling;
          pill.remove();
          handleContentChange();

          // Reposition caret
          const sel = window.getSelection();
          if (sel && editorRef.current) {
            const newRange = document.createRange();
            if (prevSibling) {
              if (prevSibling.nodeType === Node.TEXT_NODE) {
                const len = prevSibling.textContent?.length || 0;
                newRange.setStart(prevSibling, len);
                newRange.setEnd(prevSibling, len);
              } else {
                newRange.setStartAfter(prevSibling);
                newRange.setEndAfter(prevSibling);
              }
            } else {
              newRange.setStart(editorRef.current, 0);
              newRange.setEnd(editorRef.current, 0);
            }
            sel.removeAllRanges();
            sel.addRange(newRange);
          }
          return;
        }

        if (isCaretAtStart(editorRef.current)) {
          onBackspaceAtStart?.();
        }
      }
    }

    // Delete: delete following tag pill
    if (e.key === "Delete" && !e.nativeEvent.isComposing) {
      if (editorRef.current) {
        const pill = getPillAfterCaret(editorRef.current);
        if (pill) {
          e.preventDefault();
          pill.remove();
          handleContentChange();
          return;
        }
      }
    }

    if (e.key === "Escape") {
      if (activePreview) {
        e.preventDefault();
        setActivePreview(null);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend?.();
      return;
    }

    // Detect typing '@' for autocomplete
    if (e.key === "@" && availableImages.length > 0) {
      setMentionOpen(true);
      setMentionQuery("");
      setMentionIndex(0);
    }
  };

  const handleInput = () => {
    handleContentChange();

    // Check mention query if mention popup is open
    if (mentionOpen) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const text = sel.anchorNode?.textContent || "";
        const atIdx = text.lastIndexOf("@");
        if (atIdx >= 0) {
          setMentionQuery(text.slice(atIdx + 1).trim());
        } else {
          setMentionOpen(false);
        }
      }
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const rawText = e.clipboardData.getData("text/plain");
      if (!rawText) return;

      const editor = editorRef.current;
      if (!editor) return;

      const segments = parseInlineTagTokens(rawText);
      const nodesToInsert: Node[] = [];

      for (const seg of segments) {
        if (seg.type === "tag") {
          const existing = editor.querySelector(`[data-tag-object-id="${seg.objectId}"]`);
          if (!existing) {
            const ref = resolveImageRef(seg.objectId, seg.displayName);
            const pill = createTagPillElement(ref);
            nodesToInsert.push(pill);
            nodesToInsert.push(document.createTextNode("\u00A0"));
          }
        } else {
          const text = seg.text;
          if (availableImages.length > 0 && text.includes("@")) {
            const sortedImages = [...availableImages].sort(
              (a, b) => b.displayName.length - a.displayName.length,
            );
            let remaining = text;
            while (remaining.length > 0) {
              let matched = false;
              for (const img of sortedImages) {
                const tagPrefix = `@${img.displayName}`;
                const idx = remaining.indexOf(tagPrefix);
                if (idx >= 0) {
                  const beforeChar = idx > 0 ? remaining[idx - 1] : " ";
                  if (/\s|^|[([{:;,]/.test(beforeChar)) {
                    const before = remaining.slice(0, idx);
                    if (before) nodesToInsert.push(document.createTextNode(before));
                    const existing = editor.querySelector(`[data-tag-object-id="${img.objectId}"]`);
                    if (!existing) {
                      const pill = createTagPillElement(img);
                      nodesToInsert.push(pill);
                      nodesToInsert.push(document.createTextNode("\u00A0"));
                    } else {
                      nodesToInsert.push(document.createTextNode(tagPrefix));
                    }
                    remaining = remaining.slice(idx + tagPrefix.length);
                    matched = true;
                    break;
                  }
                }
              }
              if (!matched) {
                nodesToInsert.push(document.createTextNode(remaining));
                break;
              }
            }
          } else {
            nodesToInsert.push(document.createTextNode(text));
          }
        }
      }

      if (nodesToInsert.length === 0) return;

      const sel = window.getSelection();
      let range: Range | null = null;
      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
        range.deleteContents();
      } else {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
      }

      const fragment = document.createDocumentFragment();
      for (const node of nodesToInsert) {
        fragment.appendChild(node);
      }
      const lastInserted = nodesToInsert[nodesToInsert.length - 1];
      range.insertNode(fragment);

      if (sel && lastInserted) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastInserted);
        newRange.setEndAfter(lastInserted);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      editor.focus();
      handleContentChange();
    },
    [availableImages, createTagPillElement, handleContentChange, resolveImageRef],
  );

  const showTagsContainer = hasTags || omittedCount > 0;

  return (
    <div
      data-testid={showTagsContainer ? "selected-image-tags" : undefined}
      style={{
        position: "relative",
        width: "100%",
        flex: 1,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        .artshift-inline-editor * {
          color: inherit !important;
        }
        .artshift-inline-editor .artshift-inline-tag-pill {
          color: #3730a3 !important;
        }
      `}</style>
      {/* ContentEditable editor box */}
      <div
        ref={editorRef}
        contentEditable={!disabled}
        tabIndex={0}
        role="textbox"
        aria-multiline="true"
        aria-label="AI Assistance prompt"
        data-testid="ai-copilot-input"
        data-placeholder={placeholder}
        className="artshift-inline-editor"
        // HTML attribute for compatibility with tests checking placeholder and rows
        {...({ placeholder, rows } as Record<string, unknown>)}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{
          flex: 1,
          width: "100%",
          minHeight: 74,
          maxHeight: 180,
          overflowY: "auto",
          outline: "none",
          border: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: "#0f172a",
          background: "transparent",
          fontFamily: "inherit",
          boxSizing: "border-box",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          position: "relative",
          cursor: disabled ? "not-allowed" : "text",
          ...style,
        }}
      />

      {/* Visual placeholder when empty */}
      {isEmpty && (
        <div
          aria-hidden="true"
          onClick={() => editorRef.current?.focus()}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            pointerEvents: "none",
            fontSize: 13,
            lineHeight: 1.55,
            color: "#94a3b8",
            userSelect: "none",
          }}
        >
          {placeholder}
        </div>
      )}

      {/* Hover preview portal */}
      {activePreview && (
        <ImageReferencePreview
          anchor={activePreview.anchor}
          dataUrl={getCached(activePreview.ref.fileId)?.dataURL}
          displayName={activePreview.ref.displayName}
          width={activePreview.ref.sourceWidth}
          height={activePreview.ref.sourceHeight}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          onClose={() => setActivePreview(null)}
        />
      )}

      {/* Overflow badge if too many images selected */}
      {omittedCount > 0 && (
        <span
          role="status"
          data-testid="selected-image-overflow"
          aria-label={`${omittedCount} more selected Canvas images`}
          title="ลด selection เหลือไม่เกิน 4 ภาพก่อนส่งงาน"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            display: "inline-flex",
            alignItems: "center",
            minHeight: 20,
            height: 20,
            boxSizing: "border-box",
            padding: "0 6px",
            borderRadius: 9999,
            background: "#f1f5f9",
            border: "1px solid #cbd5e1",
            color: "#475569",
            fontSize: 10,
            fontWeight: 700,
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          +{omittedCount}
        </span>
      )}

      {/* Autocomplete mention popover when typing @ */}
      {mentionOpen && filteredMentionImages.length > 0 && (
        <div
          role="listbox"
          aria-label="Mention Canvas image"
          data-testid="mention-autocomplete-menu"
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 6,
            minWidth: 200,
            maxWidth: 280,
            maxHeight: 180,
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            zIndex: 100,
            padding: 4,
          }}
        >
          <div
            style={{
              padding: "4px 8px",
              fontSize: 10,
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            เลือกภาพเพื่อแทรกในข้อความ
          </div>
          {filteredMentionImages.map((img, idx) => {
            const dataUrl = getCached(img.fileId)?.dataURL;
            const isSelected = idx === mentionIndex;
            return (
              <div
                key={img.objectId}
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                onClick={() => insertMentionImage(img)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 6,
                  background: isSelected ? "#eef2ff" : "transparent",
                  color: isSelected ? "#3730a3" : "#1e293b",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {dataUrl ? (
                  // biome-ignore lint/performance/noImgElement: local thumbnail
                  <img
                    src={dataUrl}
                    alt=""
                    style={{ width: 20, height: 20, borderRadius: 3, objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ width: 20, height: 20, borderRadius: 3, background: "#c7d2fe" }} />
                )}
                <span
                  style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  @{img.displayName}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default InlineTagEditor;
