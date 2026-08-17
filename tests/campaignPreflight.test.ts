import { describe, expect, it } from "vitest";
import { DEFAULT_BOOK_COVER_DATA_URL, generateCampaignBatch } from "../lib/campaign/generator";
import { runCampaignPreflight } from "../lib/campaign/preflight";
import { type BookCampaignRecord, CAMPAIGN_CHANNELS } from "../lib/campaign/types";

describe("Campaign Preflight QA", () => {
  const channel = [CAMPAIGN_CHANNELS[0]];

  it("passes cleanly on valid book record with cover", async () => {
    const validBook: BookCampaignRecord[] = [
      {
        id: "book-1",
        isbn: "9786161852011",
        title: "กาลครั้งหนึ่งถึงเธอ",
        author: "คิดมาก",
        listPrice: "295",
        salePrice: "249",
        coverUrl: DEFAULT_BOOK_COVER_DATA_URL,
      },
    ];

    const batch = await generateCampaignBatch(validBook, "launch-hero", channel, "warm");
    const report = runCampaignPreflight(batch);

    expect(report.totalItems).toBe(1);
    expect(report.errorCount).toBe(0);
    expect(report.scorePercent).toBeGreaterThanOrEqual(90);
  });

  it("flags warning on missing coverUrl", async () => {
    const noCoverBook: BookCampaignRecord[] = [
      {
        id: "book-2",
        isbn: "9786161852012",
        title: "ไม่มีรูปปก",
        author: "ผู้แต่งทดสอบ",
        salePrice: "199",
        coverUrl: "",
      },
    ];

    const batch = await generateCampaignBatch(noCoverBook, "launch-hero", channel, "warm");
    const report = runCampaignPreflight(batch);

    expect(report.warningCount).toBeGreaterThan(0);
    const coverIssue = report.issues.find((i) => i.field === "coverUrl");
    expect(coverIssue).toBeDefined();
    expect(coverIssue?.severity).toBe("warning");
  });

  it("flags error on sale promo template without price", async () => {
    const noPriceBook: BookCampaignRecord[] = [
      {
        id: "book-3",
        isbn: "9786161852013",
        title: "หนังสือไม่มีราคา",
        author: "ผู้แต่ง",
        coverUrl: DEFAULT_BOOK_COVER_DATA_URL,
      },
    ];

    const batch = await generateCampaignBatch(noPriceBook, "sale-promo", channel, "vibrant");
    const report = runCampaignPreflight(batch);

    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.status).toBe("errors");
  });
});
