import { isImageFollowUpPrompt } from "./chatContinuity";

/**
 * Grill-me for ArtShift chat.
 * The orchestrator maps an under-specified creative brief as a design tree and
 * asks one frontier question per turn — the next decision that would materially
 * change the image — with a recommended answer the user can accept.
 * Clear briefs, settled-plan tweaks, and explicit "just generate" pushback skip it.
 */

export type GrillNode = "campaign-subject" | "offer" | "depict";

export type GrillProceedReason = "skip" | "specific" | "follow-up" | "frontier-clear";

export type GrillQuestion = {
  node: GrillNode;
  ask: string;
  recommended: string;
  options: readonly string[];
};

export type GrillAssessment =
  | { action: "ask"; round: number; node: GrillNode; question: GrillQuestion }
  | { action: "proceed"; reason: GrillProceedReason; settled: readonly string[] }
  | { action: "defer" };

export type GrillContext = {
  prompt: string;
  conversationHistory?: readonly { role: "user" | "assistant"; content: string }[];
  canvasSummary?: { brandName?: string };
  referenceAnalyses?: readonly {
    caption?: string;
    objects?: readonly string[];
    visibleText?: string;
  }[];
  lastGeneration?: unknown;
};

const RECOMMENDED_MARK = "➡️ แนะนำ:";

const THAI_STRIP_PHRASES = [
  "โฆษณาโปรโมชัน",
  "โฆษณาโปรโมชั่น",
  "โปรโมชั่น",
  "โปรโมชัน",
  "โปรโมท",
  "แคมเปญ",
  "โปสเตอร์",
  "แบนเนอร์",
  "โฆษณา",
  "ออกแบบป้ายหมวด",
  "ออกแบบป้าย",
  "ป้ายหมวด",
  "สร้างรูปภาพ",
  "สร้างภาพ",
  "สร้างรูป",
  "วาดรูป",
  "วาดภาพ",
  "ทำรูป",
  "ทำภาพ",
  "ให้หน่อย",
  "หน่อยครับ",
  "หน่อยค่ะ",
  "หน่อย",
  "นะครับ",
  "นะคะ",
  "ครับ",
  "ค่ะ",
].sort((a, b) => b.length - a.length);

const LATIN_STRIP_PHRASES = [
  "advertisement",
  "promotional",
  "advertising",
  "promotion",
  "campaign",
  "generate",
  "picture",
  "poster",
  "banner",
  "create",
  "design",
  "please",
  "image",
  "promo",
  "advert",
];

const RESIDUE_STOP = new Set([
  "แบบ",
  "สำหรับ",
  "studio",
  "minimal",
  "minimalist",
  "modern",
  "สวย",
  "ใหม่",
  "งาน",
  "ภาพ",
  "รูป",
  "the",
  "and",
  "with",
  "for",
  "from",
  "this",
  "that",
  "square",
  "photo",
  "graphic",
  "flat",
  "instagram",
  "facebook",
  "social",
  "ad",
  "of",
  "a",
  "an",
  "on",
  "in",
  "to",
  "ให้",
  "มา",
  "ของ",
  "ใน",
  "และ",
  "กับ",
  "ที่",
  "เป็น",
  "ชื่อว่า",
  "ขาย",
]);

const GENERIC_CONTEXT_TOKENS = new Set([
  ...RESIDUE_STOP,
  "background",
  "text",
  "person",
  "people",
  "layout",
  "shape",
  "color",
  "object",
  "logo",
  "brand",
]);

const OFFER_ONLY = new Set([
  "off",
  "sale",
  "free",
  "ลด",
  "ฟรี",
  "แถม",
  "เปิดตัว",
  "ส่วนลด",
  "ราคา",
  "bogo",
]);

type DialogueTurn = { role: "user" | "assistant"; content: string };

export function formatGrillClarification(question: GrillQuestion): {
  question: string;
  options: string[];
} {
  const options = question.options.slice(0, 4);
  const text = [
    `**${question.ask}**`,
    "",
    `${RECOMMENDED_MARK} ${question.recommended}`,
    "",
    "เลือกแนวที่ใกล้สุด หรือพิมพ์คำตอบเอง:",
    ...options.map((option) => `- ${option}`),
  ].join("\n");
  return {
    question: text.length > 1_000 ? text.slice(0, 1_000) : text,
    options,
  };
}

