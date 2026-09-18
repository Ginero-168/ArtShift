/**
 * External entry points (e.g. Option Bar Mix) that should run as a normal
 * AI Assistance chat turn — same preload + chat result path as typing in chat.
 */

export type CoPilotExternalTurnRequest = {
  /** User-visible prompt shown in chat and sent to Creative Director. */
  prompt: string;
  /** Canvas image element ids to attach as references (max 4 applied by selection builder). */
  imageObjectIds: readonly string[];
  /** Switch Block Library to AI Assistance tab when possible. */
  openAssistant?: boolean;
};

type Listener = (request: CoPilotExternalTurnRequest) => void;

const listeners = new Set<Listener>();

export function requestCoPilotExternalTurn(request: CoPilotExternalTurnRequest): void {
  const prompt = request.prompt.trim();
  if (!prompt) return;
  const payload: CoPilotExternalTurnRequest = {
    prompt,
    imageObjectIds: [...request.imageObjectIds],
    openAssistant: request.openAssistant !== false,
  };
  for (const listener of listeners) listener(payload);
}

export function subscribeCoPilotExternalTurn(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Default Mix brief — fuse refs into one new image immediately (not analysis-only). */
export const IMAGE_MIX_PROMPT =
  "สร้างภาพใหม่ภาพเดียวทันทีโดยผสมภาพที่เลือกทั้งหมดเข้าด้วยกัน ให้เป็นฉากเดียวที่กลมกลืน สมดุล เก็บเอกลักษณ์สำคัญจากทุกภาพต้นทาง (หัวเรื่อง สไตล์ แสง สี องค์ประกอบ) ไว้ในผลลัพธ์เดียวกัน ห้ามคอลลาจ ห้ามแบ่งครึ่งจอ ห้ามวางภาพข้างกัน และห้ามตอบแค่วิเคราะห์โดยไม่สร้างภาพ";
