"use client";

/**
 * Image paste/drop hook.
 *
 * Listens for `paste` on the window and `drop` on the supplied container.
 * For each image File found, decodes it, registers in the image cache, and
 * inserts an `ImageElement` at the drop point (or slide center for paste).
 * Aspect ratio is preserved; oversized images are scaled to fit half the
 * slide width.
 */

import { useEffect } from "react";
import { BUILDER_BLOCK_MIME, createBuilderBlock, isBuilderBlockKind } from "@/lib/builder/blocks";
import { createImage, createText } from "@/lib/engine/factory";
import {
  fileToDataURL,
  getCached,
  getImageCache,
  isSupportedImageFile,
  loadDataURL,
} from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";
import { enqueueAssetAnalysis } from "@/lib/vision/assetAnalysisBrowser";

export function usePasteDrop(
  container: React.RefObject<HTMLElement | null>,
  clientToWorld: (x: number, y: number) => { x: number; y: number },
) {
  const addElement = useEngine((s) => s.addElement);
  const addSlide = useEngine((s) => s.addSlide);
  const setCurrentSlide = useEngine((s) => s.setCurrentSlide);

  useEffect(() => {
    function currentSlideSize() {
      const st = useEngine.getState();
      const slide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
      return { w: slide?.width ?? 1920, h: slide?.height ?? 1080 };
    }

    async function handleImageEntry(
      entry: { fileId: string; dataURL: string; width: number; height: number },
      world: { x: number; y: number },
      sourceDescription = "drop image",
    ) {
      enqueueAssetAnalysis({
        fileId: entry.fileId,
        dataURL: entry.dataURL,
        width: entry.width,
        height: entry.height,
      });

      const st = useEngine.getState();
      const currentSlide = st.doc.slides.find((sl) => sl.id === st.currentSlideId);
      const targetFrame = currentSlide?.elements.find(
        (el) =>
          !el.isDeleted &&
          el.type === "frame" &&
          // Occupied frames reject external drops until Detach.
          !el.imageFileId &&
          world.x >= el.x &&
          world.x <= el.x + el.width &&
          world.y >= el.y &&
          world.y <= el.y + el.height,
      );

      if (targetFrame) {
        st.setFrameImage(targetFrame.id, entry.fileId);
        st.selectOnly([targetFrame.id]);
        return;
      }

      const { w: sw, h: sh } = currentSlideSize();
      const maxW = sw / 2;
      const maxH = sh / 2;
      const ratio = Math.min(maxW / entry.width, maxH / entry.height, 1);
      const w = entry.width * ratio;
      const h = entry.height * ratio;
      const element = createImage({
        x: world.x - w / 2,
        y: world.y - h / 2,
        width: w,
        height: h,
        fileId: entry.fileId,
        naturalWidth: entry.width,
        naturalHeight: entry.height,
      });
      addElement(element, sourceDescription);
      st.selectOnly([element.id]);
    }

    async function handleFiles(files: FileList | null, world: { x: number; y: number }) {
      if (!files) return;
      const { w: sw, h: sh } = currentSlideSize();
      for (const file of Array.from(files)) {
        // PDF import
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const { importPdfToImages } = await import("@/lib/import/pdfImport");
          const images = await importPdfToImages(file, 2);
          for (let i = 0; i < images.length; i++) {
            const dataURL = images[i];
            const entry = await loadDataURL(dataURL);
            enqueueAssetAnalysis({
              fileId: entry.fileId,
              dataURL: entry.dataURL,
              width: entry.width,
              height: entry.height,
            });
            const { w: csw, h: csh } = currentSlideSize();
            const maxW = csw * 0.9;
            const maxH = csh * 0.9;
            const ratio = Math.min(maxW / entry.width, maxH / entry.height, 1);
            const w = entry.width * ratio;
            const h = entry.height * ratio;
            const x = (csw - w) / 2;
            const y = (csh - h) / 2;
            // First page goes to current slide; subsequent pages get new slides
            if (i > 0) {
              const newSlideId = addSlide();
              setCurrentSlide(newSlideId);
            }
            addElement(
              createImage({
                x,
                y,
                width: w,
                height: h,
                fileId: entry.fileId,
                naturalWidth: entry.width,
                naturalHeight: entry.height,
              }),
              "import pdf page",
            );
          }
          continue;
        }

        if (!isSupportedImageFile(file)) continue;
        const dataURL = await fileToDataURL(file);
        const entry = await loadDataURL(dataURL);
        await handleImageEntry(entry, world, "paste image");
      }
    }

    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (t?.closest?.("input, textarea, select, [contenteditable='true']")) return;

      const cd = e.clipboardData;
      if (!cd) return;

      const { w: sw, h: sh } = currentSlideSize();
      const center = { x: sw / 2, y: sh / 2 };

      // 1) Image / PDF files from the OS clipboard (explicit file paste wins)
      const files: File[] = [];
      for (const it of Array.from(cd.items ?? [])) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        const dt = new DataTransfer();
        for (const f of files) dt.items.add(f);
        void handleFiles(dt.files, center);
        return;
      }

      // 2) In-app element clipboard (Copy/Cut inside the editor) — must beat
      // leftover OS text/HTML so Cut/Copy → switch slide → Paste works.
      const engineClipboard = useEngine.getState().clipboard;
      if (engineClipboard?.length) {
        e.preventDefault();
        useEngine.getState().pasteElements();
        return;
      }

      // 3) HTML payload: embedded <img>, or inline SVG rendered as an image
      const html = cd.getData("text/html");
      if (html) {
        const imgSrc = htmlToFirstImgSrc(html);
        if (imgSrc && /^(https?:|data:|blob:)/i.test(imgSrc)) {
          e.preventDefault();
          void loadDataURL(imgSrc)
            .then((entry) => handleImageEntry(entry, center, "paste image"))
            .catch((err) => console.error("Failed to paste HTML image:", err));
          return;
        }
        const svgText = extractSvgMarkup(html) ?? null;
        if (svgText) {
          e.preventDefault();
          const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
          void loadDataURL(dataURL)
            .then((entry) => handleImageEntry(entry, center, "paste svg"))
            .catch((err) => console.error("Failed to paste SVG:", err));
          return;
        }
      }

      // 4) Direct image/svg+xml clipboard type
      const svgDirect = cd.getData("image/svg+xml");
      if (svgDirect?.trim()) {
        e.preventDefault();
        const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDirect)}`;
        void loadDataURL(dataURL)
          .then((entry) => handleImageEntry(entry, center, "paste svg"))
          .catch((err) => console.error("Failed to paste SVG:", err));
        return;
      }

      // 5) Plain text → text element on the slide
      const text = cd.getData("text/plain");
      if (text?.trim()) {
        const trimmed = text.trim();
        if (/^(https?:|data:image\/|blob:)/i.test(trimmed) && !/\s/.test(trimmed)) {
          e.preventDefault();
          void loadDataURL(trimmed)
            .then((entry) => handleImageEntry(entry, center, "paste image url"))
            .catch(() => {
              pastePlainText(trimmed, center);
            });
          return;
        }
        e.preventDefault();
        pastePlainText(trimmed, center);
      }
    }

    function pastePlainText(text: string, world: { x: number; y: number }) {
      const lines = text.replace(/\r\n?/g, "\n").split("\n");
      const longest = lines.reduce((max, line) => Math.max(max, line.length), 1);
      const fontSize = 24;
      const width = Math.min(720, Math.max(160, longest * fontSize * 0.55));
      const element = createText({
        x: world.x - width / 2,
        y: world.y - 20,
        text,
        fontSize,
        width,
      });
      addElement(element, "paste text");
      useEngine.getState().selectOnly([element.id]);
    }

    /** Pull the first inline <svg>…</svg> out of an HTML clipboard fragment. */
    function extractSvgMarkup(html: string): string | null {
      const match = /<svg\b[^>]*>[\s\S]*?<\/svg>/i.exec(html);
      return match?.[0] ?? null;
    }

    function htmlToFirstImgSrc(html: string): string | null {
      const match = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(html);
      return match?.[1] || match?.[2] || match?.[3] || null;
    }

    async function onDrop(e: DragEvent) {
      e.preventDefault();
      const world = clientToWorld(e.clientX, e.clientY);

      // 1. Builder block drop
      const blockKind = e.dataTransfer?.getData(BUILDER_BLOCK_MIME) ?? "";
      if (isBuilderBlockKind(blockKind)) {
        const state = useEngine.getState();
        const slide = state.doc.slides.find((candidate) => candidate.id === state.currentSlideId);
        if (!slide) return;
        const point = world;
        const element = createBuilderBlock(blockKind, {
          width: slide.width,
          height: slide.height,
          point,
        });
        addElement(element, `drop ${blockKind}`);
        return;
      }

      // 2. Chat image or in-app dragged image drop
      const chatImageRaw =
        e.dataTransfer?.getData("application/x-artshift-chat-image") ||
        e.dataTransfer?.getData("application/x-artshift-image");
      const artshiftFileId = e.dataTransfer?.getData("artshift/file-id");
      const uriList = e.dataTransfer?.getData("text/uri-list");
      const textPlain = e.dataTransfer?.getData("text/plain");

      let fileId = artshiftFileId || "";
      let imageUrl = "";

      if (chatImageRaw) {
        try {
          const parsed = JSON.parse(chatImageRaw);
          fileId = parsed.fileId || fileId;
          imageUrl = parsed.url || imageUrl;
        } catch {}
      }

      if (!imageUrl && uriList) {
        imageUrl = uriList;
      } else if (
        !imageUrl &&
        textPlain &&
        (textPlain.startsWith("data:image/") ||
          textPlain.startsWith("http://") ||
          textPlain.startsWith("https://") ||
          textPlain.startsWith("blob:"))
      ) {
        imageUrl = textPlain;
      }

      if (fileId || imageUrl) {
        let entry = fileId ? getCached(fileId) : null;
        if (!entry && (imageUrl || fileId)) {
          try {
            entry = await loadDataURL(imageUrl || fileId);
          } catch (err) {
            console.error("Failed to load dropped chat image:", err);
          }
        }

        if (entry) {
          await handleImageEntry(entry, world, "drop image from chat");
          return;
        }
      }

      // 3. OS file drop
      if (!e.dataTransfer?.files?.length) return;
      handleFiles(e.dataTransfer.files, world);
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    }

    const el = container.current;
    window.addEventListener("paste", onPaste);
    el?.addEventListener("drop", onDrop);
    el?.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("paste", onPaste);
      el?.removeEventListener("drop", onDrop);
      el?.removeEventListener("dragover", onDragOver);
    };
  }, [addElement, addSlide, clientToWorld, container, setCurrentSlide]);

  // Re-export cache getter so consumers can pass it to CanvasRoot.
  return { getImageCache };
}
