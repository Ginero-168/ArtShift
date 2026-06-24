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
import { createImage } from "@/lib/engine/factory";
import { fileToDataURL, getImageCache, loadDataURL } from "@/lib/engine/imageCache";
import { useEngine } from "@/lib/engine/store";

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

    async function handleFiles(files: FileList | null, world: { x: number; y: number }) {
      if (!files) return;
      const { w: sw, h: sh } = currentSlideSize();
      for (const file of Array.from(files)) {
        // PDF import (Lumen feature)
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const { importPdfToImages } = await import("@/lib/import/pdfImport");
          const images = await importPdfToImages(file, 2);
          for (let i = 0; i < images.length; i++) {
            const dataURL = images[i];
            const entry = await loadDataURL(dataURL);
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

        if (!file.type.startsWith("image/")) continue;
        const dataURL = await fileToDataURL(file);
        const entry = await loadDataURL(dataURL);
        const maxW = sw / 2;
        const maxH = sh / 2;
        const ratio = Math.min(maxW / entry.width, maxH / entry.height, 1);
        const w = entry.width * ratio;
        const h = entry.height * ratio;
        addElement(
          createImage({
            x: world.x - w / 2,
            y: world.y - h / 2,
            width: w,
            height: h,
            fileId: entry.fileId,
            naturalWidth: entry.width,
            naturalHeight: entry.height,
          }),
          "paste image",
        );
      }
    }

    function onPaste(e: ClipboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      const { w: sw, h: sh } = currentSlideSize();
      handleFiles(dt.files, { x: sw / 2, y: sh / 2 });
    }

    function onDrop(e: DragEvent) {
      e.preventDefault();
      if (!e.dataTransfer?.files?.length) return;
      const world = clientToWorld(e.clientX, e.clientY);
      handleFiles(e.dataTransfer.files, world);
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault();
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
