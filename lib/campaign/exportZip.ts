/**
 * Batch Campaign ZIP Exporter.
 * Packages high-resolution artwork variants into structured ZIP archives
 * with metadata manifests and summary reports.
 */

import JSZip from "jszip";
import { exportSlideToPNG } from "../engine/exportPNG";
import { getImageCache } from "../engine/imageCache";
import type { GeneratedBatchItem } from "./generator";
import type { BatchExportProgress } from "./types";

export type ZipFolderStructure = "by-book" | "by-channel" | "flat";

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

export async function exportCampaignBatchToZip(
  batchItems: GeneratedBatchItem[],
  options: {
    campaignName?: string;
    folderStructure?: ZipFolderStructure;
    scale?: number;
    onProgress?: (p: BatchExportProgress) => void;
  } = {},
): Promise<Blob> {
  const {
    campaignName = "book-campaign",
    folderStructure = "by-book",
    scale = 1.5,
    onProgress,
  } = options;

  const zip = new JSZip();
  const images = getImageCache();
  const total = batchItems.length;

  const manifestItems: Array<{
    isbn: string;
    title: string;
    author: string;
    channel: string;
    ratio: string;
    width: number;
    height: number;
    filename: string;
  }> = [];

  const csvRows: string[][] = [
    ["ISBN", "Title", "Author", "Channel", "Ratio", "Width", "Height", "FilePath"],
  ];

  for (let i = 0; i < total; i++) {
    const item = batchItems[i];
    const { slide, book, channel } = item;

    onProgress?.({
      total,
      completed: i,
      currentName: `${book.title} (${channel.name})`,
      status: "rendering",
    });

    // Render PNG blob
    const pngBlob = await exportSlideToPNG(slide, slide.width, slide.height, images, scale);

    const safeIsbn = sanitizeFilename(book.isbn || "no-isbn");
    const safeTitle = sanitizeFilename(book.title || "book");
    const safeRatio = sanitizeFilename(channel.ratio.replace(":", "x"));
    const safeChannel = sanitizeFilename(channel.id);

    let filePath = "";
    const filename = `${safeIsbn}_${safeRatio}_${slide.width}x${slide.height}.png`;

    if (folderStructure === "by-book") {
      const bookFolder = `${safeIsbn}-${safeTitle}`;
      filePath = `${bookFolder}/${filename}`;
    } else if (folderStructure === "by-channel") {
      filePath = `${safeChannel}/${safeIsbn}_${safeTitle}.png`;
    } else {
      filePath = `${safeIsbn}_${safeTitle}_${safeRatio}.png`;
    }

    zip.file(filePath, pngBlob);

    manifestItems.push({
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      channel: channel.name,
      ratio: channel.ratio,
      width: slide.width,
      height: slide.height,
      filename: filePath,
    });

    csvRows.push([
      `"${(book.isbn || "").replace(/"/g, '""')}"`,
      `"${(book.title || "").replace(/"/g, '""')}"`,
      `"${(book.author || "").replace(/"/g, '""')}"`,
      `"${channel.name}"`,
      `"${channel.ratio}"`,
      String(slide.width),
      String(slide.height),
      `"${filePath}"`,
    ]);
  }

  onProgress?.({
    total,
    completed: total,
    currentName: "Generating Manifest & ZIP...",
    status: "packaging",
  });

  // Add Manifest JSON
  const manifest = {
    generatedAt: new Date().toISOString(),
    campaignName,
    totalArtworks: total,
    artworks: manifestItems,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Add Summary CSV
  const csvContent = csvRows.map((r) => r.join(",")).join("\n");
  zip.file("summary.csv", "\uFEFF" + csvContent); // add UTF-8 BOM for Excel compatibility

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  onProgress?.({
    total,
    completed: total,
    currentName: "Completed",
    status: "done",
  });

  // Trigger Download in browser
  if (typeof document !== "undefined") {
    const url = URL.createObjectURL(zipBlob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sanitizeFilename(campaignName)}-creative-pack.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return zipBlob;
}