export function formatGrillProceedBlock(
  assessment: Extract<GrillAssessment, { action: "proceed" }>,
): string {
  const settled =
    assessment.settled.length > 0
      ? assessment.settled.join("; ")
      : "none — use the brief and context";
  return [
    "=== GRILL ASSESSMENT ===",
    "action: PROCEED",
    `reason: ${assessment.reason}`,
    `settled: ${settled}`,
    "Frontier is empty. Do not return kind clarification. Execute with image-task or answer, and use best defaults for any unspoken aesthetic choice.",
  ].join("\n");
}

export function grillNodeFromQuestion(text: string): GrillNode | null {
  if (
    text.includes("โปรโมทอะไรเป็นหลัก") ||
    text.includes("เรื่องหลักของงานนี้") ||
    text.includes("What should this promote") ||
    text.includes("What is this piece about")
  ) {
    return "campaign-subject";
  }
  if (text.includes("ข้อเสนอ") || text.includes("main offer")) return "offer";
  if (text.includes("อยากได้ภาพอะไรเป็นหลัก") || text.includes("What should the image show")) {
    return "depict";
  }
  return null;
}

export function isGrillSkipUtterance(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  return (
    /ไม่ต้องถาม|ไม่ต้องซัก|อย่าถาม|ทำเลย|จัดเลย|เจนเลย|สร้างเลย/.test(value) ||
    /(?:^|\s)ข้าม(?:\s|$|เลย|คำถาม|ไป)/.test(value) ||
    /\b(?:just generate|just do it|don'?t ask|do not ask|stop asking|skip(?:\s+the)?\s+questions?)\b/i.test(
      value,
    )
  );
}

export function assessGrill(input: GrillContext): GrillAssessment {
  const history = input.conversationHistory ?? [];
  const userText = userFactText(input.prompt, history);
  const contextText = contextFactText(input);
  const latest = latestUserUtterance(input.prompt);
  const thai = prefersThai(userText || latest);
  const turns = dialogueTurns(input.prompt, history);
  const dialogueSettled = new Set<GrillNode>();
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    if (turn?.role !== "assistant") continue;
    const node = grillNodeFromQuestion(turn.content);
    if (!node) continue;
    const reply = turns[i + 1];
    if (reply?.role === "user" && replySettles(reply.content, node)) dialogueSettled.add(node);
  }

  const answeringGrill =
    /Director question:/u.test(input.prompt) ||
    grillNodeFromQuestion(history.at(-1)?.content ?? "") !== null;

  if (isGrillSkipUtterance(latest)) {
    return {
      action: "proceed",
      reason: "skip",
      settled: describeSettled(userText, contextText, dialogueSettled, thai),
    };
  }

  if (
    !answeringGrill &&
    hasPriorPlan(input) &&
    (isImageFollowUpPrompt(latest) || isImageFollowUpPrompt(input.prompt))
  ) {
    return { action: "proceed", reason: "follow-up", settled: [] };
  }

  const candidate = isGrillCandidate(userText);
  if (!candidate && !answeringGrill) return { action: "defer" };

  const subjectKnown =
    dialogueSettled.has("campaign-subject") ||
    dialogueSettled.has("depict") ||
    hasSubject(userText) ||
    hasSubject(contextText);
  const promo = needsOfferDecision(userText);
  const offerKnown =
    !promo || dialogueSettled.has("offer") || hasOffer(userText) || hasOffer(contextText);
  const round = countGrillRounds(turns) + 1;
  const label = inferSubjectLabel(userText, contextText, dialogueSettled, thai);

  if (!subjectKnown && isCampaignBrief(userText)) {
    return ask("campaign-subject", round, campaignSubjectQuestion(userText, thai));
  }
  if (!subjectKnown && isBareImageAsk(userText)) {
    return ask("depict", round, depictQuestion(thai));
  }
  if (subjectKnown && promo && !offerKnown) {
    return ask("offer", round, offerQuestion(label, thai));
  }

  if (candidate || answeringGrill) {
    return {
      action: "proceed",
      reason: answeringGrill ? "frontier-clear" : "specific",
      settled: describeSettled(userText, contextText, dialogueSettled, thai),
    };
  }
  return { action: "defer" };
}

