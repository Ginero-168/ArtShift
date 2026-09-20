import type { Metadata, Viewport } from "next";
import FeaturesLanding from "@/components/Marketing/FeaturesLanding";

export const metadata: Metadata = {
  title: "ฟีเจอร์ | ArtShift",
  description:
    "แคนวาสออกแบบ, Moodboard, Appearance หลายชั้น, ข้อความแบบ Illustrator, แก้ Raster ผ่าน Photopea และ AI Assistance — ตัวแก้ไขงานออกแบบแบบ local-first ที่ artshift.io",
  alternates: { canonical: "/features" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function FeaturesPage() {
  return <FeaturesLanding />;
}
