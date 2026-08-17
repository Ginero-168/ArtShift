/**
 * CSV / Tabular Data Parser and Heuristic Column Mapper for Book Campaigns.
 */

import type { BookCampaignRecord, ColumnMapping } from "./types";

/** Parse CSV / TSV text with robust handling for quoted cells and commas. */
export function parseCSV(rawText: string): { headers: string[]; rows: string[][] } {
  const text = rawText.trim();
  if (!text) return { headers: [], rows: [] };

  // Detect delimiter: tab, semicolon or comma
  const firstLine = text.split(/\r?\n/)[0] || "";
  let delimiter = ",";
  if (firstLine.includes("\t")) delimiter = "\t";
  else if (firstLine.includes(";") && !firstLine.includes(",")) delimiter = ";";

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = "";
      } else if (char === "\r") {
        // ignore CR
      } else if (char === "\n") {
        currentRow.push(currentCell.trim());
        if (currentRow.some((c) => c.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1);

  return { headers, rows: dataRows };
}

const FIELD_HEURISTICS: Record<keyof ColumnMapping, string[]> = {
  title: [
    "ชื่อหนังสือ",
    "ชื่อเรื่อง",
    "ชื่อ",
    "title",
    "book_title",
    "booktitle",
    "book_name",
    "name",
    "item_name",
  ],
  author: ["ผู้เขียน", "ผู้แต่ง", "นักเขียน", "author", "writer", "by", "creator"],
  isbn: ["isbn", "รหัสสินค้า", "รหัส", "sku", "barcode", "code", "book_id", "id"],
  listPrice: [
    "ราคาเต็ม",
    "ราคาปก",
    "ราคาปกติ",
    "price",
    "list_price",
    "regular_price",
    "original_price",
    "full_price",
  ],
  salePrice: [
    "ราคาพิเศษ",
    "ราคาขาย",
    "ราคาโปร",
    "ราคาลด",
    "sale_price",
    "discount_price",
    "special_price",
    "promo_price",
    "final_price",
  ],
  discountText: [
    "ส่วนลด",
    "discount",
    "discount_text",
    "badge",
    "โปรโมชัน",
    "promotion",
    "percent_off",
  ],
  coverUrl: [
    "รูปปก",
    "ปก",
    "ภาพปก",
    "รูปภาพ",
    "cover",
    "cover_url",
    "cover_image",
    "image",
    "image_url",
    "img",
    "photo",
  ],
  publisher: ["สำนักพิมพ์", "สนพ", "publisher", "imprint", "brand"],
  ctaText: ["cta", "ปุ่ม", "call_to_action", "action_text", "button", "cta_text"],
  tagline: ["แท็กไลน์", "คำโปรย", "จุดเด่น", "tagline", "catchphrase", "highlight", "hook"],
  subtitle: ["ชื่อรอง", "คำอธิบายย่อย", "subtitle", "sub_title", "description", "short_desc"],
  badgeText: ["ป้าย", "สติกเกอร์", "badge", "badge_text", "sticker", "tag", "category"],
  releaseDate: ["วันที่วางจำหน่าย", "วางจำหน่าย", "release_date", "publish_date", "date"],
  reviewerQuote: [
    "คำนิยม",
    "รีวิว",
    "คำชม",
    "quote",
    "review",
    "testimonial",
    "praise",
    "endorsement",
  ],
  reviewerName: ["ผู้รีวิว", "เจ้าของคำนิยม", "reviewer", "reviewer_name", "source", "quoted_by"],
};

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: Partial<ColumnMapping> = {};
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  // 1. Pass 1: Exact matches
  for (const [field, aliases] of Object.entries(FIELD_HEURISTICS) as Array<
    [keyof ColumnMapping, string[]]
  >) {
    for (const alias of aliases) {
      const matchIndex = normalizedHeaders.indexOf(alias.toLowerCase());
      if (matchIndex !== -1) {
        mapping[field] = headers[matchIndex];
        break;
      }
    }
  }

  // 2. Pass 2: Substring matches for unmapped fields (skipping short aliases like "ปก", "id")
  for (const [field, aliases] of Object.entries(FIELD_HEURISTICS) as Array<
    [keyof ColumnMapping, string[]]
  >) {
    if (mapping[field]) continue;
    const matchIndex = normalizedHeaders.findIndex((h) =>
      aliases.some((alias) => alias.length >= 3 && h.includes(alias.toLowerCase())),
    );
    if (matchIndex !== -1) {
      mapping[field] = headers[matchIndex];
    }
  }

  // Fallback defaults if mandatory fields are missing
  return {
    title: mapping.title ?? headers[0] ?? "",
    author: mapping.author ?? headers[1] ?? "",
    isbn: mapping.isbn,
    subtitle: mapping.subtitle,
    publisher: mapping.publisher,
    listPrice: mapping.listPrice,
    salePrice: mapping.salePrice,
    discountText: mapping.discountText,
    coverUrl: mapping.coverUrl,
    ctaText: mapping.ctaText,
    tagline: mapping.tagline,
    badgeText: mapping.badgeText,
    releaseDate: mapping.releaseDate,
    reviewerQuote: mapping.reviewerQuote,
    reviewerName: mapping.reviewerName,
  };
}

