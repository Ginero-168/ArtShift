/**
 * Interactive Prompt Refinement Engine
 * Builds structured pickers (with visual previews) that feed the Orchestrator:
 * - Shared Anchors (Layer 1) lock identity across turns
 * - Variant axes (Layer 2) are the only safe differences on follow-ups
 */

import { deriveGeneratedImageName } from "./imageNaming";
import type {
  SharedAnchorLock,
  VariantSelectionLock,
} from "./chatContinuity";
import {
  createBrandVariantDimensions,
  inferSharedAnchors,
  isBrandVariantBrief,
  resolveOptionPreview,
  type OptionPreview,
  type SharedAnchorHint,
} from "./promptOptionCatalog";

export interface RefinementOption {
  id: string;
  label: string;
  modifier: string;
  /** Short character pole shown under thumbnail */
  character?: string;
  preview?: OptionPreview;
}

export interface RefinementDimension {
  id: string;
  title: string;
  /** One-line guidance under the row title */
  hint?: string;
  options: RefinementOption[];
}

export type RefinementMode = "subject" | "brand-variant" | "generic";

export interface PromptRefinementCardData {
  id: string;
  originalPrompt: string;
  baseSubject: string;
  subjectType: "cat" | "dog" | "portrait" | "landscape" | "generic" | "brand";
  mode: RefinementMode;
  /** Layer-1 locks shown as read-only chips (brand / ratio / refs) */
  sharedAnchors: SharedAnchorHint[];
  dimensions: RefinementDimension[];
  /** Alias for dimensions to support various caller conventions */
  categories: RefinementDimension[];
  selectedOptions: Record<string, string | null>;
}

function withPreview(option: RefinementOption): RefinementOption {
  if (option.preview) return option;
  const preview = resolveOptionPreview(option.id);
  return preview ? { ...option, preview } : option;
}

function mapDimension(
  dim: Omit<RefinementDimension, "options"> & { options: RefinementOption[] },
): RefinementDimension {
  return {
    ...dim,
    options: dim.options.map(withPreview),
  };
}

/** Determines if a user prompt is broad and could benefit from interactive refinement */
export function isBroadImagePrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;

  if (/^(สวัสดี|hello|hi|hey|ช่วยอะไรได้บ้าง|ทำอะไรได้บ้าง|ลบ|ย้าย|เปลี่ยนสีพื้นหลังสไลด์|แก้ข้อความ|undo|redo)/i.test(trimmed)) {
    return false;
  }

  // Brand / shelf / ad briefs always benefit from Anchor+Variant picker
  if (isBrandVariantBrief(trimmed)) return true;

  const imageKeywords = [
    "สร้างรูป", "สร้างภาพ", "วาดรูป", "วาดภาพ", "ขอรูป", "ขอภาพ", "ทำรูป", "ทำภาพ",
    "รูปแมว", "รูปหมา", "รูปคน", "รูปวิว", "ภาพแมว", "ภาพหมา", "ภาพคน", "ภาพวิว",
    "draw", "generate", "create image", "paint", "photo of", "picture of",
  ];

  const hasImageKeyword = imageKeywords.some((kw) => trimmed.toLowerCase().includes(kw.toLowerCase()));
  if (!hasImageKeyword) return false;

  if (trimmed.length > 100 || trimmed.split(/\s+/).length > 18) {
    // Long brand briefs still open helper; long subject briefs do not
    return isBrandVariantBrief(trimmed);
  }

  const detailIndicators = [
    /มุมกล้อง|close-up|wide angle|eye-level|bird eye/i.test(trimmed),
    /แสง|lighting|golden hour|cinematic|neon/i.test(trimmed),
    /พื้นหลัง|ฉาก|background|environment|ริมทะเล|บนเตียง|ในห้อง/i.test(trimmed),
    /สไตล์|style|realistic|anime|3d|photorealistic|8k/i.test(trimmed),
    /นั่งอยู่บน|กำลังวิ่ง|สวมใส่|ใส่ชุด/i.test(trimmed),
  ].filter(Boolean).length;

  return detailIndicators < 2;
}

interface SubjectDimensionPreset {
  subjectType: "cat" | "dog" | "portrait" | "landscape";
  matcher: (text: string) => boolean;
  baseSubjectName: (text: string) => string;
  dimensions: RefinementDimension[];
}

