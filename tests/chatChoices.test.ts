import { describe, expect, it } from "vitest";
import { splitChatChoices } from "@/lib/ai/orchestration/chatChoices";

const menu = [
  "สวัสดีครับ! ยินดีที่ได้ดูแลคุณในวันนี้ครับ ผมเห็นว่าบน Canvas มีผลงานอยู่บ้างแล้ว ไม่ทราบว่าวันนี้คุณอยากให้ผมช่วยเรื่องไหนดีครับ?",
  "",
  "A) สร้างรูปภาพใหม่ตามไอเดียของคุณ",
  "B) แก้ไขหรือปรับแต่งภาพที่มีอยู่บน Canvas",
  "C) ออกแบบแบนเนอร์หรือป้ายหมวดหมู่เพิ่มเติม",
  "Other) อื่นๆ (สามารถพิมพ์บอกสิ่งที่ต้องการได้เลยครับ)",
].join("\n");

describe("chat choices", () => {
  it("turns a lettered menu into buttons and leaves the question", () => {
    expect(splitChatChoices(menu)).toEqual({
      prose:
        "สวัสดีครับ! ยินดีที่ได้ดูแลคุณในวันนี้ครับ ผมเห็นว่าบน Canvas มีผลงานอยู่บ้างแล้ว ไม่ทราบว่าวันนี้คุณอยากให้ผมช่วยเรื่องไหนดีครับ?",
      choices: [
        { key: "A", label: "สร้างรูปภาพใหม่ตามไอเดียของคุณ", action: "send" },
        { key: "B", label: "แก้ไขหรือปรับแต่งภาพที่มีอยู่บน Canvas", action: "send" },
        { key: "C", label: "ออกแบบแบนเนอร์หรือป้ายหมวดหมู่เพิ่มเติม", action: "send" },
        { key: "D", label: "พิมพ์คำตอบเอง", action: "compose" },
      ],
    });
  });

  it("leaves a normal sentence alone", () => {
    const sentence = "โทนครีมใช้ได้ครับ";
    expect(splitChatChoices(sentence)).toEqual({ prose: sentence, choices: [] });
  });
});
