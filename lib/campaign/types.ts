/**
 * Types and definitions for Campaign Production v1.
 * Local-first multi-format batch ad generator for book campaigns.
 */

export type BookCampaignRecord = {
  id: string;
  isbn: string;
  title: string;
  subtitle?: string;
  author: string;
  publisher?: string;
  listPrice?: string;
  salePrice?: string;
  discountText?: string;
  coverUrl?: string;
  ctaText?: string;
  tagline?: string;
  badgeText?: string;
  releaseDate?: string;
  reviewerQuote?: string;
  reviewerName?: string;
  customFields?: Record<string, string>;
};

export type VariantRatio = "1:1" | "9:16" | "16:9" | "4:5" | "4:3";

export type CampaignChannelSpec = {
  id: string;
  name: string;
  channel: string;
  ratio: VariantRatio;
  width: number;
  height: number;
  description: string;
  badge: string;
};

export const CAMPAIGN_CHANNELS: CampaignChannelSpec[] = [
  {
    id: "feed-square",
    name: "Square Post (1:1)",
    channel: "Facebook / Instagram",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    description: "Standard square feed post for Facebook & Instagram",
    badge: "1080×1080",
  },
  {
    id: "story-vertical",
    name: "Vertical Story (9:16)",
    channel: "Instagram / TikTok / Reels",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    description: "Full-screen vertical story and video cover format",
    badge: "1080×1920",
  },
  {
    id: "banner-landscape",
    name: "Landscape Banner (16:9)",
    channel: "Web Banner / YouTube",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    description: "Wide banner for website headers and display ads",
    badge: "1920×1080",
  },
  {
    id: "feed-portrait",
    name: "Portrait Feed (4:5)",
    channel: "Instagram / Facebook",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    description: "High-engagement vertical feed post with maximum screen real estate",
    badge: "1080×1350",
  },
  {
    id: "shelf-talker",
    name: "Shelf Talker (4:3)",
    channel: "In-store / Presentation",
    ratio: "4:3",
    width: 1200,
    height: 900,
    description: "In-store shelf display, catalog print, and presentation card",
    badge: "1200×900",
  },
];

export type CampaignTemplateId = "launch-hero" | "sale-promo" | "showcase-3d" | "quote-review";

export type CampaignTemplateTheme = "warm" | "dark" | "vibrant" | "minimal" | "navy";

export type CampaignTemplateDef = {
  id: CampaignTemplateId;
  name: string;
  tagline: string;
  description: string;
  previewThumbnail?: string;
  supportedRatios: VariantRatio[];
  defaultTheme: CampaignTemplateTheme;
};

export type PreflightSeverity = "error" | "warning" | "info";

export type PreflightIssue = {
  id: string;
  slideId: string;
  bookId: string;
  bookTitle: string;
  ratio: VariantRatio;
  field: string;
  severity: PreflightSeverity;
  message: string;
  suggestion: string;
};

export type ColumnMapping = {
  isbn?: string;
  title: string;
  subtitle?: string;
  author: string;
  publisher?: string;
  listPrice?: string;
  salePrice?: string;
  discountText?: string;
  coverUrl?: string;
  ctaText?: string;
  tagline?: string;
  badgeText?: string;
  releaseDate?: string;
  reviewerQuote?: string;
  reviewerName?: string;
};

export type BatchExportProgress = {
  total: number;
  completed: number;
  currentName: string;
  status: "idle" | "rendering" | "packaging" | "done" | "error";
  error?: string;
};