function ask(node: GrillNode, round: number, question: GrillQuestion): GrillAssessment {
  return { action: "ask", round, node, question: { ...question, node } };
}

function campaignSubjectQuestion(userText: string, thai: boolean): GrillQuestion {
  const promo =
    /โฆษณา|แคมเปญ|\bcampaign\b|\bad\b|\badvert|\bpromo\b/i.test(userText) ||
    needsOfferDecision(userText);
  if (!thai) {
    return promo
      ? {
          node: "campaign-subject",
          ask: "What should this promote?",
          recommended:
            "A drink as the hero (for example one coffee) — I'll use this if you don't specify.",
          options: ["Coffee / a drink", "Food", "A beauty product", "Something else (type it)"],
        }
      : {
          node: "campaign-subject",
          ask: "What is this piece about?",
          recommended:
            "A single product hero on a clean ground — I'll use this if you don't specify.",
          options: ["A product hero", "An event", "A book or film", "Something else (type it)"],
        };
  }
  return promo
    ? {
        node: "campaign-subject",
        ask: "โปรโมทอะไรเป็นหลักครับ?",
        recommended: "เครื่องดื่มเป็นพระเอกของภาพ (เช่น กาแฟแก้วหนึ่ง) — ถ้าไม่ได้ระบุ ผมจะใช้แนวนี้",
        options: ["เครื่องดื่ม / กาแฟ", "อาหาร", "สินค้าความงาม", "อื่น ๆ (พิมพ์เอง)"],
      }
    : {
        node: "campaign-subject",
        ask: "เรื่องหลักของงานนี้คืออะไรครับ?",
        recommended: "สินค้าชิ้นเดียวเป็นพระเอกบนพื้นเรียบ — ถ้าไม่ได้ระบุ ผมจะใช้แนวนี้",
        options: ["สินค้าชิ้นเดียว", "งานอีเวนต์", "หนังสือหรือภาพยนตร์", "อื่น ๆ (พิมพ์เอง)"],
      };
}

function offerQuestion(subjectLabel: string, thai: boolean): GrillQuestion {
  if (!thai) {
    const about = subjectLabel ? ` for ${subjectLabel}` : "";
    return {
      node: "offer",
      ask: `What is the main offer${about}?`,
      recommended: "A clear 30% off — I'll use that line if you don't specify.",
      options: ["30% off", "Buy 1 get 1", "New launch", "Something else (type it)"],
    };
  }
  const about = subjectLabel ? `ของ ${subjectLabel} ` : "";
  return {
    node: "offer",
    ask: `ข้อเสนอหลัก${about}บนภาพคืออะไรครับ?`,
    recommended: "ลด 30% ตัวหนังสือชัด — ถ้าไม่ได้ระบุ ผมจะใช้ข้อความนี้",
    options: ["ลด 30%", "ซื้อ 1 แถม 1", "เปิดตัวสินค้าใหม่", "อื่น ๆ (พิมพ์เอง)"],
  };
}

function depictQuestion(thai: boolean): GrillQuestion {
  if (!thai) {
    return {
      node: "depict",
      ask: "What should the image show?",
      recommended: "A cat in a softly lit room, photographic — I'll use this if you don't specify.",
      options: ["A cat indoors", "A landscape", "A cartoon character", "Something else (type it)"],
    };
  }
  return {
    node: "depict",
    ask: "อยากได้ภาพอะไรเป็นหลักครับ?",
    recommended: "แมวนั่งในห้องแสงนุ่ม สไตล์ภาพถ่าย — ถ้าไม่ได้ระบุ ผมจะใช้แนวนี้",
    options: ["แมวนั่งในห้อง", "ทิวทัศน์ธรรมชาติ", "ตัวละครการ์ตูน", "อื่น ๆ (พิมพ์เอง)"],
  };
}

function describeSettled(
  userText: string,
  contextText: string,
  dialogueSettled: ReadonlySet<GrillNode>,
  thai: boolean,
): string[] {
  const notes: string[] = [];
  const label = inferSubjectLabel(userText, contextText, dialogueSettled, thai);
  if (label) notes.push(`subject: ${label}`);
  else if (dialogueSettled.has("campaign-subject") || dialogueSettled.has("depict")) {
    notes.push(thai ? "subject: ตามคำแนะนำ" : "subject: recommended default");
  }
  if (dialogueSettled.has("offer") || hasOffer(userText) || hasOffer(contextText)) {
    notes.push(thai ? "offer: มีในบรีฟหรือบริบท" : "offer: stated in the brief or context");
  }
  return notes;
}

