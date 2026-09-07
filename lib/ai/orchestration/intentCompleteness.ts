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

type ClarificationContext = {
  prompt: string;
  topic: string;
  isInfographic: boolean;
  hasSelection: boolean;
};

export function assessImageIntent(input: AssessImageIntentInput): ImageIntentAssessment {
  const prompt = input.prompt.trim();
  const normalized = prompt.toLocaleLowerCase();
  const analyzedSubject = input.analyses[0]?.objects[0];
  const topic = analyzedSubject ? localizeSubject(analyzedSubject) : extractTopic(prompt) || "ภาพนี้";
  const hasDirection =
    /(สตูดิโอ|lifestyle|ไลฟ์สไตล์|illustration|ภาพวาด|การ์ตูน|editorial|minimal|มินิมอล|cinematic|photo|ภาพถ่าย|โฟกัส|เล่าเรื่อง|ตัวละคร|มาสคอต|สไตล์ภาพ|visual\s+language|style)/iu.test(
      normalized,
    );
  const hasUse =
    /(สำหรับ|เหมาะกับ|ใช้สำหรับ|การใช้งาน|instagram|โปสเตอร์|poster|banner|โฆษณา|profile|โปรไฟล์|story|reel|print)/iu.test(
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
    /^(?:สร้าง|ทำ|generate|create)?\s*(?:ภาพ|รูป|image|picture)?\s*(?:แมว|หมา|สุนัข|คน|รถ|บ้าน|กาแฟ|แก้วกาแฟ|[\p{L}\s-]{1,40})\s*$/iu.test(
      prompt,
    );
  const context: ClarificationContext = {
    prompt,
    topic,
    isInfographic: isInfographicPrompt(normalized),
    hasSelection: input.hasSelection,
  };

  if (isBareSubject || (!input.hasSelection && (!hasDirection || !hasUse) && prompt.length < 80)) {
    const caption = localizeSubject(input.analyses[0]?.caption);
    const subjectText = caption ? `จากภาพที่วิเคราะห์ได้ว่า ${caption}` : `สำหรับ ${topic}`;
    return {
      kind: "clarification",
      question: `ช่วยเลือก direction ของ ${subjectText} ก่อนสร้างภาพครับ`,
      options: buildClarificationOptions(context),
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
      options: buildClarificationOptions(context),
      missing: ["intended use", "creative direction"],
    };
  }

  if (hasDirection && hasUse && (hasComposition || hasFormat || prompt.length >= 80)) {
    return { kind: "ready", missing: [] };
  }

  return {
    kind: "clarification",
    question: `ขอรายละเอียดสำคัญเพิ่มอีกนิดสำหรับ ${topic} ครับ`,
    options: buildClarificationOptions(context),
    missing: ["creative direction"],
  };
}

export function composeClarifiedImagePrompt(originalPrompt: string, direction: string): string {
  const original = originalPrompt.trim();
  const topic = extractTopic(original) || original || "หัวข้อที่ระบุ";
  const format = isInfographicPrompt(original) ? "อินโฟกราฟิก" : "ภาพ";
  const selectedDirection = direction.trim() || "สร้างสรรค์ตาม brief เดิม";
  return [
    `สร้างภาพ${format}เกี่ยวกับ${topic}`,
    `หัวข้อและเจตนาจากผู้ใช้: ${original}`,
    `สไตล์ภาพที่เลือก: ${selectedDirection}`,
    `การใช้งาน: จัดองค์ประกอบให้เหมาะกับ brief และปลายทางของผู้ใช้`,
    `รักษาหัวข้อหลัก ${topic} ให้เด่นชัด และจัดองค์ประกอบให้สอดคล้องกับรูปแบบการใช้งานที่ระบุ`,
  ].join("\n");
}

function buildClarificationOptions(context: ClarificationContext): ClarificationOption[] {
  const topic = context.topic;
  if (context.isInfographic) {
    const format = `อินโฟกราฟิกเกี่ยวกับ${topic}`;
    const processWord = hasProcessCue(context.prompt) ? "ลำดับการอธิบาย" : "โครงสร้างการอธิบาย";
    return [
      {
        id: "A",
        label: `${format} แบบ${processWord} ใช้ภาพหลัก ลูกศร และคำกำกับสั้น ๆ ให้เห็นความสัมพันธ์ของข้อมูลชัดเจน`,
      },
      {
        id: "B",
        label: `${format} แบบเปรียบเทียบชนิดหรือคุณสมบัติของ${topic} ใช้ไอคอนและข้อมูลเป็นส่วน ๆ อ่านง่าย`,
      },
      {
        id: "C",
        label: `${format} แบบภาพวาดกึ่ง editorial มีตัวละครหรือมาสคอตที่สื่อสารเรื่อง${topic} เหมาะกับโปสเตอร์`,
      },
      { id: "OTHER", label: "Other — บอก direction ที่ต้องการเอง" },
    ];
  }

  return [
    {
      id: "A",
      label: `${topic} แบบโฟกัสหัวข้อหลัก จัดแสงและองค์ประกอบให้เห็นรายละเอียดชัดเจน`,
    },
    {
      id: "B",
      label: `${topic} แบบเล่าเรื่อง มีฉาก บรรยากาศ และบริบทที่ช่วยขยายความหมายของหัวข้อ`,
    },
    {
      id: "C",
      label: `${topic} แบบภาพวาดกึ่ง editorial มี character หรือ visual language ที่ชัดเจน`,
    },
    { id: "OTHER", label: "Other — บอก direction ที่ต้องการเอง" },
  ];
}

function isInfographicPrompt(value: string): boolean {
  return /(?:infographic|อินโฟกราฟิก|information\s+graphic|แผนภาพข้อมูล)/iu.test(value);
}

function hasProcessCue(value: string): boolean {
  return /(?:การเกิด|ขั้นตอน|กระบวนการ|วงจร|ลำดับ|process|how\s+it\s+works|ทำงานอย่างไร)/iu.test(value);
}

function extractTopic(prompt: string): string | undefined {
  const cleaned = stripImageCommand(prompt)
    .replace(/[.!?。！？]+$/u, "")
    .trim();
  const infographicTopic = cleaned.match(
    /^(?:infographic|อินโฟกราฟิก|information\s+graphic|แผนภาพข้อมูล)\s*(?:(?:ที่\s*)?(?:เกี่ยวกับ|เรื่อง|ของ)|about|on)\s*(.+?)\s*$/iu,
  );
  if (infographicTopic?.[1]) return trimTopic(infographicTopic[1]);
  const aboutTopic = cleaned.match(/^(?:เกี่ยวกับ|about|on|เรื่อง)\s+(.+?)\s*$/iu);
  if (aboutTopic?.[1]) return trimTopic(aboutTopic[1]);
  return cleaned || undefined;
}

function stripImageCommand(prompt: string): string {
  return prompt
    .trim()
    .replace(
      /^(?:(?:ช่วย|ขอ)\s*)?(?:สร้างรูปภาพ|สร้างรูป|ทำรูปภาพ|ทำรูป|ทำภาพ|วาดรูปภาพ|วาดรูป|สร้างภาพ|วาดภาพ|ขอภาพ|ขอรูป|สร้าง(?:\s+)?อินโฟกราฟิก|ทำ(?:\s+)?อินโฟกราฟิก|สร้าง\s+infographic|ทำ\s+infographic|generate image|create image|generate infographic|create infographic)\s*/iu,
      "",
    )
    .replace(/\s*(?:ให้หน่อย|หน่อย|นะ|ครับ|ค่ะ|จ้า)\s*$/iu, "")
    .trim();
}

function trimTopic(value: string): string {
  return value
    .replace(/\s+(?:สำหรับ|เหมาะกับ|ใช้สำหรับ|for)\s+.+$/iu, "")
    .replace(/[,:;]+$/u, "")
    .trim();
}

function localizeSubject(value: string | undefined): string {
  if (!value) return "ภาพที่เลือก";
  return value
    .replace(/white ceramic coffee mug/giu, "แก้วกาแฟเซรามิกสีขาว")
    .replace(/coffee mug/giu, "แก้วกาแฟ")
    .replace(/mug/giu, "แก้ว")
    .replace(/wooden table/giu, "โต๊ะไม้");
}
