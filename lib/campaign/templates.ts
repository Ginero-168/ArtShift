/**
 * Smart Book Campaign Templates.
 * Multi-ratio layout generators tailored for book advertising and merchandising.
 */

import { createBookMockup, createImage, createRect, createText } from "../engine/factory";
import type { EngineElement } from "../engine/types";
import type {
  BookCampaignRecord,
  CampaignChannelSpec,
  CampaignTemplateDef,
  CampaignTemplateId,
  CampaignTemplateTheme,
} from "./types";

export const CAMPAIGN_TEMPLATE_DEFS: CampaignTemplateDef[] = [
  {
    id: "launch-hero",
    name: "Book Launch Hero (เปิดตัวเล่มใหม่)",
    tagline: "เปิดตัวหนังสือใหม่ โฟกัสปกและจุดเด่น",
    description: "เน้นภาพปกขนาดใหญ่ หัวข้อโดดเด่น คำโปรยน่าดึงดูด และปุ่มสั่งซื้อพร้อมใช้",
    supportedRatios: ["1:1", "9:16", "16:9", "4:5", "4:3"],
    defaultTheme: "warm",
  },
  {
    id: "sale-promo",
    name: "Sale & Promotion (โปรโมชันลดราคา)",
    tagline: "เน้นป้ายลดราคา ราคาพิเศษ และความคุ้มค่า",
    description: "ป้ายลดราคาเด่นชัด ราคาโปรโมชันขีดฆ่าราคาเดิม และปุ่มเร่งการตัดสินใจซื้อ",
    supportedRatios: ["1:1", "9:16", "16:9", "4:5", "4:3"],
    defaultTheme: "vibrant",
  },
  {
    id: "showcase-3d",
    name: "3D Mockup Showcase (รูปเล่ม 3 มิติ)",
    tagline: "โชว์รูปเล่มสามมิติ ปกแข็ง/ปกอ่อน พร้อมเงาสมจริง",
    description: "ใช้ 3D Book Mockup ปรับมุมมอง แสงเงา และสันทึบ เพิ่มความพรีเมียมให้งานโฆษณา",
    supportedRatios: ["1:1", "9:16", "16:9", "4:5", "4:3"],
    defaultTheme: "dark",
  },
  {
    id: "quote-review",
    name: "Quote & Review (คำนิยม & รีวิว)",
    tagline: "สร้างความน่าเชื่อถือด้วยรีวิวและคะแนน",
    description: "กล่องคำนิยมขนาดใหญ่ เครื่องหมายคำพูด การันตีความน่าอ่านจากนักรีวิวชื่อดัง",
    supportedRatios: ["1:1", "9:16", "16:9", "4:5", "4:3"],
    defaultTheme: "navy",
  },
];

const THEME_PALETTES: Record<
  CampaignTemplateTheme,
  {
    bg: string;
    cardBg: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    accentBg: string;
    accentText: string;
    saleText: string;
    border: string;
  }
> = {
  warm: {
    bg: "#fbf8f3",
    cardBg: "#ffffff",
    textPrimary: "#292524",
    textSecondary: "#78716c",
    accent: "#b45309",
    accentBg: "#fef3c7",
    accentText: "#92400e",
    saleText: "#dc2626",
    border: "#e7e5e4",
  },
  dark: {
    bg: "#18181b",
    cardBg: "#27272a",
    textPrimary: "#fafafa",
    textSecondary: "#a1a1aa",
    accent: "#f59e0b",
    accentBg: "#451a03",
    accentText: "#fde68a",
    saleText: "#ef4444",
    border: "#3f3f46",
  },
  vibrant: {
    bg: "#fff7ed",
    cardBg: "#ffffff",
    textPrimary: "#1e293b",
    textSecondary: "#64748b",
    accent: "#ea580c",
    accentBg: "#ffedd5",
    accentText: "#c2410c",
    saleText: "#e11d48",
    border: "#fed7aa",
  },
  minimal: {
    bg: "#f8fafc",
    cardBg: "#ffffff",
    textPrimary: "#0f172a",
    textSecondary: "#64748b",
    accent: "#0284c7",
    accentBg: "#e0f2fe",
    accentText: "#0369a1",
    saleText: "#e11d48",
    border: "#e2e8f0",
  },
  navy: {
    bg: "#0f172a",
    cardBg: "#1e293b",
    textPrimary: "#f8fafc",
    textSecondary: "#94a3b8",
    accent: "#38bdf8",
    accentBg: "#0c4a6e",
    accentText: "#bae6fd",
    saleText: "#f43f5e",
    border: "#334155",
  },
};

