import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { generateCampaignBatch } from "@/lib/campaign/generator";
import { runCampaignPreflight } from "@/lib/campaign/preflight";
import { CAMPAIGN_CHANNELS, type CampaignTemplateId } from "@/lib/campaign/types";
import { RequestBodyTooLargeError, readBoundedJson } from "@/lib/server/ai/requestBody";

export const dynamic = "force-dynamic";

export const CATALOG_WEBHOOK_MAX_BODY_BYTES = 256 * 1024;
export const CATALOG_WEBHOOK_MAX_BOOKS = 50;
export const CATALOG_WEBHOOK_SECRET_HEADER = "x-catalog-webhook-secret";

const ALLOWED_TEMPLATE_IDS = new Set<CampaignTemplateId>([
  "launch-hero",
  "sale-promo",
  "showcase-3d",
  "quote-review",
]);

export function catalogWebhookSecretConfigured(): boolean {
  return Boolean(process.env.CATALOG_WEBHOOK_SECRET?.trim());
}

export function catalogWebhookSecretMatches(provided: string | null | undefined): boolean {
  const expected = process.env.CATALOG_WEBHOOK_SECRET?.trim() ?? "";
  if (!expected || typeof provided !== "string" || !provided) return false;
  const left = createHash("sha256").update(expected).digest();
  const right = createHash("sha256").update(provided).digest();
  return timingSafeEqual(left, right);
}

function extractProvidedSecret(request: NextRequest, body: Record<string, unknown>): string | null {
  const header =
    request.headers.get(CATALOG_WEBHOOK_SECRET_HEADER) ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (header) return header;
  const fromBody = body.secret;
  return typeof fromBody === "string" ? fromBody : null;
}

export async function POST(request: NextRequest) {
  if (!catalogWebhookSecretConfigured()) {
    return NextResponse.json(
      {
        error: "Catalog webhook is disabled until CATALOG_WEBHOOK_SECRET is configured.",
      },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await readBoundedJson(request, CATALOG_WEBHOOK_MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "Catalog webhook payload is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  if (!catalogWebhookSecretMatches(extractProvidedSecret(request, body))) {
    return NextResponse.json({ error: "Unauthorized catalog webhook." }, { status: 401 });
  }

  try {
    if (!Array.isArray(body.books) || body.books.length === 0) {
      return NextResponse.json(
        {
          error:
            "Invalid payload: 'books' array is required and must contain at least 1 book record.",
        },
        { status: 400 },
      );
    }
    if (body.books.length > CATALOG_WEBHOOK_MAX_BOOKS) {
      return NextResponse.json(
        { error: `Catalog webhook accepts at most ${CATALOG_WEBHOOK_MAX_BOOKS} books.` },
        { status: 413 },
      );
    }

    const books = body.books;
    const requestedTemplate = body.templateId;
    const templateId: CampaignTemplateId =
      typeof requestedTemplate === "string" &&
      ALLOWED_TEMPLATE_IDS.has(requestedTemplate as CampaignTemplateId)
        ? (requestedTemplate as CampaignTemplateId)
        : "launch-hero";
    const requestedChannelIds: string[] = Array.isArray(body.channels)
      ? body.channels.filter((id): id is string => typeof id === "string")
      : ["feed-square", "story-vertical", "banner-landscape"];

    const channels = CAMPAIGN_CHANNELS.filter((c) => requestedChannelIds.includes(c.id));
    if (channels.length === 0) {
      return NextResponse.json(
        { error: "No valid channels matched the requested channel IDs." },
        { status: 400 },
      );
    }

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
