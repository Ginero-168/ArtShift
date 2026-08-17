import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./excalidraw-thai.css";

export const metadata: Metadata = {
  title: "ArtShift",
  description: "Local-first artwork editor for book campaigns",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