export type GeneratedTemplateResult = {
  elements: EngineElement[];
  background: string;
  name: string;
};

export function buildCampaignSlide(
  templateId: CampaignTemplateId,
  book: BookCampaignRecord,
  channel: CampaignChannelSpec,
  coverFileId: string,
  themeChoice?: CampaignTemplateTheme,
): GeneratedTemplateResult {
  const themeKey =
    themeChoice ?? CAMPAIGN_TEMPLATE_DEFS.find((t) => t.id === templateId)?.defaultTheme ?? "warm";
  const colors = THEME_PALETTES[themeKey];

  switch (templateId) {
    case "launch-hero":
      return buildLaunchHero(book, channel, coverFileId, colors, themeKey);
    case "sale-promo":
      return buildSalePromo(book, channel, coverFileId, colors, themeKey);
    case "showcase-3d":
      return buildShowcase3D(book, channel, coverFileId, colors, themeKey);
    case "quote-review":
      return buildQuoteReview(book, channel, coverFileId, colors, themeKey);
    default:
      return buildLaunchHero(book, channel, coverFileId, colors, themeKey);
  }
}

/* ——— Template 1: Launch Hero ——— */
function buildLaunchHero(
  book: BookCampaignRecord,
  channel: CampaignChannelSpec,
  coverFileId: string,
  colors: (typeof THEME_PALETTES)["warm"],
  _theme: CampaignTemplateTheme,
): GeneratedTemplateResult {
  const { width: W, height: H, ratio } = channel;
  const elements: EngineElement[] = [];

  const badgeText = book.badgeText || "หนังสือมาใหม่";
  const authorText = book.author ? `ผู้เขียน: ${book.author}` : "";
  const publisherText = book.publisher ? `สำนักพิมพ์ ${book.publisher}` : "";
  const priceDisplay = book.salePrice
    ? `฿${book.salePrice}`
    : book.listPrice
      ? `฿${book.listPrice}`
      : "";
  const cta = book.ctaText || "สั่งซื้อได้แล้ววันนี้";

  if (ratio === "16:9") {
    // Landscape Banner: Book on Left, Content on Right
    const bookW = Math.round(W * 0.28);
    const bookH = Math.round(bookW * 1.45);
    const bookX = Math.round(W * 0.08);
    const bookY = Math.round((H - bookH) / 2);

    // Book Cover with drop card background
    const bgCard = createRect({
      x: bookX - 16,
      y: bookY - 16,
      width: bookW + 32,
      height: bookH + 32,
    });
    bgCard.backgroundColor = colors.cardBg;
    bgCard.strokeColor = colors.border;
    bgCard.cornerRadius = 16;
    bgCard.fillStyle = "solid";
    bgCard.roughness = 0;
    elements.push(bgCard);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 8 };
    elements.push(cover);

    // Right Column
    const rightX = Math.round(W * 0.42);
    const rightW = Math.round(W * 0.52);

    // Badge
    const badge = createText({
      x: rightX,
      y: Math.round(H * 0.16),
      text: badgeText,
      fontSize: 20,
      width: Math.min(220, rightW),
    });
    badge.strokeColor = colors.accentText;
    badge.backgroundColor = colors.accentBg;
    badge.fontStyle = "bold";
    badge.cornerRadius = 20;
    badge.padding = 10;
    elements.push(badge);

    // Title
    const title = createText({
      x: rightX,
      y: Math.round(H * 0.26),
      text: book.title,
      fontSize: 48,
      width: rightW,
    });
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    // Tagline / Subtitle
    if (book.tagline || book.subtitle) {
      const tag = createText({
        x: rightX,
        y: Math.round(H * 0.46),
        text: book.tagline || book.subtitle || "",
        fontSize: 24,
        width: rightW,
      });
      tag.strokeColor = colors.textSecondary;
      elements.push(tag);
    }

    // Author & Publisher
    const meta = createText({
      x: rightX,
      y: Math.round(H * 0.62),
      text: [authorText, publisherText].filter(Boolean).join("  •  "),
      fontSize: 22,
      width: rightW,
    });
    meta.strokeColor = colors.accent;
    elements.push(meta);

    // Price & CTA Row
    if (priceDisplay) {
      const price = createText({
        x: rightX,
        y: Math.round(H * 0.74),
        text: priceDisplay,
        fontSize: 42,
        width: 180,
      });
      price.strokeColor = colors.saleText;
      price.fontStyle = "bold";
      elements.push(price);
    }

    const ctaBtn = createText({
      x: rightX + (priceDisplay ? 200 : 0),
      y: Math.round(H * 0.74),
      text: `  ${cta} →  `,
      fontSize: 24,
      width: 260,
    });
    ctaBtn.strokeColor = "#ffffff";
    ctaBtn.backgroundColor = colors.accent;
    ctaBtn.fontStyle = "bold";
    ctaBtn.cornerRadius = 28;
    ctaBtn.padding = 14;
    elements.push(ctaBtn);
  } else if (ratio === "9:16") {
    // Story / Vertical format: Stacked Top to Bottom
    // Top Badge
    const badge = createText({
      x: Math.round((W - 240) / 2),
      y: Math.round(H * 0.08),
      text: badgeText,
      fontSize: 22,
      width: 240,
    });
    badge.textAlign = "center";
    badge.strokeColor = colors.accentText;
    badge.backgroundColor = colors.accentBg;
    badge.fontStyle = "bold";
    badge.cornerRadius = 20;
    badge.padding = 12;
    elements.push(badge);

    // Centered Book Cover
    const bookW = Math.round(W * 0.65);
    const bookH = Math.round(bookW * 1.45);
    const bookX = Math.round((W - bookW) / 2);
    const bookY = Math.round(H * 0.16);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 12 };
    cover.shadow = { color: "rgba(0,0,0,0.18)", blur: 28, offsetX: 0, offsetY: 16 };
    elements.push(cover);

    // Title
    const title = createText({
      x: Math.round(W * 0.08),
      y: Math.round(H * 0.58),
      text: book.title,
      fontSize: 44,
      width: Math.round(W * 0.84),
    });
    title.textAlign = "center";
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    // Author
    if (authorText) {
      const auth = createText({
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.7),
        text: [authorText, publisherText].filter(Boolean).join("  |  "),
        fontSize: 22,
        width: Math.round(W * 0.84),
      });
      auth.textAlign = "center";
      auth.strokeColor = colors.accent;
      elements.push(auth);
    }

    // Price
    if (priceDisplay) {
      const price = createText({
        x: Math.round((W - 220) / 2),
        y: Math.round(H * 0.77),
        text: priceDisplay,
        fontSize: 48,
        width: 220,
      });
      price.textAlign = "center";
      price.strokeColor = colors.saleText;
      price.fontStyle = "bold";
      elements.push(price);
    }

    // Bottom CTA
    const ctaBtn = createText({
      x: Math.round(W * 0.12),
      y: Math.round(H * 0.86),
      text: cta,
      fontSize: 26,
      width: Math.round(W * 0.76),
    });
    ctaBtn.textAlign = "center";
    ctaBtn.strokeColor = "#ffffff";
    ctaBtn.backgroundColor = colors.accent;
    ctaBtn.fontStyle = "bold";
    ctaBtn.cornerRadius = 32;
    ctaBtn.padding = 18;
    elements.push(ctaBtn);
  } else {
    // Square (1:1), Portrait (4:5), Shelf Talker (4:3)
    const bookW = Math.round(W * 0.42);
    const bookH = Math.round(bookW * 1.45);
    const bookX = Math.round(W * 0.06);
    const bookY = Math.round((H - bookH) / 2);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 10 };
    cover.shadow = { color: "rgba(0,0,0,0.15)", blur: 24, offsetX: 4, offsetY: 12 };
    elements.push(cover);

    const rightX = Math.round(W * 0.52);
    const rightW = Math.round(W * 0.42);

    const badge = createText({
      x: rightX,
      y: Math.round(H * 0.14),
      text: badgeText,
      fontSize: 18,
      width: Math.min(200, rightW),
    });
    badge.strokeColor = colors.accentText;
    badge.backgroundColor = colors.accentBg;
    badge.fontStyle = "bold";
    badge.cornerRadius = 16;
    badge.padding = 8;
    elements.push(badge);

    const title = createText({
      x: rightX,
      y: Math.round(H * 0.24),
      text: book.title,
      fontSize: ratio === "4:3" ? 34 : 40,
      width: rightW,
    });
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    if (authorText) {
      const auth = createText({
        x: rightX,
        y: Math.round(H * 0.48),
        text: authorText,
        fontSize: 20,
        width: rightW,
      });
      auth.strokeColor = colors.accent;
      elements.push(auth);
    }

    if (priceDisplay) {
      const price = createText({
        x: rightX,
        y: Math.round(H * 0.62),
        text: priceDisplay,
        fontSize: 38,
        width: rightW,
      });
      price.strokeColor = colors.saleText;
      price.fontStyle = "bold";
      elements.push(price);
    }

    const ctaBtn = createText({
      x: rightX,
      y: Math.round(H * 0.76),
      text: `  ${cta}  `,
      fontSize: 20,
      width: Math.min(240, rightW),
    });
    ctaBtn.strokeColor = "#ffffff";
    ctaBtn.backgroundColor = colors.accent;
    ctaBtn.fontStyle = "bold";
    ctaBtn.cornerRadius = 24;
    ctaBtn.padding = 12;
    ctaBtn.textAlign = "center";
    elements.push(ctaBtn);
  }

  return {
    elements,
    background: colors.bg,
    name: `${book.title} — Launch Hero (${channel.name})`,
  };
}