function inferSubjectLabel(
  userText: string,
  contextText: string,
  dialogueSettled: ReadonlySet<GrillNode>,
  thai: boolean,
): string {
  const fromUser = firstContentToken(userText);
  if (fromUser) return fromUser.slice(0, 40);
  const fromContext = firstContentToken(contextText);
  if (fromContext) return fromContext.slice(0, 40);
  if (dialogueSettled.has("campaign-subject") || dialogueSettled.has("depict")) {
    return thai ? "เครื่องดื่ม" : "a drink";
  }
  return "";
}

function firstContentToken(text: string): string {
  const tokens = contentTokens(text).filter(
    (token) => token.length <= 24 && !OFFER_ONLY.has(token) && !GENERIC_CONTEXT_TOKENS.has(token),
  );
  return tokens[0] ?? "";
}

function hasSubject(text: string): boolean {
  return contentTokens(text).some(
    (token) => !OFFER_ONLY.has(token) && !GENERIC_CONTEXT_TOKENS.has(token),
  );
}

function contentTokens(text: string): string[] {
  return extractContentResidue(text)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !/^\d+$/.test(token));
}

function extractContentResidue(text: string): string {
  let value = text.toLocaleLowerCase();
  value = value.replace(/\d+\s*[x×*]\s*\d+\s*(?:cm|mm|px|ซม\.?|มม\.?)?/gi, " ");
  value = value.replace(/\d+\s*:\s*\d+/g, " ");
  value = value.replace(/ลด\s*\d+\s*%?/g, " ");
  value = value.replace(/\d+\s*%/g, " ");
  value = value.replace(/สไตล์\S*/g, " ");
  value = value.replace(/พื้นหลัง\S*/g, " ");
  value = value.replace(/ขนาด\S*/g, " ");
  value = value.replace(/สัดส่วน\S*/g, " ");
  value = value.replace(/แนวตั้ง|แนวนอน|\bportrait\b|\blandscape\b/gi, " ");
  for (const phrase of THAI_STRIP_PHRASES) {
    value = value.split(phrase).join(" ");
  }
  for (const phrase of LATIN_STRIP_PHRASES) {
    value = value.replace(new RegExp(`\\b${phrase}\\b`, "gi"), " ");
  }
  value = value.replace(/\s+/g, " ").trim();
  value = value.replace(/^(?:ช่วย|กรุณา|ทำ|สร้าง|ออกแบบ|วาด|ขอ)\s*/u, "");
  value = value.replace(/[^0-9a-z\u0E00-\u0E7F]+/gi, " ");
  const tokens = value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !RESIDUE_STOP.has(token));
  return tokens.join(" ");
}

function hasOffer(text: string): boolean {
  return /ลด\s*\d+|\d+\s*%|ฟรี|แถม|ซื้อ\s*\d|เปิดตัว|\bbogo\b|\bsale\b|\boff\b|flash\s*sale|ข้อเสนอ/i.test(
    text,
  );
}

function needsOfferDecision(text: string): boolean {
  return /โปรโม(?:ชัน|ชั่น|ท)|ส่วนลด|\bsale\b|\bpromo\b|\bpromotion\b|จัดโปร/i.test(text);
}

function isCampaignBrief(text: string): boolean {
  return (
    /โฆษณา|โปรโม(?:ชัน|ชั่น|ท)|แคมเปญ|โปสเตอร์|แบนเนอร์|\bposter\b|\bbanner\b|\bcampaign\b|\bpromo\b|\badvert|\bad\b/i.test(
      text,
    ) || /(?:ออกแบบ|ทำ|สร้าง)\s*ป้าย/u.test(text)
  );
}

function isBareImageAsk(text: string): boolean {
  if (isCampaignBrief(text)) return false;
  if (
    !/(?:สร้าง|วาด|ทำ)\s*(?:รูป|ภาพ)|สร้างรูป|สร้างภาพ|วาดรูป|วาดภาพ|(?:generate|create|draw)\s+(?:an?\s+)?(?:image|picture)/i.test(
      text,
    )
  ) {
    return false;
  }
  return !hasSubject(text);
}