export function recordsFromMappedRows(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
): BookCampaignRecord[] {
  const getIndex = (headerName?: string): number => {
    if (!headerName) return -1;
    return headers.indexOf(headerName);
  };

  const titleIdx = getIndex(mapping.title);
  const authorIdx = getIndex(mapping.author);
  const isbnIdx = getIndex(mapping.isbn);
  const subtitleIdx = getIndex(mapping.subtitle);
  const publisherIdx = getIndex(mapping.publisher);
  const listPriceIdx = getIndex(mapping.listPrice);
  const salePriceIdx = getIndex(mapping.salePrice);
  const discountIdx = getIndex(mapping.discountText);
  const coverUrlIdx = getIndex(mapping.coverUrl);
  const ctaIdx = getIndex(mapping.ctaText);
  const taglineIdx = getIndex(mapping.tagline);
  const badgeIdx = getIndex(mapping.badgeText);
  const releaseDateIdx = getIndex(mapping.releaseDate);
  const quoteIdx = getIndex(mapping.reviewerQuote);
  const reviewerIdx = getIndex(mapping.reviewerName);

  return rows
    .filter((r) => r.length > 0 && r.some((c) => c.trim().length > 0))
    .map((r, i) => {
      const getVal = (idx: number): string | undefined =>
        idx >= 0 && r[idx] ? r[idx].trim() : undefined;

      const title = getVal(titleIdx) || `Book #${i + 1}`;
      const author = getVal(authorIdx) || "Unknown Author";
      const isbn = getVal(isbnIdx) || `978${Math.floor(1000000000 + Math.random() * 9000000000)}`;

      return {
        id: `book-${i + 1}-${isbn}`,
        isbn,
        title,
        author,
        subtitle: getVal(subtitleIdx),
        publisher: getVal(publisherIdx),
        listPrice: getVal(listPriceIdx),
        salePrice: getVal(salePriceIdx),
        discountText: getVal(discountIdx),
        coverUrl: getVal(coverUrlIdx),
        ctaText: getVal(ctaIdx),
        tagline: getVal(taglineIdx),
        badgeText: getVal(badgeIdx),
        releaseDate: getVal(releaseDateIdx),
        reviewerQuote: getVal(quoteIdx),
        reviewerName: getVal(reviewerIdx),
      };
    });
}

/* ——— Preset Sample Datasets ——— */

