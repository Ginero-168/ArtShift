import { describe, expect, it } from "vitest";
import { formatImageCompletionReply } from "@/lib/ai/imageCompletionReply";

describe("formatImageCompletionReply", () => {
  it("formats generate replies with brief lines", () => {
    const text = formatImageCompletionReply("ร้านกาแฟ", 2, ["มินิมอล", "อบอุ่น"]);
    expect(text).toContain("สร้างรูปมินิมอลเสร็จแล้ว 2 รูปค่ะ");
    expect(text).toContain("• รูปที่ 1: มินิมอล");
    expect(text).toContain("• รูปที่ 2: อบอุ่น");
  });

  it("formats edit replies and strips mention tokens", () => {
    const text = formatImageCompletionReply("@[Cover:img1] ปกหนังสือ", 1, undefined, true);
    expect(text).toContain('ปรับแต่งภาพ "ปกหนังสือ" เสร็จแล้ว 1 รูปค่ะ');
  });
});
