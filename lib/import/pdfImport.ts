/**
 * PDF Import — render PDF pages as raster images using pdfjs-dist.
 * Returns an array of data URLs, one per page.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { RenderParameters } from "pdfjs-dist/types/src/display/api";

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${(pdfjsLib as unknown as { version: string }).version}/build/pdf.worker.min.mjs`;

export async function importPdfToImages(file: File, scale = 2): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const _ctx = canvas.getContext("2d")!;
    // pdfjs-dist v5 requires 'canvas' field, not 'canvasContext'
    const renderContext = { canvas, viewport } as RenderParameters;
    await page.render(renderContext).promise;
    images.push(canvas.toDataURL("image/png"));
  }

  return images;
}