/* ——— Template 2: Sale & Promotion ——— */
function buildSalePromo(
  book: BookCampaignRecord,
  channel: CampaignChannelSpec,
  coverFileId: string,
  colors: (typeof THEME_PALETTES)["vibrant"],
  _theme: CampaignTemplateTheme,
): GeneratedTemplateResult {
  const { width: W, height: H, ratio } = channel;
  const elements: EngineElement[] = [];

  const discountBadge = book.discountText || "ลดพิเศษ 15%";
  const salePrice = book.salePrice ? `฿${book.salePrice}` : "฿249";
  const listPrice = book.listPrice ? `ปกติ ฿${book.listPrice}` : "";
  const cta = book.ctaText || "ช้อปด่วนก่อนหมดโปร";

  if (ratio === "16:9") {
    // 16:9 Landscape Promo
    const bookW = Math.round(W * 0.26);
    const bookH = Math.round(bookW * 1.45);
    const bookX = Math.round(W * 0.08);
    const bookY = Math.round((H - bookH) / 2);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 10 };
    cover.shadow = { color: "rgba(0,0,0,0.18)", blur: 24, offsetX: 0, offsetY: 12 };
    elements.push(cover);

    const rightX = Math.round(W * 0.4);
    const rightW = Math.round(W * 0.54);

    // Big Discount Ribbon
    const ribbon = createText({
      x: rightX,
      y: Math.round(H * 0.12),
      text: ` 🔥 ${discountBadge} `,
      fontSize: 26,
      width: 280,
    });
    ribbon.strokeColor = "#ffffff";
    ribbon.backgroundColor = colors.saleText;
    ribbon.fontStyle = "bold";
    ribbon.cornerRadius = 24;
    ribbon.padding = 12;
    elements.push(ribbon);

    // Book Title
    const title = createText({
      x: rightX,
      y: Math.round(H * 0.26),
      text: book.title,
      fontSize: 46,
      width: rightW,
    });
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    // Price Box Card
    const priceBox = createRect({
      x: rightX,
      y: Math.round(H * 0.52),
      width: rightW,
      height: Math.round(H * 0.22),
    });
    priceBox.backgroundColor = colors.cardBg;
    priceBox.strokeColor = colors.border;
    priceBox.cornerRadius = 16;
    priceBox.fillStyle = "solid";
    priceBox.roughness = 0;
    elements.push(priceBox);

    const saleText = createText({
      x: rightX + 24,
      y: Math.round(H * 0.55),
      text: salePrice,
      fontSize: 54,
      width: 220,
    });
    saleText.strokeColor = colors.saleText;
    saleText.fontStyle = "bold";
    elements.push(saleText);

    if (listPrice) {
      const listText = createText({
        x: rightX + 260,
        y: Math.round(H * 0.58),
        text: listPrice,
        fontSize: 28,
        width: 200,
      });
      listText.strokeColor = colors.textSecondary;
      elements.push(listText);
    }

    // CTA
    const ctaBtn = createText({
      x: rightX,
      y: Math.round(H * 0.78),
      text: `  ${cta}  `,
      fontSize: 26,
      width: 320,
    });
    ctaBtn.strokeColor = "#ffffff";
    ctaBtn.backgroundColor = colors.accent;
    ctaBtn.fontStyle = "bold";
    ctaBtn.cornerRadius = 28;
    ctaBtn.padding = 16;
    ctaBtn.textAlign = "center";
    elements.push(ctaBtn);
  } else {
    // 1:1, 9:16, 4:5, 4:3 Promo
    const isVertical = ratio === "9:16";
    const bookW = Math.round(W * (isVertical ? 0.6 : 0.4));
    const bookH = Math.round(bookW * 1.45);
    const bookX = isVertical ? Math.round((W - bookW) / 2) : Math.round(W * 0.06);
    const bookY = isVertical ? Math.round(H * 0.16) : Math.round((H - bookH) / 2);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 12 };
    cover.shadow = { color: "rgba(0,0,0,0.20)", blur: 24, offsetX: 0, offsetY: 12 };
    elements.push(cover);

    if (isVertical) {
      // Top Discount Badge
      const ribbon = createText({
        x: Math.round((W - 280) / 2),
        y: Math.round(H * 0.08),
        text: ` 🔥 ${discountBadge} `,
        fontSize: 24,
        width: 280,
      });
      ribbon.textAlign = "center";
      ribbon.strokeColor = "#ffffff";
      ribbon.backgroundColor = colors.saleText;
      ribbon.fontStyle = "bold";
      ribbon.cornerRadius = 24;
      ribbon.padding = 12;
      elements.push(ribbon);

      // Title
      const title = createText({
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.6),
        text: book.title,
        fontSize: 42,
        width: Math.round(W * 0.84),
      });
      title.textAlign = "center";
      title.strokeColor = colors.textPrimary;
      title.fontStyle = "bold";
      elements.push(title);

      // Sale Price + Original
      const priceText = [salePrice, listPrice].filter(Boolean).join("  ");
      const priceEl = createText({
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.74),
        text: priceText,
        fontSize: 48,
        width: Math.round(W * 0.84),
      });
      priceEl.textAlign = "center";
      priceEl.strokeColor = colors.saleText;
      priceEl.fontStyle = "bold";
      elements.push(priceEl);

      // CTA
      const ctaBtn = createText({
        x: Math.round(W * 0.12),
        y: Math.round(H * 0.84),
        text: cta,
        fontSize: 26,
        width: Math.round(W * 0.76),
      });
      ctaBtn.textAlign = "center";
      ctaBtn.strokeColor = "#ffffff";
      ctaBtn.backgroundColor = colors.accent;
      ctaBtn.fontStyle = "bold";
      ctaBtn.cornerRadius = 32;
      ctaBtn.padding = 18;
      elements.push(ctaBtn);
    } else {
      // 1:1, 4:5, 4:3
      const rightX = Math.round(W * 0.5);
      const rightW = Math.round(W * 0.44);

      const ribbon = createText({
        x: rightX,
        y: Math.round(H * 0.12),
        text: ` 🔥 ${discountBadge} `,
        fontSize: 20,
        width: 240,
      });
      ribbon.strokeColor = "#ffffff";
      ribbon.backgroundColor = colors.saleText;
      ribbon.fontStyle = "bold";
      ribbon.cornerRadius = 20;
      ribbon.padding = 10;
      elements.push(ribbon);

      const title = createText({
        x: rightX,
        y: Math.round(H * 0.24),
        text: book.title,
        fontSize: ratio === "4:3" ? 34 : 40,
        width: rightW,
      });
      title.strokeColor = colors.textPrimary;
      title.fontStyle = "bold";
      elements.push(title);

      const saleEl = createText({
        x: rightX,
        y: Math.round(H * 0.54),
        text: salePrice,
        fontSize: 48,
        width: rightW,
      });
      saleEl.strokeColor = colors.saleText;
      saleEl.fontStyle = "bold";
      elements.push(saleEl);

      if (listPrice) {
        const listEl = createText({
          x: rightX,
          y: Math.round(H * 0.68),
          text: listPrice,
          fontSize: 22,
          width: rightW,
        });
        listEl.strokeColor = colors.textSecondary;
        elements.push(listEl);
      }

      const ctaBtn = createText({
        x: rightX,
        y: Math.round(H * 0.78),
        text: `  ${cta}  `,
        fontSize: 22,
        width: Math.min(260, rightW),
      });
      ctaBtn.strokeColor = "#ffffff";
      ctaBtn.backgroundColor = colors.accent;
      ctaBtn.fontStyle = "bold";
      ctaBtn.cornerRadius = 26;
      ctaBtn.padding = 14;
      ctaBtn.textAlign = "center";
      elements.push(ctaBtn);
    }
  }

  return {
    elements,
    background: colors.bg,
    name: `${book.title} — Sale Promo (${channel.name})`,
  };
}

