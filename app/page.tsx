"use client";

/**
 * / — ArtShift landing and Google sign-in gate.
 *
 * - Public index route with the hero ArtShift wordmark
 * - One primary "Log in with Google" action, or "Go to Projects" when signed in
 * - Handles OAuth query parameters (?auth=...)
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ArtShiftLogo from "@/components/Brand/ArtShiftLogo";
import styles from "@/components/Marketing/HomeLanding.module.css";
import { useAuth } from "@/lib/auth/useAuth";

const AUTH_MESSAGES: Record<string, string> = {
  "google-cancelled": "ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว",
  "google-unavailable": "ระบบยังไม่ได้เปิดใช้งาน Google OAuth หรือยังไม่ได้ตั้งค่า Credentials",
  "google-error": "เกิดข้อผิดพลาดในการเชื่อมต่อกับ Google กรุณาลองใหม่อีกครั้ง",
  "session-expired": "เซสชันการใช้งานของคุณหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่",
};

export default function LandingRootPage() {
  return (
    <Suspense fallback={<LandingLoadingState />}>
      <LandingPageContent />
    </Suspense>
  );
}

function LandingLoadingState() {
  return (
    <div className={styles.loading}>
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
    setAuthAlert(authCode ? (AUTH_MESSAGES[authCode] ?? null) : null);
  }, [searchParams]);

  return (
    <div className={styles.page}>
      <nav className={styles.topNav} aria-label="ลิงก์หลัก">
        <span className={styles.edition}>Campaign Artwork Studio</span>
        <div className={styles.topLinks}>
          <Link href="/features">ฟีเจอร์</Link>
          <Link href="/privacy">Privacy</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <section className={styles.intro} aria-labelledby="landing-title">
          {authAlert && (
            <p className={styles.alert} role="alert">
              {authAlert}
            </p>
          )}

          <p className={styles.kicker}>
            <span className={styles.kickerDot} aria-hidden="true" />
            สำหรับนักออกแบบงานหนังสือ
          </p>

          <ArtShiftLogo as="h1" size="hero" id="landing-title" className={styles.wordmark} />

          <p className={styles.lead}>
            ออกแบบงานแคมเปญหนังสือบนแคนวาสเดียว ตั้งแต่ปก ป้ายชั้นวาง ไปจนถึงโพสต์โซเชียล
            <em> ดีไซน์ครั้งเดียว ได้ครบทุกไซส์</em>
          </p>

          <div className={styles.access}>
            {loading ? (
              <p className={styles.status}>กำลังตรวจสอบบัญชี…</p>
            ) : authenticated ? (
              <>
                <p className={styles.welcome}>
                  ยินดีต้อนรับกลับ, <strong>{user?.name || user?.email}</strong>
                </p>
                <Link href="/projects" className={styles.primary}>
                  <span>เปิดโปรเจกต์ของคุณ</span>
                  <span aria-hidden="true" className={styles.arrow}>
                    →
                  </span>
                </Link>
                <button type="button" onClick={signOut} className={styles.textButton}>
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={signInWithGoogle} className={styles.primary}>
                  <GoogleGIcon size={20} />
                  <span>เข้าสู่ระบบด้วย Google</span>
                </button>
                <p className={styles.note}>
                  ใช้บัญชี Google เพื่อยืนยันตัวตนเท่านั้น — ไฟล์งานทั้งหมดเก็บอยู่ในเครื่องของคุณ
                </p>
              </>
            )}
          </div>

          <Link href="/features" className={styles.featuresLink}>
            ดูฟีเจอร์ <span aria-hidden="true">↗</span>
          </Link>
        </section>

        <CampaignSpecimen />
      </main>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} ArtShift</span>
        <span className={styles.footerMeta}>Local-first · artshift.io</span>
      </footer>
    </div>
  );
}

/** One campaign set in three formats — shows the product idea without a screenshot. */
function CampaignSpecimen() {
  return (
    <div className={styles.specimen} aria-hidden="true">
      <figure className={`${styles.sheet} ${styles.poster}`}>
        <div className={styles.art}>
          <span className={styles.posterEyebrow}>Rainy Season Reads</span>
          <span className={styles.posterTitle}>
            อ่าน
            <br />
            จนหมด
            <br />
            ฝน
          </span>
          <span className={styles.posterBadge}>
            ลดสูงสุด<strong>35%</strong>
          </span>
        </div>
        <figcaption>Poster · 60 × 90 cm</figcaption>
      </figure>

      <figure className={`${styles.sheet} ${styles.square}`}>
        <div className={styles.art}>
          <span className={styles.squareTitle}>ใหม่</span>
          <span className={styles.squareSub}>อ่านจนหมดฝน</span>
        </div>
        <figcaption>Social · 1040 × 1040 px</figcaption>
      </figure>

      <figure className={`${styles.sheet} ${styles.strip}`}>
        <div className={styles.art}>
          <span className={styles.stripTitle}>อ่านจนหมดฝน</span>
          <span className={styles.stripBadge}>−35%</span>
        </div>
        <figcaption>Shelf talk · 29 × 7 cm</figcaption>
      </figure>
    </div>
  );
}

function GoogleGIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
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