const PRESETS: SubjectDimensionPreset[] = [
  {
    subjectType: "cat",
    matcher: (text) => /แมว|cat|kitten|ลูกแมว/i.test(text),
    baseSubjectName: () => "ภาพแมว",
    dimensions: [
      {
        id: "color",
        title: "สี",
        options: [
          { id: "orange", label: "ส้ม", modifier: "สีส้มสดใส" },
          { id: "black", label: "ดำ", modifier: "สีดำขลับ ดวงตาสว่าง" },
          { id: "gray", label: "เทา", modifier: "สีเทาควันบุหรี่" },
          { id: "white", label: "ขาว", modifier: "สีขาวบริสุทธิ์ ขนนุ่มฟู" },
          { id: "tabby", label: "ลายสลิด", modifier: "ลายสลิดคลาสสิก" },
          { id: "calico", label: "สามสี", modifier: "สามสี (Calico) น่ารัก" },
        ],
      },
      {
        id: "breed",
        title: "สายพันธุ์",
        options: [
          { id: "shorthair", label: "ช็อตแฮร์", modifier: "สายพันธุ์โดเมสติก ช็อตแฮร์" },
          { id: "scottish", label: "สกอตติชโฟลด์", modifier: "สายพันธุ์สกอตติชโฟลด์ หูพับ" },
          { id: "british", label: "บริติชช็อตแฮร์", modifier: "สายพันธุ์บริติชช็อตแฮร์ แก้มกลม" },
          { id: "persian", label: "เปอร์เซีย", modifier: "สายพันธุ์เปอร์เซีย ขนยาวฟู" },
          { id: "siamese", label: "สยาม", modifier: "สายพันธุ์วิเชียรมาศ ดวงตาสีฟ้า" },
        ],
      },
      {
        id: "background",
        title: "พื้นหลัง",
        options: [
          { id: "living-room", label: "ห้องนั่งเล่นอบอุ่น", modifier: "ฉากห้องนั่งเล่นอบอุ่น พื้นไม้และโซฟาสบายตา" },
          { id: "window", label: "ริมหน้าต่างแดดส่อง", modifier: "ฉากริมหน้าต่างกระจก มีแสงแดดยามเช้าส่องละมุน" },
          { id: "garden", label: "สวนดอกไม้", modifier: "ฉากสวนหย่อมกลางแจ้ง ทุ่งหญ้าและดอกไม้" },
          { id: "bed", label: "บนเตียงนอน", modifier: "ฉากบนเตียงนอนนุ่ม บรรยากาศผ่อนคลาย" },
          { id: "cafe", label: "คาเฟ่มินิมอล", modifier: "ฉากคาเฟ่มินิมอล โทนอบอุ่น" },
        ],
      },
      {
        id: "camera",
        title: "มุมกล้อง",
        options: [
          { id: "closeup", label: "Close-up", modifier: "มุมกล้อง Close-up โฟกัสใบหน้าและดวงตาคมชัด โบเก้ละมุน" },
          { id: "eyelevel", label: "มุมระดับสายตา (Eye-level)", modifier: "มุมกล้องระดับสายตา (Eye-level)" },
          { id: "topdown", label: "Top-down", modifier: "มุมกล้อง Top-down มองลงมาจากด้านบน" },
          { id: "wide", label: "มุมกว้าง", modifier: "มุมกล้องกว้าง เห็นแมวพร้อมบรรยากาศโดยรอบ" },
        ],
      },
      {
        id: "style",
        title: "สไตล์ภาพ",
        options: [
          { id: "photorealistic", label: "ภาพถ่ายสมจริง (Photorealistic)", modifier: "สไตล์ภาพถ่ายสมจริง (Photorealistic) รายละเอียดคมชัดสูง" },
          { id: "anime", label: "อนิเมะญี่ปุ่น", modifier: "สไตล์อนิเมะญี่ปุ่น สีสันสดใส ลายเส้นสะอาด" },
          { id: "3d", label: "3D Animation", modifier: "สไตล์ 3D Animation น่ารัก ขนฟูมีมิติ" },
          { id: "watercolor", label: "ภาพวาดสีน้ำ", modifier: "สไตล์ภาพวาดสีน้ำ ละมุนตา ศิลปะพริ้วไหว" },
        ],
      },
    ],
  },
  {
    subjectType: "dog",
    matcher: (text) => /หมา|สุนัข|dog|puppy|ลูกหมา/i.test(text),
    baseSubjectName: () => "ภาพสุนัข",
    dimensions: [
      {
        id: "breed",
        title: "สายพันธุ์",
        options: [
          { id: "golden", label: "โกลเด้น", modifier: "สายพันธุ์โกลเด้นรีทรีฟเวอร์ ร่าเริง ขนสีทอง" },
          { id: "corgi", label: "คอร์กี้", modifier: "สายพันธุ์เวลช์ คอร์กี้ ขาสั้น หูกาง น่ารัก" },
          { id: "shiba", label: "ชิบะ", modifier: "สายพันธุ์ชิบะอินุ ยิ้มหวาน สดใส" },
          { id: "poodle", label: "พุดเดิ้ล", modifier: "สายพันธุ์พุดเดิ้ลทอย ขนหยิกนุ่มฟู" },
          { id: "husky", label: "ไซบีเรียน", modifier: "สายพันธุ์ไซบีเรียน ฮัสกี้ เท่ ตาฟ้า" },
        ],
      },
      {
        id: "color",
        title: "สี",
        options: [
          { id: "golden-color", label: "ทอง/ครีม", modifier: "สีทองครีม อบอุ่น" },
          { id: "black-color", label: "ดำ", modifier: "สีดำเงางาม" },
          { id: "brown-color", label: "น้ำตาล", modifier: "สีน้ำตาลช็อกโกแลต" },
          { id: "white-color", label: "ขาว", modifier: "สีขาวปุย" },
        ],
      },
      {
        id: "background",
        title: "พื้นหลัง",
        options: [
          { id: "park", label: "สวนสาธารณะ", modifier: "ฉากสนามหญ้าในสวนสาธารณะ แสงแดดสดใส" },
          { id: "beach", label: "ชายหาดริมทะเล", modifier: "ฉากชายหาดริมทะเล ทรายขาว คลื่นซัดเบาๆ" },
          { id: "home", label: "สนามหญ้าหน้าบ้าน", modifier: "ฉากสนามหญ้าหน้าบ้าน บรรยากาศอบอุ่น" },
          { id: "studio", label: "สตูดิโอคลีน", modifier: "ฉากสตูดิโอสีพาสเทลสะอาดตา" },
        ],
      },
      {
        id: "camera",
        title: "มุมกล้อง",
        options: [
          { id: "eyelevel", label: "ระดับสายตา", modifier: "มุมกล้องระดับสายตา เป็นธรรมชาติ" },
          { id: "action", label: "Action Shot", modifier: "มุมกล้อง Action Shot ถ่ายทอดความร่าเริงขณะเคลื่อนไหว" },
          { id: "closeup", label: "Close-up", modifier: "มุมกล้อง Close-up รอยยิ้มและแววตาสดใส" },
        ],
      },
      {
        id: "style",
        title: "สไตล์ภาพ",
        options: [
          { id: "photorealistic", label: "ภาพถ่ายสมจริง", modifier: "สไตล์ภาพถ่ายสมจริง คมชัดลึก" },
          { id: "3d", label: "3D Animation", modifier: "สไตล์ 3D แอนิเมชันน่ารัก น่าเอ็นดู" },
          { id: "oil", label: "ภาพวาดสีน้ำมัน", modifier: "สไตล์ภาพวาดสีน้ำมัน คลาสสิก" },
        ],
      },
    ],
  },
  {
    subjectType: "portrait",
    matcher: (text) => /คน|ผู้หญิง|ผู้ชาย|เด็ก|สาว|หนุ่ม|person|woman|man|girl|boy|portrait/i.test(text),
    baseSubjectName: () => "ภาพบุคคล",
    dimensions: [
      {
        id: "look",
        title: "ลักษณะ",
        options: [
          { id: "young-woman", label: "หญิงสาววัยรุ่น", modifier: "หญิงสาวรุ่นใหม่ รอยยิ้มสดใสเป็นธรรมชาติ" },
          { id: "young-man", label: "ชายหนุ่มวัยทำงาน", modifier: "ชายหนุ่มบุคลิกดี ทันสมัย มั่นใจ" },
          { id: "child", label: "เด็กน่ารัก", modifier: "เด็กน้อยไร้เดียงสา รอยยิ้มร่าเริง" },
          { id: "business", label: "นักธุรกิจมืออาชีพ", modifier: "นักธุรกิจลุคมืออาชีพ ดูน่าเชื่อถือ" },
        ],
      },
      {
        id: "background",
        title: "พื้นหลัง",
        options: [
          { id: "office", label: "ออฟฟิศโมเดิร์น", modifier: "ฉากออฟฟิศกระจกโมเดิร์น แสงธรรมชาติ" },
          { id: "cafe", label: "คาเฟ่อบอุ่น", modifier: "ฉากคาเฟ่โทนไม้อบอุ่น ละมุนตา" },
          { id: "city", label: "วิวเมืองสตรีท", modifier: "ฉากกลางเมือง ถนนสตรีทสไตล์โมเดิร์น" },
          { id: "nature", label: "ธรรมชาติ", modifier: "ฉากธรรมชาติ ทุ่งหญ้าและต้นไม้เขียวขจี" },
        ],
      },
      {
        id: "camera",
        title: "มุมกล้อง",
        options: [
          { id: "portrait", label: "Portrait ครึ่งตัว", modifier: "มุมกล้อง Portrait ถ่ายครึ่งตัว โบเก้เบลอฉากหลัง" },
          { id: "headshot", label: "Headshot", modifier: "มุมกล้อง Headshot โฟกัสใบหน้าและสายตาชัดเจน" },
          { id: "full", label: "เต็มตัว", modifier: "มุมกล้องเต็มตัว แสดงท่าทางและชุดที่สวมใส่" },
        ],
      },
      {
        id: "style",
        title: "สไตล์ภาพ",
        options: [
          { id: "photorealistic", label: "ภาพถ่ายสตูดิโอ", modifier: "สไตล์ภาพถ่ายสตูดิโอมืออาชีพ แสงไฟนุ่มนวล" },
          { id: "cinematic", label: "Cinematic Film", modifier: "สไตล์ฟิล์มภาพยนตร์ โทนสีมีมิติ" },
          { id: "illustration", label: "ภาพวาดอิลลัสเตรต", modifier: "สไตล์ภาพวาดมินิมอลโมเดิร์น" },
        ],
      },
    ],
  },
  {
    subjectType: "landscape",
    matcher: (text) => /วิว|ธรรมชาติ|ภูเขา|ทะเล|ท้องฟ้า|landscape|nature|mountain|beach|sky/i.test(text),
    baseSubjectName: () => "ภาพทิวทัศน์ธรรมชาติ",
    dimensions: [
      {
        id: "scenery",
        title: "บรรยากาศ",
        options: [
          { id: "sunset", label: "พระอาทิตย์ตกริมทะเล", modifier: "พระอาทิตย์ตกริมชายหาด ท้องฟ้าไล่เฉดสีส้มชมพูทอง" },
          { id: "mountain-mist", label: "ภูเขาเคล้าสายหมอก", modifier: "เทือกเขาสลับซับซ้อน ท่ามกลางหมอกยามเช้าตรู่" },
          { id: "forest", label: "ป่าเขียวขจี", modifier: "ป่าไม้อุดมสมบูรณ์ แสงแดดส่องผ่านยอดไม้ลงสู่ลำธาร" },
          { id: "meadow", label: "ทุ่งดอกไม้", modifier: "ทุ่งหญ้าและดอกไม้ป่าหลากสีสัน พริ้วไหว" },
        ],
      },
      {
        id: "camera",
        title: "มุมกล้อง",
        options: [
          { id: "panoramic", label: "Panoramic", modifier: "มุมมอง Panoramic กว้างไกลสุดลูกหูลูกตา" },
          { id: "drone", label: "Drone Aerial", modifier: "มุมมองจากโดรน Bird eye view มองจากฟากฟ้า" },
          { id: "eyelevel", label: "ระดับสายตา", modifier: "มุมมองระดับสายตา เสมือนยืนอยู่จริง" },
        ],
      },
      {
        id: "style",
        title: "สไตล์ภาพ",
        options: [
          { id: "photorealistic", label: "ภาพถ่ายทิวทัศน์จริง", modifier: "สไตล์ภาพถ่าย Landscape มืออาชีพ รายละเอียดสูง คมชัดลึก" },
          { id: "ghibli", label: "อนิเมะจิบลิ", modifier: "สไตล์ภาพวาดอนิเมะ Studio Ghibli อบอุ่น ชวนฝัน" },
          { id: "watercolor", label: "ภาพวาดสีน้ำ", modifier: "สไตล์ภาพวาดสีน้ำธรรมชาติ ไล่โทนสีนุ่มนวล" },
        ],
      },
    ],
  },
];

