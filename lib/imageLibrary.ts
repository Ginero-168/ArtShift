/*
 * Curated image library.
 *
 * Maps free-form queries (Thai or English) to a small set of stable Unsplash
 * CDN URLs. These are direct image URLs (not API calls) so they work without
 * any access key. Each bucket has multiple photos so back-to-back
 * `search_image` calls on the same topic return different pictures.
 *
 * All URLs are served at 1280x720 cropped.
 */

type Bucket = { id: string; keywords: string[]; photos: string[] };

function u(id: string): string {
  return `https://images.unsplash.com/photo-${id}?w=1280&h=720&fit=crop&q=80`;
}

const BUCKETS: Bucket[] = [
  {
    id: "thai-temple",
    keywords: [
      "temple",
      "buddha",
      "buddhist",
      "buddhism",
      "วัด",
      "พระ",
      "ศาสนา",
      "พุทธ",
      "วัฒนธรรม",
      "วัฒน",
      "pagoda",
      "shrine",
      "thailand culture",
      "thai culture",
    ],
    photos: [
      u("1528181304800-259b08848526"), // Wat Arun at dusk
      u("1563492065-1a5b8a02ae8a"),
      u("1552465011-b4e21bf6e79a"), // Thai temple
      u("1508009603885-50cf7c579365"), // Wat
      u("1504150558240-0b4fd8946624"), // golden buddha
    ],
  },
  {
    id: "thai-food",
    keywords: [
      "thai food",
      "pad thai",
      "tom yum",
      "papaya salad",
      "ส้มตำ",
      "ต้มยำ",
      "ผัดไทย",
      "อาหารไทย",
      "อาหาร",
      "แกง",
      "curry",
      "noodle",
      "ก๋วยเตี๋ยว",
    ],
    photos: [
      u("1559314809-0d155014e29e"), // pad thai
      u("1569718212165-3a8278d5f624"), // tom yum
      u("1552611052-33e04de081de"), // thai curry
      u("1455619452474-d2be8b1e70cd"), // street food
      u("1543826173-70651703c5a4"), // som tam
    ],
  },
  {
    id: "thailand-travel",
    keywords: [
      "thailand",
      "ประเทศไทย",
      "สยาม",
      "ท่องเที่ยว",
      "สถานที่",
      "เที่ยว",
      "travel thailand",
      "bangkok",
      "กรุงเทพ",
      "chiangmai",
      "เชียงใหม่",
      "phuket",
      "ภูเก็ต",
      "ayutthaya",
      "อยุธยา",
      "beach",
      "ชายหาด",
      "เกาะ",
      "island",
      "ทะเล",
    ],
    photos: [
      u("1506665531195-3566af2b4dfa"), // Thailand longtail boat
      u("1552465011-b4e21bf6e79a"), // temple
      u("1504214208698-ea1916a2195a"), // beach
      u("1528181304800-259b08848526"), // Wat Arun
      u("1513635269975-59663e0ac1ad"), // Bangkok skyline
      u("1507525428034-b723cf961d3e"), // tropical beach
    ],
  },
  {
    id: "business",
    keywords: [
      "business",
      "meeting",
      "office",
      "corporate",
      "ธุรกิจ",
      "ประชุม",
      "บริษัท",
      "teamwork",
      "ทีม",
      "startup",
      "strategy",
      "กลยุทธ์",
    ],
    photos: [
      u("1556761175-5973dc0f32e7"),
      u("1521737604893-d14cc237f11d"),
      u("1542744173-8e7e53415bb0"),
      u("1497215842964-222b430dc094"),
      u("1519389950473-47ba0277781c"),
    ],
  },
  {
    id: "technology",
    keywords: [
      "technology",
      "tech",
      "computer",
      "software",
      "เทคโนโลยี",
      "คอม",
      "คอมพิวเตอร์",
      "ai",
      "ปัญญาประดิษฐ์",
      "code",
      "programming",
      "โปรแกรม",
      "data",
      "ข้อมูล",
    ],
    photos: [
      u("1518770660439-4636190af475"),
      u("1517694712202-14dd9538aa97"),
      u("1555949963-ff9fe0c870eb"),
      u("1504384308090-c894fdcc538d"),
      u("1551288049-bebda4e38f71"),
    ],
  },
  {
    id: "health",
    keywords: [
      "health",
      "medical",
      "fitness",
      "wellness",
      "สุขภาพ",
      "ฟิตเนส",
      "ออกกำลัง",
      "ยา",
      "โรงพยาบาล",
      "nutrition",
      "โภชนาการ",
      "อาหารสุขภาพ",
    ],
    photos: [
      u("1571019613454-1cb2f99b2d8b"), // fitness
      u("1512621776951-a57141f2eefd"), // healthy bowl
      u("1498837167922-ddd27525d352"),
      u("1576091160550-2173dba999ef"),
      u("1490645935967-10de6ba17061"),
    ],
  },
  {
    id: "education",
    keywords: [
      "education",
      "school",
      "learning",
      "study",
      "student",
      "การศึกษา",
      "โรงเรียน",
      "เรียน",
      "นักเรียน",
      "book",
      "หนังสือ",
      "classroom",
    ],
    photos: [
      u("1503676260728-1c00da094a0b"),
      u("1524178232363-1fb2b075b655"),
      u("1427504494785-3a9ca7044f45"),
      u("1513258496099-48168024aec0"),
    ],
  },
  {
    id: "nature",
    keywords: [
      "nature",
      "forest",
      "mountain",
      "green",
      "ธรรมชาติ",
      "ป่า",
      "ภูเขา",
      "เขียว",
      "eco",
      "environment",
      "สิ่งแวดล้อม",
    ],
    photos: [
      u("1441974231531-c6227db76b6e"),
      u("1501785888041-af3ef285b470"),
      u("1506905925346-21bda4d32df4"),
      u("1470770841072-f978cf4d019e"),
    ],
  },
  {
    id: "soy-milk",
    keywords: ["soy milk", "น้ำเต้าหู้", "เต้าหู้", "soybean", "ถั่วเหลือง", "soy"],
    photos: [
      u("1600718374662-0483d2b9da44"),
      u("1550583724-b2692b85b150"),
      u("1517677208171-0bc6725a3e60"),
    ],
  },
  {
    id: "coffee",
    keywords: ["coffee", "espresso", "cafe", "กาแฟ", "คาเฟ่", "ร้านกาแฟ"],
    photos: [
      u("1509042239860-f550ce710b93"),
      u("1495474472287-4d71bcdd2085"),
      u("1442512595331-e89e73853f31"),
    ],
  },
  {
    id: "finance",
    keywords: [
      "finance",
      "money",
      "investment",
      "เงิน",
      "การเงิน",
      "ลงทุน",
      "หุ้น",
      "stock",
      "crypto",
      "คริปโต",
    ],
    photos: [
      u("1579621970563-ebec7560ff3e"),
      u("1554224155-6726b3ff858f"),
      u("1611974789855-9c2a0a7236a3"),
    ],
  },
  {
    id: "marketing",
    keywords: ["marketing", "การตลาด", "branding", "แบรนด์", "โฆษณา", "advertising"],
    photos: [
      u("1533750349088-cd871a92f312"),
      u("1460925895917-afdab827c52f"),
      u("1553484771-371a605b060b"),
    ],
  },
  {
    id: "city",
    keywords: ["city", "urban", "skyline", "เมือง", "ตึก", "building", "downtown", "metropolis"],
    photos: [
      u("1477959858617-67f85cf4f1df"),
      u("1449824913935-59a10b8d2000"),
      u("1480714378408-67cf0d13bc1b"),
    ],
  },
  {
    id: "abstract",
    keywords: ["abstract", "gradient", "background", "pattern", "บรรยากาศ", "พื้นหลัง"],
    photos: [
      u("1557672172-298e090bd0f1"),
      u("1557682257-2f9c37a3a5f3"),
      u("1558244661-d248897f7bc4"),
    ],
  },
];

