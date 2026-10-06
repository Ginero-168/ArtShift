export const DIRECTOR_FAILED_TEXT = "ยังไม่สร้างภาพครับ ตัววางแผนตอบกลับไม่ได้";
export const DIRECTOR_REFUSED_TEXT = "ยังไม่สร้างภาพครับ รอบนี้ยังวางแผนต่อไม่ได้";

export type DirectorStuckCause = "director-failed" | "refused-to-execute";

export function directorStuckText(cause: DirectorStuckCause): string {
  return cause === "refused-to-execute" ? DIRECTOR_REFUSED_TEXT : DIRECTOR_FAILED_TEXT;
}
