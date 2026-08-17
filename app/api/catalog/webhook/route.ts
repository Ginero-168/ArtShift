import { type NextRequest, NextResponse } from "next/server";
import { generateCampaignBatch } from "@/lib/campaign/generator";
import { runCampaignPreflight } from "@/lib/campaign/preflight";
import { CAMPAIGN_CHANNELS, type CampaignTemplateId } from "@/lib/campaign/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body || !Array.isArray(body.books) || body.books.length === 0) {
      return NextResponse.json(
        {
          error:
            "Invalid payload: 'books' array is required and must contain at least 1 book record.",
        },
        { status: 400 },
      );
    }

    const books = body.books;
    const templateId: CampaignTemplateId = body.templateId ?? "launch-hero";
    const requestedChannelIds: string[] = body.channels ?? [
      "feed-square",
      "story-vertical",
      "banner-landscape",
    ];

    const channels = CAMPAIGN_CHANNELS.filter((c) => requestedChannelIds.includes(c.id));
    if (channels.length === 0) {
      return NextResponse.json(
        { error: "No valid channels matched the requested channel IDs." },
        { status: 400 },
      );
    }

    // Generate batch creative items
    const batchItems = await generateCampaignBatch(books, templateId, channels);
    const preflight = runCampaignPreflight(batchItems);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalBooks: books.length,
        totalChannels: channels.length,
        totalCreatives: batchItems.length,
        templateId,
      },
      preflight: {
        scorePercent: preflight.scorePercent,
        passedCount: preflight.passedCount,
        warningCount: preflight.warningCount,
        errorCount: preflight.errorCount,
        issues: preflight.issues,
      },
      creatives: batchItems.map((item) => ({
        slideId: item.slide.id,
        slideName: item.slide.name,
        isbn: item.book.isbn,
        title: item.book.title,
        channel: item.channel.id,
        width: item.channel.width,
        height: item.channel.height,
        ratio: item.channel.ratio,
        elementCount: item.slide.elements.length,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: "Failed to process catalog webhook",
        message,
      },
      { status: 500 },
    );
  }
}
