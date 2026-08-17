/**
 * Batch Slide Generator for Book Campaign Production.
 */

import { loadDataURL } from "../engine/imageCache";
import { createEngineLayer } from "../engine/layers";
import type { EngineSlide } from "../engine/types";
import { buildCampaignSlide } from "./templates";
import type {
  BookCampaignRecord,
  CampaignChannelSpec,
  CampaignTemplateId,
  CampaignTemplateTheme,
} from "./types";

/** Placeholder 600x870 book cover SVG data URL used when no cover is provided. */
export const DEFAULT_BOOK_COVER_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="870" viewBox="0 0 600 870">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </linearGradient>
    </defs>
    <rect width="600" height="870" fill="url(#g)" rx="16"/>
    <rect x="24" y="24" width="552" height="822" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3" rx="10"/>
    <circle cx="300" cy="360" r="80" fill="rgba(255,255,255,0.1)"/>
    <path d="M270 360l20-20 40 40" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round"/>
    <text x="300" y="490" fill="#ffffff" font-size="34" font-weight="bold" font-family="sans-serif" text-anchor="middle">BOOK COVER</text>
    <text x="300" y="530" fill="rgba(255,255,255,0.7)" font-size="20" font-family="sans-serif" text-anchor="middle">ArtShift Studio</text>
  </svg>
`);

export type GeneratedBatchItem = {
  slide: EngineSlide;
  book: BookCampaignRecord;
  channel: CampaignChannelSpec;
  templateId: CampaignTemplateId;
};

async function safeLoadCover(url: string, defaultFileId: string): Promise<string> {
  try {
    const loadPromise = loadDataURL(url);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Cover load timeout")), 800),
    );
    const entry = await Promise.race([loadPromise, timeoutPromise]);
    return entry.fileId;
  } catch (_err) {
    return defaultFileId;
  }
}

export async function generateCampaignBatch(
  books: BookCampaignRecord[],
  templateId: CampaignTemplateId,
  channels: CampaignChannelSpec[],
  themeChoice?: CampaignTemplateTheme,
): Promise<GeneratedBatchItem[]> {
  const items: GeneratedBatchItem[] = [];

  // Pre-load default cover
  const defaultEntry = await loadDataURL(DEFAULT_BOOK_COVER_DATA_URL);

  for (const book of books) {
    let coverFileId = defaultEntry.fileId;
    if (book.coverUrl) {
      coverFileId = await safeLoadCover(book.coverUrl, defaultEntry.fileId);
    }

    const masterId = crypto.randomUUID();

    for (let cIdx = 0; cIdx < channels.length; cIdx++) {
      const channel = channels[cIdx];
      const result = buildCampaignSlide(templateId, book, channel, coverFileId, themeChoice);

      const layer = createEngineLayer("free", {
        name: `${channel.name} Elements`,
        z: 1,
      });
      layer.objectIds = result.elements.map((el) => el.id);

      const slide: EngineSlide = {
        id: crypto.randomUUID(),
        name: `${book.isbn || book.id} — ${book.title} [${channel.ratio}]`,
        variantOf: cIdx === 0 ? undefined : masterId,
        variantLabel: channel.badge,
        background: result.background,
        elements: result.elements,
        layers: [layer],
        width: channel.width,
        height: channel.height,
      };

      items.push({
        slide,
        book,
        channel,
        templateId,
      });
    }
  }

  return items;
}
