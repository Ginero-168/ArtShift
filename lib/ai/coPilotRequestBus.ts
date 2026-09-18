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

/** Default Mix brief — analyze refs and fuse into one new image (not a collage). */
export const IMAGE_MIX_PROMPT =
  "ผสมภาพที่เลือกให้เป็นภาพใหม่ภาพเดียว วิเคราะห์จุดเด่นของแต่ละภาพ (หัวเรื่อง สไตล์ แสง สี องค์ประกอบ) แล้วรวมจุดที่เข้ากันได้ดีที่สุดให้กลมกลืน เป็นฉากเดียวที่สมดุล เก็บเอกลักษณ์สำคัญจากทุกภาพต้นทางไว้ ไม่ทำคอลลาจ แบ่งครึ่งจอ หรือวางภาพข้างกัน";
