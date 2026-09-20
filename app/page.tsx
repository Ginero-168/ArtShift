"use client";

/**
 * / — ArtShift Landing & Google Sign-in Gate.
 *
 * Requirements:
 * - Public Index Route
 * - Hero ArtShift wordmark + "AI Powered Design Tools"
 * - Single Primary "Log in with Google" button
 * - If already logged in, shows "Go to Projects"
 * - Handles OAuth query parameters (?auth=...)
 * - Rich, premium aesthetics (dark indigo gradient, ambient light, glassmorphism)
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import { useAuth } from "@/lib/auth/useAuth";

export default function LandingRootPage() {
  return (
    <Suspense fallback={<LandingLoadingState />}>
      <LandingPageContent />
    </Suspense>
  );
}

function LandingLoadingState() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#090d16",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
      }}
    >
      <ArtShiftLogo size="header" />
    </div>
  );
}

function LandingPageContent() {
  const searchParams = useSearchParams();
  const { user, authenticated, loading, signInWithGoogle, signOut } = useAuth();
  const [authAlert, setAuthAlert] = useState<string | null>(null);

  useEffect(() => {
    const authCode = searchParams.get("auth");
    if (authCode === "google-cancelled") {
      setAuthAlert("ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว");
    } else if (authCode === "google-unavailable") {
      setAuthAlert("ระบบยังไม่ได้เปิดใช้งาน Google OAuth หรือยังไม่ได้ตั้งค่า Credentials");
    } else if (authCode === "google-error") {
      setAuthAlert("เกิดข้อผิดพลาดในการเชื่อมต่อกับ Google กรุณาลองใหม่อีกครั้ง");
    } else if (authCode === "session-expired") {
      setAuthAlert("เซสชันการใช้งานของคุณหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่");
    }
  }, [searchParams]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 50% -10%, #1e1b4b 0%, #0b0f19 60%, #030712 100%)",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      {/* Background Ambient Glow Elements */}
      <div
        style={{
          position: "absolute",
          top: -120,
          left: "50%",
          transform: "translateX(-50%)",
          width: 700,
          height: 380,
          background:
            "radial-gradient(ellipse, rgba(99, 102, 241, 0.28) 0%, rgba(139, 92, 246, 0) 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
        }}
      />

      {/* Hero Section */}
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "48px 24px",
          maxWidth: 880,
          margin: "0 auto",
          zIndex: 10,
        }}
      >
        {/* Auth Alert Banner */}
        {authAlert && (
          <div
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 500,
              marginBottom: 28,
            }}
          >
            {authAlert}
          </div>
        )}

        <ArtShiftLogo as="h1" size="hero" style={{ margin: "0 0 24px" }} />

        {/* Tagline */}
        <p
          style={{
            fontSize: "clamp(16px, 2.5vw, 20px)",
            color: "#94a3b8",
            lineHeight: 1.6,
            maxWidth: 640,
            margin: "0 0 48px",
            textWrap: "balance",
          }}
        >
          AI Powered Design Tools
        </p>

        {/* Action Card: Sign in with Google OR Go to Projects */}
        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: 20,
            padding: "32px 32px",
            backdropFilter: "blur(16px)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            width: "100%",
            maxWidth: 520,
          }}
        >
          {loading ? (
            <div style={{ padding: "12px 0", color: "#94a3b8", fontSize: 13 }}>
              กำลังโหลดสถานะผู้ใช้…
            </div>
          ) : authenticated ? (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 13, color: "#cbd5e1" }}>
                ยินดีต้อนรับกลับ, <strong>{user?.name || user?.email}</strong>
              </div>

              <Link
                href="/projects"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  width: "100%",
                  minBlockSize: 56,
                  padding: "16px 24px",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  color: "#ffffff",
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(99, 102, 241, 0.45)",
                  transition: "transform 0.15s ease",
                  boxSizing: "border-box",
                }}
              >
                <span>เปิดหน้ารายการโปรเจกต์</span>
                <span>→</span>
              </Link>

              <button
                type="button"
                onClick={signOut}
                style={{
                  background: "none",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 12,
                  cursor: "pointer",
                  textDecoration: "underline",
                  marginTop: 2,
                }}
              >
                ออกจากระบบ (Sign out)
              </button>
            </div>
          ) : (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
              <button
                type="button"
                onClick={signInWithGoogle}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  width: "100%",
                  minBlockSize: 56,
                  padding: "18px 24px",
                  borderRadius: 14,
                  background: "#ffffff",
                  color: "#0f172a",
                  fontSize: 17,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  border: "none",
                  cursor: "pointer",
                  boxSizing: "border-box",
                  boxShadow: "0 8px 28px rgba(255, 255, 255, 0.28)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <GoogleGIcon size={22} />
                <span>เข้าสู่ระบบด้วย Google (Log in with Google)</span>
              </button>

              <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                เข้าสู่ระบบเพื่อระบุตัวตนและเริ่มจัดการโปรเจกต์ของคุณ ข้อมูลทั้งหมดจะจัดเก็บในเครื่องของคุณอย่างปลอดภัย
              </div>
            </div>
          )}
        </div>
      </main>

      <footer
        style={{
          position: "relative",
          zIndex: 10,
          padding: "0 24px 28px",
          textAlign: "center",
        }}
      >
        <Link
          href="/features"
          style={{
            color: "#64748b",
            fontSize: 12,
            fontWeight: 500,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          ดูฟีเจอร์
        </Link>
      </footer>
    </div>
  );
}

function GoogleGIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