export const SAMPLE_CAMPAIGNS: Array<{
  id: string;
  name: string;
  category: string;
  description: string;
  csv: string;
}> = [
  {
    id: "sample-bestsellers",
    name: "วรรณกรรม & จิตวิทยา ขายดี (Bestsellers)",
    category: "General Fiction & Non-Fiction",
    description: "ชุดหนังสือขายดียอดนิยม พร้อมราคาโปรโมชัน ส่วนลด และคำโปรย",
    csv: `ISBN,ชื่อหนังสือ,ผู้เขียน,สำนักพิมพ์,ราคาปกติ,ราคาโปร,ส่วนลด,แท็กไลน์,ป้าย,รูปปก,คำนิยม,ผู้รีวิว
9786161852011,กาลครั้งหนึ่ง...ถึงเธอที่คิดถึง,คิดมาก,springbooks,295,249,ลด 15%,เรื่องราวอบอุ่นหัวใจที่จะคอยโอบกอดคุณในวันที่เหนื่อยล้า,New Arrival,https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80,หนังสือที่อ่านแล้วรู้สึกเหมือนได้คุยกับเพื่อนสนิท,The Cloud
9786162875106,จิตวิทยาว่าด้วยเงิน (The Psychology of Money),Morgan Housel,Read Works,340,289,ลด 15%,บทเรียนเหนือกาลเวลาเรื่องความมั่งคั่งและความสุข,Bestseller,https://images.unsplash.com/photo-1592496431122-2349e0fbc666?w=600&auto=format&fit=crop&q=80,หนึ่งในหนังสือการเงินที่ดีที่สุดในรอบ 10 ปี,Wall Street Journal
9786160451234,Atomic Habits เพราะชีวิตดีได้กว่าที่เป็น,James Clear,Change+,320,269,ลด 16%,การเปลี่ยนแปลงเล็ก ๆ ที่สร้างผลลัพธ์มหาศาล,Top Recommendation,https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&auto=format&fit=crop&q=80,คู่มือปฏิบัติที่เปลี่ยนพฤติกรรมได้จริงอย่างยั่งยืน,Mark Manson`,
  },
  {
    id: "sample-business",
    name: "บริหารธุรกิจ & การตลาด (Business & Tech)",
    category: "Business & Marketing",
    description: "หนังสือธุรกิจ เทคโนโลยี และกลยุทธ์การเติบโต",
    csv: `ISBN,ชื่อหนังสือ,ผู้เขียน,สำนักพิมพ์,ราคาปกติ,ราคาโปร,ส่วนลด,แท็กไลน์,ป้าย,รูปปก,คำนิยม,ผู้รีวิว
9786168221051,Sprint วิธีแก้ปัญหาและทดสอบไอเดียใน 5 วัน,Jake Knapp,FastForward,395,335,ลด 15%,คู่มือสร้างนวัตกรรมระดับโลกจากทีม Google Ventures,Must Read,https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=600&auto=format&fit=crop&q=80,เครื่องมือที่ทุกสตาร์ทอัปต้องมีติดตัว,Eric Ries
9786169345008,Good Strategy Bad Strategy,Richard Rumelt,BizPress,450,380,ลด 15%,แยกแยะความแตกต่างระหว่างกลยุทธ์ที่แท้จริงกับความเพ้อฝัน,Classic,https://images.unsplash.com/photo-1532012164546-f432f2e3edd4?w=600&auto=format&fit=crop&q=80,หนังสือกลยุทธ์ที่เฉียบคมและทรงคุณค่าที่สุด,McKinsey Quarterly
9786167890123,Zero to One ปั้นธุรกิจจากศูนย์เป็นหนึ่ง,Peter Thiel,Iconic,315,265,ลด 16%,ความลับในการสร้างสิ่งใหม่ที่ยังไม่เคยมีใครทำ,Top Pick,https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=600&auto=format&fit=crop&q=80,เปิดมุมมองใหม่ในการสร้างความก้าวหน้าแบบก้าวกระโดด,Elon Musk`,
  },
];