function isGrillCandidate(text: string): boolean {
  return isCampaignBrief(text) || isBareImageAsk(text);
}

function prefersThai(text: string): boolean {
  if (/[\u0E00-\u0E7F]/u.test(text)) return true;
  if (/[A-Za-z]/.test(text)) return false;
  return true;
}

function hasPriorPlan(input: GrillContext): boolean {
  if (input.lastGeneration) return true;
  return (input.conversationHistory ?? []).some(
    (message) =>
      message.role === "assistant" && /LAST IMAGE GENERATION PACKAGE/u.test(message.content),
  );
}

function latestUserUtterance(prompt: string): string {
  const matches = [...prompt.matchAll(/User reply:\s*(.+)/g)];
  const last = matches.at(-1);
  if (last?.[1]) return last[1].trim();
  return prompt.trim();
}

function userFactText(prompt: string, history: readonly DialogueTurn[]): string {
  const withoutQuestions = prompt
    .replace(/Director question:[\s\S]*?(?=User reply:|$)/g, "\n")
    .replace(/User reply:/g, "\n");
  const prior = history
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  return stripNonAnswers([withoutQuestions, ...prior].join("\n"));
}

function stripNonAnswers(text: string): string {
  return text
    .replace(/อื่น\s*ๆ(?:\s*\(พิมพ์เอง\))?/g, " ")
    .replace(/\bsomething else(?:\s*\(type it\))?/gi, " ")
    .replace(/\bother\b/gi, " ");
}

function contextFactText(input: GrillContext): string {
  const parts: string[] = [];
  for (const ref of input.referenceAnalyses ?? []) {
    if (ref.visibleText?.trim()) parts.push(ref.visibleText);
    if (ref.caption?.trim()) parts.push(ref.caption);
    for (const object of ref.objects ?? []) {
      if (object.trim()) parts.push(object);
    }
  }
  return parts.join("\n");
}

function dialogueTurns(prompt: string, history: readonly DialogueTurn[]): DialogueTurn[] {
  const turns: DialogueTurn[] = history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const pairRe = /Director question:\s*([\s\S]*?)\nUser reply:\s*(.+)/g;
  for (const match of prompt.matchAll(pairRe)) {
    const question = match[1]?.trim();
    const reply = match[2]?.trim();
    if (!question || !reply) continue;
    turns.push({ role: "assistant", content: question }, { role: "user", content: reply });
  }
  const last = turns.at(-1);
  const latest = latestUserUtterance(prompt);
  if (
    last?.role === "assistant" &&
    grillNodeFromQuestion(last.content) &&
    latest &&
    latest !== last.content
  ) {
    const alreadyAnswered = turns.some(
      (turn, index) => turn.role === "assistant" && turns[index + 1]?.content.trim() === latest,
    );
    if (!alreadyAnswered) turns.push({ role: "user", content: latest });
  }
  return turns;
}

function countGrillRounds(turns: readonly DialogueTurn[]): number {
  const seen = new Set<string>();
  let count = 0;
  for (const turn of turns) {
    if (turn.role !== "assistant") continue;
    const node = grillNodeFromQuestion(turn.content);
    if (!node) continue;
    if (seen.has(turn.content)) continue;
    seen.add(turn.content);
    count += 1;
  }
  return count;
}

function replySettles(reply: string, node: GrillNode): boolean {
  if (isOtherOnly(reply)) return false;
  if (isRecommendationAcceptance(reply)) return true;
  if (node === "offer") return hasOffer(reply) || hasSubject(reply);
  return hasSubject(reply);
}

function isOtherOnly(text: string): boolean {
  return /^(?:อื่น\s*ๆ(?:\s*\(พิมพ์เอง\))?|อื่นๆ|other|something else(?:\s*\(type it\))?)$/i.test(
    text.trim(),
  );
}

function isRecommendationAcceptance(text: string): boolean {
  return /^(?:โอเค|ok|okay|ได้|ได้เลย|เอา|เอาเลย|ตามแนะนำ|ตามที่แนะนำ|เอาอันที่แนะนำ|เอาแนะนำ|ใช่|yes|sure|that works|ใช้แนะนำ)$/i.test(
    text.trim(),
  );
}