/* ——— Template 3: 3D Mockup Showcase ——— */
function buildShowcase3D(
  book: BookCampaignRecord,
  channel: CampaignChannelSpec,
  coverFileId: string,
  colors: (typeof THEME_PALETTES)["dark"],
  _theme: CampaignTemplateTheme,
): GeneratedTemplateResult {
  const { width: W, height: H, ratio } = channel;
  const elements: EngineElement[] = [];

  const isVertical = ratio === "9:16";
  const bookW = Math.round(W * (ratio === "16:9" ? 0.32 : isVertical ? 0.68 : 0.44));
  const bookH = Math.round(bookW * 1.4);
  const bookX = isVertical
    ? Math.round((W - bookW) / 2)
    : Math.round(W * (ratio === "16:9" ? 0.08 : 0.06));
  const bookY = isVertical ? Math.round(H * 0.18) : Math.round((H - bookH) / 2);

  // Real 3D Book Mockup
  const mockup = createBookMockup({
    x: bookX,
    y: bookY,
    width: bookW,
    height: bookH,
    fileId: coverFileId,
    naturalWidth: 600,
    naturalHeight: 870,
    yaw: 22,
    pitch: -5,
    binding: "hardcover",
    depth: 14,
    coverOverhang: 2.2,
    lightIntensity: 0.35,
    shadowBlur: 32,
    shadowOpacity: 0.45,
    shadowOffset: 28,
  });
  elements.push(mockup);

  if (ratio === "16:9") {
    const rightX = Math.round(W * 0.44);
    const rightW = Math.round(W * 0.5);

    const badge = createText({
      x: rightX,
      y: Math.round(H * 0.16),
      text: book.badgeText || "★ HARDCOVER SPECIAL EDITION",
      fontSize: 20,
      width: rightW,
    });
    badge.strokeColor = colors.accent;
    badge.fontStyle = "bold";
    elements.push(badge);

    const title = createText({
      x: rightX,
      y: Math.round(H * 0.28),
      text: book.title,
      fontSize: 50,
      width: rightW,
    });
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    if (book.tagline) {
      const tag = createText({
        x: rightX,
        y: Math.round(H * 0.5),
        text: book.tagline,
        fontSize: 24,
        width: rightW,
      });
      tag.strokeColor = colors.textSecondary;
      elements.push(tag);
    }

    const priceText = book.salePrice
      ? `฿${book.salePrice}`
      : book.listPrice
        ? `฿${book.listPrice}`
        : "";
    if (priceText) {
      const price = createText({
        x: rightX,
        y: Math.round(H * 0.7),
        text: priceText,
        fontSize: 44,
        width: 200,
      });
      price.strokeColor = colors.accent;
      price.fontStyle = "bold";
      elements.push(price);
    }

    const cta = createText({
      x: rightX + (priceText ? 220 : 0),
      y: Math.round(H * 0.7),
      text: `  ${book.ctaText || "สั่งซื้อฉบับพรีเมียม"} →  `,
      fontSize: 24,
      width: 280,
    });
    cta.strokeColor = "#000000";
    cta.backgroundColor = colors.accent;
    cta.fontStyle = "bold";
    cta.cornerRadius = 28;
    cta.padding = 14;
    elements.push(cta);
  } else if (isVertical) {
    const title = createText({
      x: Math.round(W * 0.08),
      y: Math.round(H * 0.64),
      text: book.title,
      fontSize: 44,
      width: Math.round(W * 0.84),
    });
    title.textAlign = "center";
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    const priceText = book.salePrice
      ? `฿${book.salePrice}`
      : book.listPrice
        ? `฿${book.listPrice}`
        : "";
    if (priceText) {
      const price = createText({
        x: Math.round((W - 240) / 2),
        y: Math.round(H * 0.78),
        text: priceText,
        fontSize: 48,
        width: 240,
      });
      price.textAlign = "center";
      price.strokeColor = colors.accent;
      price.fontStyle = "bold";
      elements.push(price);
    }

    const cta = createText({
      x: Math.round(W * 0.12),
      y: Math.round(H * 0.86),
      text: book.ctaText || "สั่งซื้อฉบับพรีเมียม",
      fontSize: 26,
      width: Math.round(W * 0.76),
    });
    cta.textAlign = "center";
    cta.strokeColor = "#000000";
    cta.backgroundColor = colors.accent;
    cta.fontStyle = "bold";
    cta.cornerRadius = 32;
    cta.padding = 18;
    elements.push(cta);
  } else {
    const rightX = Math.round(W * 0.52);
    const rightW = Math.round(W * 0.42);

    const title = createText({
      x: rightX,
      y: Math.round(H * 0.2),
      text: book.title,
      fontSize: ratio === "4:3" ? 36 : 42,
      width: rightW,
    });
    title.strokeColor = colors.textPrimary;
    title.fontStyle = "bold";
    elements.push(title);

    if (book.author) {
      const auth = createText({
        x: rightX,
        y: Math.round(H * 0.46),
        text: `ผู้เขียน: ${book.author}`,
        fontSize: 22,
        width: rightW,
      });
      auth.strokeColor = colors.accent;
      elements.push(auth);
    }

    const priceText = book.salePrice
      ? `฿${book.salePrice}`
      : book.listPrice
        ? `฿${book.listPrice}`
        : "";
    if (priceText) {
      const price = createText({
        x: rightX,
        y: Math.round(H * 0.6),
        text: priceText,
        fontSize: 40,
        width: rightW,
      });
      price.strokeColor = colors.accent;
      price.fontStyle = "bold";
      elements.push(price);
    }

    const cta = createText({
      x: rightX,
      y: Math.round(H * 0.76),
      text: `  ${book.ctaText || "สั่งซื้อรูปเล่ม"}  `,
      fontSize: 22,
      width: Math.min(260, rightW),
    });
    cta.strokeColor = "#000000";
    cta.backgroundColor = colors.accent;
    cta.fontStyle = "bold";
    cta.cornerRadius = 26;
    cta.padding = 14;
    cta.textAlign = "center";
    elements.push(cta);
  }

  return {
    elements,
    background: colors.bg,
    name: `${book.title} — 3D Showcase (${channel.name})`,
  };
}