function createGenericRefinementDimensions(): RefinementDimension[] {
  return [
    {
      id: "color",
      title: "โทนสี",
      hint: "ขั้วสีของภาพ",
      options: [
        { id: "vibrant", label: "สีสดใส มีพลัง", character: "จัดจ้าน", modifier: "โทนสีสดใสจัดจ้าน มีพลังดึงดูดสายตา" },
        { id: "pastel", label: "พาสเทล ละมุน", character: "นุ่มนวล", modifier: "โทนสีพาสเทล นุ่มนวล อ่อนโยนสบายตา" },
        { id: "earth", label: "เอิร์ธโทน อบอุ่น", character: "ธรรมชาติ", modifier: "โทนสีเอิร์ธโทน ธรรมชาติ สบายใจ" },
        { id: "dark", label: "ดาร์ก โมเดิร์น", character: "หรูเข้ม", modifier: "โทนสีเข้มหรูหรา สไตล์ดาร์กโมเดิร์น" },
        { id: "neon", label: "นีออน ล้ำยุค", character: "เรืองแสง", modifier: "โทนสีนีออนเรืองแสง สไตล์ไซเบอร์โมเดิร์น" },
      ],
    },
    {
      id: "background",
      title: "พื้นหลัง",
      hint: "ฉากที่รองรับตัวแบบ",
      options: [
        { id: "studio", label: "สตูดิโอมินิมอล", character: "คลีน", modifier: "ฉากหลังสตูดิโอคลีน สไตล์มินิมอล สะอาดตา" },
        { id: "nature", label: "ธรรมชาติกลางแจ้ง", character: "กลางแจ้ง", modifier: "ฉากธรรมชาติกลางแจ้ง มีแสงแดดสดใส" },
        { id: "room", label: "บรรยากาศในห้อง", character: "อินดอร์", modifier: "ฉากบรรยากาศภายในห้องตกแต่งสไตล์โมเดิร์น" },
        { id: "abstract", label: "แอบสแตรกต์ โบเก้", character: "โบเก้", modifier: "ฉากหลังแอบสแตรกต์พร้อมแสงโบเก้หลากสีนุ่มนวล" },
      ],
    },
    {
      id: "camera",
      title: "มุมกล้อง",
      hint: "มุมมองและการจัดเฟรม",
      options: [
        { id: "front", label: "มุมตรง ชัดเจน", character: "สมดุล", modifier: "มุมกล้องมองตรง สัดส่วนสมดุล มองเห็นรายละเอียดชัดเจน" },
        { id: "closeup", label: "Close-up เจาะลึก", character: "เจาะลึก", modifier: "มุมกล้อง Close-up โฟกัสเจาะลึกเฉพาะส่วน" },
        { id: "isometric", label: "Isometric 3D", character: "มิติ", modifier: "มุมมอง 3D Isometric มีมิติสามมิติชัดเจน" },
        { id: "cinematic", label: "Cinematic กว้าง", character: "กว้าง", modifier: "มุมกล้อง Cinematic มุมกว้าง แสงเงาคมชัด" },
      ],
    },
    {
      id: "style",
      title: "สไตล์ภาพ",
      hint: "ภาษาภาพหลัก",
      options: [
        { id: "photorealistic", label: "ภาพถ่ายสมจริง", character: "สมจริง", modifier: "สไตล์ภาพถ่ายสมจริง Ultra-realistic คุณภาพสูง" },
        { id: "3d", label: "3D Render", character: "เรนเดอร์", modifier: "สไตล์ 3D Render ผิวสัมผัสเนียนกริบ แสงเงานุ่มนวล" },
        { id: "flat", label: "Vector Flat Art", character: "แบนราบ", modifier: "สไตล์ภาพเวกเตอร์ Flat Art ลายเส้นสะอาดตา" },
        { id: "painting", label: "ภาพวาดศิลปะ", character: "ศิลปะ", modifier: "สไตล์ภาพวาดศิลปะ มีเนื้อสีและฝีแปรงที่มีเอกลักษณ์" },
      ],
    },
  ].map(mapDimension);
}

