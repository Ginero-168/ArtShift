/**
 * Interactive Prompt Refinement Engine
 * Analyzes open/broad user image requests (e.g. "สร้างรูปแมว") and generates
 * structured attribute dimensions (สี, พื้นหลัง, มุมกล้อง, สไตล์ภาพ, สายพันธุ์)
 * allowing users to customize and build their dream prompt interactively.
 */

import { deriveGeneratedImageName } from "./imageNaming";

export interface RefinementOption {
  id: string;
  label: string;
  modifier: string;
}

export interface RefinementDimension {
  id: string;
  title: string;
  options: RefinementOption[];
}

export interface PromptRefinementCardData {
  id: string;
  originalPrompt: string;
  baseSubject: string;
  subjectType: "cat" | "dog" | "portrait" | "landscape" | "generic";
  dimensions: RefinementDimension[];
  /** Alias for dimensions to support various caller conventions */
  categories: RefinementDimension[];
  selectedOptions: Record<string, string | null>;
}

/** Determines if a user prompt is broad and could benefit from interactive refinement */
export function isBroadImagePrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed) return false;

  // Non-image commands/queries
  if (/^(สวัสดี|hello|hi|hey|ช่วยอะไรได้บ้าง|ทำอะไรได้บ้าง|ลบ|ย้าย|เปลี่ยนสีพื้นหลังสไลด์|แก้ข้อความ|undo|redo)/i.test(trimmed)) {
    return false;
  }

  // Check if it matches an image generation intent
  const imageKeywords = [
    "สร้างรูป", "สร้างภาพ", "วาดรูป", "วาดภาพ", "ขอรูป", "ขอภาพ", "ทำรูป", "ทำภาพ",
    "รูปแมว", "รูปหมา", "รูปคน", "รูปวิว", "ภาพแมว", "ภาพหมา", "ภาพคน", "ภาพวิว",
    "draw", "generate", "create image", "paint", "photo of", "picture of"
  ];

  const hasImageKeyword = imageKeywords.some((kw) => trimmed.toLowerCase().includes(kw.toLowerCase()));
  if (!hasImageKeyword) {
    return false;
  }

  // If already very long (> 100 chars or > 18 words), user has likely provided specific details
  if (trimmed.length > 100 || trimmed.split(/\s+/).length > 18) {
    return false;
  }

  // Check if it already has rich descriptive specifications
  const detailIndicators = [
    /มุมกล้อง|close-up|wide angle|eye-level|bird eye/i.test(trimmed),
    /แสง|lighting|golden hour|cinematic|neon/i.test(trimmed),
    /พื้นหลัง|ฉาก|background|environment|ริมทะเล|บนเตียง|ในห้อง/i.test(trimmed),
    /สไตล์|style|realistic|anime|3d|photorealistic|8k/i.test(trimmed),
    /นั่งอยู่บน|กำลังวิ่ง|สวมใส่|ใส่ชุด/i.test(trimmed),
  ].filter(Boolean).length;

  // If 2 or more rich details already present, it is not a broad prompt
  return detailIndicators < 2;
}

/** Subject templates with tailored attribute dimensions */
interface SubjectDimensionPreset {
  subjectType: "cat" | "dog" | "portrait" | "landscape";
  matcher: (text: string) => boolean;
  baseSubjectName: (text: string) => string;
  dimensions: RefinementDimension[];
}