/* ——— Template 4: Quote & Review ——— */
function buildQuoteReview(
  book: BookCampaignRecord,
  channel: CampaignChannelSpec,
  coverFileId: string,
  colors: (typeof THEME_PALETTES)["navy"],
  _theme: CampaignTemplateTheme,
): GeneratedTemplateResult {
  const { width: W, height: H, ratio } = channel;
  const elements: EngineElement[] = [];

  const quoteText = book.reviewerQuote || "“หนังสือที่อ่านแล้วรู้สึกเหมือนได้คุยกับเพื่อนสนิทที่เข้าใจเราที่สุด”";
  const reviewer = book.reviewerName ? `— ${book.reviewerName}` : "— The Standard Book Club";

  if (ratio === "16:9") {
    // Wide review card
    const bookW = Math.round(W * 0.24);
    const bookH = Math.round(bookW * 1.45);
    const bookX = Math.round(W * 0.08);
    const bookY = Math.round((H - bookH) / 2);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 10 };
    cover.shadow = { color: "rgba(0,0,0,0.30)", blur: 26, offsetX: 0, offsetY: 12 };
    elements.push(cover);

    const rightX = Math.round(W * 0.38);
    const rightW = Math.round(W * 0.54);

    // Stars
    const stars = createText({
      x: rightX,
      y: Math.round(H * 0.14),
      text: "★★★★★  MUST READ",
      fontSize: 24,
      width: 300,
    });
    stars.strokeColor = "#fbbf24";
    stars.fontStyle = "bold";
    elements.push(stars);

    // Big Quote
    const quoteEl = createText({
      x: rightX,
      y: Math.round(H * 0.26),
      text: quoteText,
      fontSize: 38,
      width: rightW,
    });
    quoteEl.strokeColor = colors.textPrimary;
    quoteEl.fontStyle = "bold";
    elements.push(quoteEl);

    // Reviewer
    const revEl = createText({
      x: rightX,
      y: Math.round(H * 0.54),
      text: reviewer,
      fontSize: 24,
      width: rightW,
    });
    revEl.strokeColor = colors.accent;
    elements.push(revEl);

    // Book Title & Author bottom badge
    const info = createText({
      x: rightX,
      y: Math.round(H * 0.72),
      text: `${book.title} | ${book.author}`,
      fontSize: 22,
      width: rightW,
    });
    info.strokeColor = colors.textSecondary;
    elements.push(info);
  } else {
    // 1:1, 9:16, 4:5, 4:3
    const isVertical = ratio === "9:16";
    const bookW = Math.round(W * (isVertical ? 0.54 : 0.38));
    const bookH = Math.round(bookW * 1.45);
    const bookX = isVertical ? Math.round((W - bookW) / 2) : Math.round(W * 0.06);
    const bookY = isVertical ? Math.round(H * 0.12) : Math.round((H - bookH) / 2);

    const cover = createImage({
      x: bookX,
      y: bookY,
      width: bookW,
      height: bookH,
      fileId: coverFileId,
      naturalWidth: 600,
      naturalHeight: 870,
    });
    cover.mask = { shape: "rounded", radius: 10 };
    cover.shadow = { color: "rgba(0,0,0,0.30)", blur: 24, offsetX: 0, offsetY: 12 };
    elements.push(cover);

    if (isVertical) {
      const stars = createText({
        x: Math.round((W - 280) / 2),
        y: Math.round(H * 0.56),
        text: "★★★★★",
        fontSize: 32,
        width: 280,
      });
      stars.textAlign = "center";
      stars.strokeColor = "#fbbf24";
      elements.push(stars);

      const quoteEl = createText({
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.64),
        text: quoteText,
        fontSize: 34,
        width: Math.round(W * 0.84),
      });
      quoteEl.textAlign = "center";
      quoteEl.strokeColor = colors.textPrimary;
      quoteEl.fontStyle = "bold";
      elements.push(quoteEl);

      const revEl = createText({
        x: Math.round(W * 0.08),
        y: Math.round(H * 0.8),
        text: reviewer,
        fontSize: 22,
        width: Math.round(W * 0.84),
      });
      revEl.textAlign = "center";
      revEl.strokeColor = colors.accent;
      elements.push(revEl);
    } else {
      const rightX = Math.round(W * 0.48);
      const rightW = Math.round(W * 0.46);

      const stars = createText({
        x: rightX,
        y: Math.round(H * 0.12),
        text: "★★★★★",
        fontSize: 26,
        width: 200,
      });
      stars.strokeColor = "#fbbf24";
      elements.push(stars);

      const quoteEl = createText({
        x: rightX,
        y: Math.round(H * 0.22),
        text: quoteText,
        fontSize: ratio === "4:3" ? 28 : 34,
        width: rightW,
      });
      quoteEl.strokeColor = colors.textPrimary;
      quoteEl.fontStyle = "bold";
      elements.push(quoteEl);

      const revEl = createText({
        x: rightX,
        y: Math.round(H * 0.6),
        text: reviewer,
        fontSize: 20,
        width: rightW,
      });
      revEl.strokeColor = colors.accent;
      elements.push(revEl);

      const info = createText({
        x: rightX,
        y: Math.round(H * 0.76),
        text: `${book.title}`,
        fontSize: 20,
        width: rightW,
      });
      info.strokeColor = colors.textSecondary;
      elements.push(info);
    }
  }

  return {
    elements,
    background: colors.bg,
    name: `${book.title} — Review Quote (${channel.name})`,
  };
}
