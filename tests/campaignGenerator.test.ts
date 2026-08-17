import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_COVER_DATA_URL, generateCampaignBatch } from "../lib/campaign/generator";
import {
  autoDetectColumnMapping,
  parseCSV,
  recordsFromMappedRows,
  SAMPLE_CAMPAIGNS,
} from "../lib/campaign/parser";
import { type BookCampaignRecord, CAMPAIGN_CHANNELS } from "../lib/campaign/types";

describe("Campaign Batch Slide Generator", () => {
  const sampleCsv = SAMPLE_CAMPAIGNS[0].csv;
  const { headers, rows } = parseCSV(sampleCsv);
  const mapping = autoDetectColumnMapping(headers);
  const records = recordsFromMappedRows(headers, rows, mapping).map((r) => ({
    ...r,
    coverUrl: DEFAULT_BOOK_COVER_DATA_URL,
  }));

  it("generates correct number of slides across books and selected channels", async () => {
    const selectedChannels = [
      CAMPAIGN_CHANNELS.find((c) => c.id === "feed-square")!,
      CAMPAIGN_CHANNELS.find((c) => c.id === "story-vertical")!,
      CAMPAIGN_CHANNELS.find((c) => c.id === "banner-landscape")!,
    ];

    const batch = await generateCampaignBatch(records, "launch-hero", selectedChannels, "warm");

    // 3 books * 3 channels = 9 slides
    expect(batch.length).toBe(9);

    const firstSlide = batch[0].slide;
    expect(firstSlide.width).toBe(1080);
    expect(firstSlide.height).toBe(1080);
    expect(firstSlide.elements.length).toBeGreaterThan(3);
    expect(firstSlide.layers.length).toBe(1);

    const verticalSlide = batch[1].slide;
    expect(verticalSlide.width).toBe(1080);
    expect(verticalSlide.height).toBe(1920);

    const bannerSlide = batch[2].slide;
    expect(bannerSlide.width).toBe(1920);
    expect(bannerSlide.height).toBe(1080);
  });

  it("supports all 4 campaign templates without errors", async () => {
    const channel = [CAMPAIGN_CHANNELS[0]];
    const oneBook: BookCampaignRecord[] = [records[0]];

    const templates = ["launch-hero", "sale-promo", "showcase-3d", "quote-review"] as const;

    for (const tmpl of templates) {
      const res = await generateCampaignBatch(oneBook, tmpl, channel, "warm");
      expect(res.length).toBe(1);
      expect(res[0].slide.elements.length).toBeGreaterThan(0);
    }
  });

  it("creates 3D book mockup element on 3D showcase template", async () => {
    const channel = [CAMPAIGN_CHANNELS[0]];
    const oneBook: BookCampaignRecord[] = [records[0]];

    const res = await generateCampaignBatch(oneBook, "showcase-3d", channel, "dark");
    const mockupEl = res[0].slide.elements.find((el) => el.type === "bookMockup");
    expect(mockupEl).toBeDefined();
    expect(mockupEl?.type).toBe("bookMockup");
  });
});