const PRESETS: SubjectDimensionPreset[] = [
  // 1. Cats (แมว)
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
          { id: "3d", label: "3D Animation นุ่มฟู", modifier: "สไตล์ 3D Animation น่ารัก ขนฟูมีมิติ" },
          { id: "watercolor", label: "ภาพวาดสีน้ำ", modifier: "สไตล์ภาพวาดสีน้ำ ละมุนตา ศิลปะพริ้วไหว" },
        ],
      },
    ],
  },
  // 2. Dogs (สุนัข/หมา)
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
          { id: "action", label: "Action Shot วิ่งเล่น", modifier: "มุมกล้อง Action Shot ถ่ายทอดความร่าเริงขณะเคลื่อนไหว" },
          { id: "closeup", label: "Close-up ใบหน้า", modifier: "มุมกล้อง Close-up รอยยิ้มและแววตาสดใส" },
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
  // 3. Portraits / People (คน / บุคคล)
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
          { id: "headshot", label: "Headshot ใบหน้า", modifier: "มุมกล้อง Headshot โฟกัสใบหน้าและสายตาชัดเจน" },
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
  // 4. Landscape / Nature (วิว / ธรรมชาติ)
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
          { id: "forest", label: "ป่าเขียวขจี ลำธารใส", modifier: "ป่าไม้อุดมสมบูรณ์ แสงแดดส่องผ่านยอดไม้ลงสู่ลำธาร" },
          { id: "meadow", label: "ทุ่งดอกไม้", modifier: "ทุ่งหญ้าและดอกไม้ป่าหลากสีสัน พริ้วไหว" },
        ],
      },
      {
        id: "camera",
        title: "มุมกล้อง",
        options: [
          { id: "panoramic", label: "Panoramic มุมกว้าง", modifier: "มุมมอง Panoramic กว้างไกลสุดลูกหูลูกตา" },
          { id: "drone", label: "Drone Aerial View", modifier: "มุมมองจากโดรน Bird eye view มองจากฟากฟ้า" },
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

/** Fallback general template for any other subject */
function createGenericRefinementDimensions(subject: string): RefinementDimension[] {
  return [
    {
      id: "color",
      title: "โทนสี",
      options: [
        { id: "vibrant", label: "สีสดใส มีพลัง", modifier: "โทนสีสดใสจัดจ้าน มีพลังดึงดูดสายตา" },
        { id: "pastel", label: "พาสเทล ละมุน", modifier: "โทนสีพาสเทล นุ่มนวล อ่อนโยนสบายตา" },
        { id: "earth", label: "เอิร์ธโทน อบอุ่น", modifier: "โทนสีเอิร์ธโทน ธรรมชาติ สบายใจ" },
        { id: "dark", label: "ดาร์ก โมเดิร์น", modifier: "โทนสีเข้มหรูหรา สไตล์ดาร์กโมเดิร์น" },
        { id: "neon", label: "นีออน ล้ำยุค", modifier: "โทนสีนีออนเรืองแสง สไตล์ไซเบอร์โมเดิร์น" },
      ],
    },
    {
      id: "background",
      title: "พื้นหลัง",
      options: [
        { id: "studio", label: "สตูดิโอมินิมอล", modifier: "ฉากหลังสตูดิโอคลีน สไตล์มินิมอล สะอาดตา" },
        { id: "nature", label: "ธรรมชาติกลางแจ้ง", modifier: "ฉากธรรมชาติกลางแจ้ง มีแสงแดดสดใส" },
        { id: "room", label: "บรรยากาศในห้อง", modifier: "ฉากบรรยากาศภายในห้องตกแต่งสไตล์โมเดิร์น" },
        { id: "abstract", label: "แอบสแตรกต์ โบเก้", modifier: "ฉากหลังแอบสแตรกต์พร้อมแสงโบเก้หลากสีนุ่มนวล" },
      ],
    },
    {
      id: "camera",
      title: "มุมกล้อง",
      options: [
        { id: "front", label: "มุมตรง ชัดเจน", modifier: "มุมกล้องมองตรง สัดส่วนสมดุล มองเห็นรายละเอียดชัดเจน" },
        { id: "closeup", label: "Close-up เจาะลึก", modifier: "มุมกล้อง Close-up โฟกัสเจาะลึกเฉพาะส่วน" },
        { id: "isometric", label: "Isometric 3D", modifier: "มุมมอง 3D Isometric มีมิติสามมิติชัดเจน" },
        { id: "cinematic", label: "Cinematic กว้าง", modifier: "มุมกล้อง Cinematic มุมกว้าง แสงเงาคมชัด" },
      ],
    },
    {
      id: "style",
      title: "สไตล์ภาพ",
      options: [
        { id: "photorealistic", label: "ภาพถ่ายสมจริง", modifier: "สไตล์ภาพถ่ายสมจริง Ultra-realistic คุณภาพสูง" },
        { id: "3d", label: "3D Render", modifier: "สไตล์ 3D Render ผิวสัมผัสเนียนกริบ แสงเงานุ่มนวล" },
        { id: "flat", label: "Vector Flat Art", modifier: "สไตล์ภาพเวกเตอร์ Flat Art ลายเส้นสะอาดตา" },
        { id: "painting", label: "ภาพวาดศิลปะ", modifier: "สไตล์ภาพวาดศิลปะ มีเนื้อสีและฝีแปรงที่มีเอกลักษณ์" },
      ],
    },
  ];
}

/**
 * Creates a structured PromptRefinementCardData for a given user prompt.
 */
export function createPromptRefinement(originalPrompt: string): PromptRefinementCardData {
  const baseName = deriveGeneratedImageName(originalPrompt);
  const matchedPreset = PRESETS.find((preset) => preset.matcher(originalPrompt));

  const dimensions = matchedPreset
    ? matchedPreset.dimensions
    : createGenericRefinementDimensions(baseName);

  const baseSubject = matchedPreset ? matchedPreset.baseSubjectName(originalPrompt) : baseName;
  const subjectType = matchedPreset ? matchedPreset.subjectType : "generic";

  return {
    id: `refinement-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    originalPrompt,
    baseSubject,
    subjectType,
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
  // Use original prompt as base if available, or baseSubject
  const base = data.originalPrompt?.trim() || data.baseSubject;
  const parts: string[] = [base];

  for (const dim of data.dimensions) {
    const selected = selections[dim.id];
    if (!selected) continue;

    // Match by ID or by label or by value
    const option = dim.options.find(
      (opt) => opt.id === selected || opt.label.toLowerCase() === selected.toLowerCase()
    );

    if (option) {
      parts.push(option.modifier);
    } else {
      // Fallback direct modifier
      parts.push(`${dim.title}${selected}`);
    }
  }

  return parts.join(" ");
}
