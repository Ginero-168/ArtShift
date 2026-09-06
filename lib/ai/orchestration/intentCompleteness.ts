export type IntentAnalysis = {
  caption: string;
  objects: string[];
  visibleText: string;
};

type AssessImageIntentInput = {
  prompt: string;
  analyses: readonly IntentAnalysis[];
  hasSelection: boolean;
};

export type ClarificationOption = {
  id: "A" | "B" | "C" | "OTHER";
  label: string;
};

export type ImageIntentAssessment =
  | {
      kind: "clarification";
      question: string;
      options: ClarificationOption[];
      missing: string[];
    }
  | { kind: "ready"; missing: [] };

export function assessImageIntent(input: AssessImageIntentInput): ImageIntentAssessment {
  const prompt = input.prompt.trim();
  const normalized = prompt.toLocaleLowerCase();
  const subject = input.analyses[0]?.objects[0] || extractSubject(prompt) || "ภาพนี้";
  const hasDirection =
    /(สตูดิโอ|lifestyle|ไลฟ์สไตล์|illustration|ภาพวาด|การ์ตูน|editorial|minimal|มินิมอล|cinematic|photo|ภาพถ่าย)/iu.test(
      normalized,
    );
  const hasUse =
    /(สำหรับ|เหมาะกับ|instagram|โปสเตอร์|poster|banner|โฆษณา|profile|โปรไฟล์|story|reel|print)/iu.test(
      normalized,
    );
  const hasComposition =
    /(ฉาก|พื้นหลัง|บน|ข้าง|กลาง|มุม|ระยะ|composition|background|close[- ]?up|wide|portrait|landscape)/iu.test(
      normalized,
    );
  const hasFormat = /(?:\b\d\s*:\s*\d\b|\b(?:1:1|4:5|9:16|16:9|2:3)\b|แนวตั้ง|แนวนอน|สี่เหลี่ยม)/iu.test(
    normalized,
  );
  const isBareSubject =
    /^(?:สร้าง|ทำ|generate|create)?\s*(?:ภาพ|รูป|image|picture)?\s*(?:แมว|หมา|สุนัข|คน|รถ|บ้าน|กาแฟ|แก้วกาแฟ|[\p{L}\s-]{1,24})\s*$/iu.test(
      prompt,
    );

  if (isBareSubject || (!input.hasSelection && (!hasDirection || !hasUse) && prompt.length < 80)) {
    const caption = localizeSubject(input.analyses[0]?.caption);
    const subjectText = caption ? `จากภาพที่วิเคราะห์ได้ว่า ${caption}` : `สำหรับ ${subject}`;
    return {
      kind: "clarification",
      question: `ช่วยเลือก direction ของ ${subjectText} ก่อนสร้างภาพครับ`,
      options: [
        { id: "A", label: `${subject} แบบภาพถ่ายสตูดิโอ ฉากหลังสะอาด เหมาะกับงานโปรไฟล์` },
        { id: "B", label: `${subject} แบบ lifestyle มีบรรยากาศและบริบท เหมาะกับโพสต์โซเชียล` },
        { id: "C", label: `${subject} แบบภาพวาดหรือ editorial มี character ชัด เหมาะกับโปสเตอร์` },
        { id: "OTHER", label: "Other — บอก direction ที่ต้องการเอง" },
      ],
      missing: [
        "creative direction",
        ...(hasFormat ? [] : ["format/use"]),
        ...(hasComposition ? [] : ["composition"]),
      ],
    };
  }

  if (input.hasSelection && input.analyses.length > 0 && !hasDirection && !hasUse) {
    const caption = localizeSubject(input.analyses[0]?.caption);
    return {
      kind: "clarification",
      question: `ผมวิเคราะห์แล้วว่าเป็น ${caption} ต้องการนำไปต่อยอดแบบไหนครับ`,
      options: [
        { id: "A", label: "ภาพโฆษณาสินค้า เน้นวัตถุชัดและพื้นที่วางข้อความ" },
        { id: "B", label: "ภาพ lifestyle ใส่ฉากและแสงให้เกิดบรรยากาศ" },
        { id: "C", label: "ปรับเป็น visual style ใหม่ โดยรักษารูปทรงหลักของภาพ" },
        { id: "OTHER", label: "Other — ระบุวิธีต่อยอดเอง" },
      ],
      missing: ["intended use", "creative direction"],
    };
  }

  if (hasDirection && hasUse && (hasComposition || hasFormat || prompt.length >= 80)) {
    return { kind: "ready", missing: [] };
  }

  return {
    kind: "clarification",
    question: `ขอรายละเอียดสำคัญเพิ่มอีกนิดสำหรับ ${subject} ครับ`,
    options: [
      { id: "A", label: "เน้นตัวแบบชัด พื้นหลังเรียบ และจัดวางตรงกลาง" },
      { id: "B", label: "เน้นบรรยากาศ มีฉากประกอบและแสงที่ชัดเจน" },
      { id: "C", label: "เน้นงานกราฟิก มีพื้นที่สำหรับข้อความและการจัดองค์ประกอบ" },
      { id: "OTHER", label: "Other — บอกความต้องการเอง" },
    ],
    missing: ["creative direction"],
  };
}

function extractSubject(prompt: string): string | undefined {
  const cleaned = prompt
    .replace(/^(สร้าง|ทำ|generate|create)\s*(ภาพ|รูป|image|picture)?\s*/iu, "")
    .trim();
  return cleaned || undefined;
}

function localizeSubject(value: string | undefined): string {
  if (!value) return "ภาพที่เลือก";
  return value
    .replace(/white ceramic coffee mug/giu, "แก้วกาแฟเซรามิกสีขาว")
    .replace(/coffee mug/giu, "แก้วกาแฟ")
    .replace(/mug/giu, "แก้ว")
    .replace(/wooden table/giu, "โต๊ะไม้");
}