/**
 * Creates a structured PromptRefinementCardData for a given user prompt.
 * Brand/ad/shelf briefs → Shared Anchor + Variant axes (Orchestrator-aligned).
 */
export function createPromptRefinement(originalPrompt: string): PromptRefinementCardData {
  if (isBrandVariantBrief(originalPrompt)) {
    const brandDims = createBrandVariantDimensions().map((dim) =>
      mapDimension({
        id: dim.id,
        title: dim.title,
        hint: dim.hint,
        options: dim.options.map((opt) => ({
          id: opt.id,
          label: opt.label,
          character: opt.character,
          modifier: opt.modifier,
          preview: opt.preview,
        })),
      }),
    );
    return {
      id: `refinement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      originalPrompt,
      baseSubject: deriveGeneratedImageName(originalPrompt),
      subjectType: "brand",
      mode: "brand-variant",
      sharedAnchors: inferSharedAnchors(originalPrompt),
      dimensions: brandDims,
      categories: brandDims,
      selectedOptions: {},
    };
  }

  const baseName = deriveGeneratedImageName(originalPrompt);
  const matchedPreset = PRESETS.find((preset) => preset.matcher(originalPrompt));
  const rawDimensions = matchedPreset
    ? matchedPreset.dimensions
    : createGenericRefinementDimensions();
  const dimensions = rawDimensions.map(mapDimension);
  const baseSubject = matchedPreset ? matchedPreset.baseSubjectName(originalPrompt) : baseName;
  const subjectType = matchedPreset ? matchedPreset.subjectType : "generic";
  const mode: RefinementMode = matchedPreset ? "subject" : "generic";

  return {
    id: `refinement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    originalPrompt,
    baseSubject,
    subjectType,
    mode,
    sharedAnchors: inferSharedAnchors(originalPrompt),
    dimensions,
    categories: dimensions,
    selectedOptions: {},
  };
}

/**
 * Builds the live dynamic prompt string from active user selections on the card.
 */
export function buildRefinedPromptString(
  data: PromptRefinementCardData,
  selections: Record<string, string | null>,
): string {
  const base = data.originalPrompt?.trim() || data.baseSubject;
  const parts: string[] = [base];

  if (data.mode === "brand-variant" && data.sharedAnchors.length > 0) {
    parts.push(
      `[Shared anchors locked: ${data.sharedAnchors.map((a) => a.label).join(", ")}]`,
    );
  }

  for (const dim of data.dimensions) {
    const selected = selections[dim.id];
    if (!selected) continue;
    const option = dim.options.find(
      (opt) => opt.id === selected || opt.label.toLowerCase() === selected.toLowerCase(),
    );
    if (option) {
      parts.push(option.modifier);
    } else {
      parts.push(`${dim.title}${selected}`);
    }
  }

  return parts.join(" ");
}

/** Structured payload for Orchestrator generationContext from helper selections. */
export function buildRefinementOrchestratorLocks(
  data: PromptRefinementCardData,
  selections: Record<string, string | null>,
): {
  refinementMode: RefinementMode;
  sharedAnchors: SharedAnchorLock[];
  variantSelections: VariantSelectionLock[];
} {
  const sharedAnchors: SharedAnchorLock[] = data.sharedAnchors.map((a) => ({
    id: a.id,
    label: a.label,
    detail: a.detail,
  }));

  const variantSelections: VariantSelectionLock[] = [];
  for (const dim of data.dimensions) {
    const selected = selections[dim.id];
    if (!selected) continue;
    const option = dim.options.find(
      (opt) => opt.id === selected || opt.label.toLowerCase() === selected.toLowerCase(),
    );
    if (!option) continue;
    variantSelections.push({
      axisId: dim.id,
      axisTitle: dim.title,
      optionId: option.id,
      label: option.label,
      character: option.character,
      modifier: option.modifier,
    });
  }

  return {
    refinementMode: data.mode,
    sharedAnchors,
    variantSelections,
  };
}
