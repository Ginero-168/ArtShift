import type { Viewport } from "next";
import ColorStudio from "@/components/ColorStudio/ColorStudio";

export const metadata = {
  title: "Color Studio — ArtShift",
  description: "สร้าง ทดลอง ตรวจ และส่งออกชุดสีสำหรับงานออกแบบ",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function ColorStudioPage() {
  return <ColorStudio />;
}
