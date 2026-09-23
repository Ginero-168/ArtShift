import type { Metadata } from "next";
import PrivacyPolicy from "@/components/Marketing/PrivacyPolicy";

export const metadata: Metadata = {
  title: "Privacy | ArtShift",
  description:
    "How ArtShift handles Google sign-in, optional Pinterest access, and artwork that stays on your device.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