function normalize(q: string): string {
  return q.toLowerCase().trim();
}

/**
 * Return up to `limit` image URLs that best match the query.
 * Matching is substring-based on keywords; ties broken by bucket order.
 * Falls back to the abstract bucket if nothing matches.
 */
export function searchImages(query: string, limit = 3): string[] {
  const q = normalize(query);
  if (!q) return pickFallback(limit);

  // Score buckets by how many of their keywords appear in the query.
  const scored: Array<{ b: Bucket; score: number }> = [];
  for (const b of BUCKETS) {
    let score = 0;
    for (const kw of b.keywords) {
      const k = normalize(kw);
      if (!k) continue;
      if (q.includes(k) || k.includes(q)) score += k.length;
    }
    if (score > 0) scored.push({ b, score });
  }
  scored.sort((a, b) => b.score - a.score);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const { b } of scored) {
    for (const p of b.photos) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push(p);
      if (out.length >= limit) return out;
    }
  }
  if (out.length === 0) return pickFallback(limit);
  // Pad with abstract if we didn't reach limit.
  for (const p of BUCKETS.find((b) => b.id === "abstract")!.photos) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function pickFallback(limit: number): string[] {
  return BUCKETS.find((b) => b.id === "abstract")!.photos.slice(0, limit);
}
