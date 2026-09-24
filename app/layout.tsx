import type { Metadata, Viewport } from "next";
import ThaiFontsLoader from "@/components/ThaiFontsLoader";
import "./globals.css";
import "./excalidraw-thai.css";

export const metadata: Metadata = {
  title: "ArtShift — สตูดิโอออกแบบงานแคมเปญหนังสือ",
  description: "Campaign artwork studio for book publishing. Local-first, made for designers.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1a1714",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <ThaiFontsLoader />
        {children}
      </body>
    </html>
  );
}
