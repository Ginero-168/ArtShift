"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { hasStoredCloudConsent, setAccountCloudConsent } from "@/lib/ai/cloudConsent";

type AuthUser = {
  id: string;
  provider: "google";
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: number;
};

type AuthResponse = {
  authenticated?: boolean;
  user?: AuthUser | null;
  credits?: { balance: number } | null;
  error?: string;
};

export default function ProfileMenu() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [cloudConsent, setCloudConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const callbackMessage = readAuthCallbackMessage();
    if (callbackMessage && !cancelled) setMessage(callbackMessage);
    if (!cancelled) setCloudConsent(hasStoredCloudConsent());
    void fetch("/api/auth/me", { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json()) as AuthResponse;
        if (!response.ok) throw new Error(payload.error || "Unable to read account status.");
        if (!cancelled) {
          setUser(payload.authenticated ? (payload.user ?? null) : null);
          setCredits(payload.authenticated && payload.credits ? payload.credits.balance : null);
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  function signInWithGoogle() {
    if (busy) return;
    window.location.assign("/api/auth/google/start");
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Unable to sign out.");
      setUser(null);
      setCredits(null);
      setMessage("ออกจากระบบแล้ว");
    } catch {
      setMessage("ออกจากระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  const initials = user
    ? (user.name || user.email)
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "";

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={user ? `Profile: ${user.email}` : "Profile"}
        aria-expanded={open}
        title={user ? user.email : "Login with Google"}
        style={{
          width: 31,
          height: 31,
          padding: 0,
          borderRadius: "50%",
          border: user ? "2px solid #ffc7b3" : "1px solid #d9d3cc",
          background: user ? "#fff0ea" : "#fcf9f5",
          color: "#9b2500",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          cursor: "pointer",
          fontSize: 10,
          fontWeight: 800,
        }}
      >
        {user?.picture ? (
          // biome-ignore lint/performance/noImgElement: Google profile avatar is a remote image.
          <img src={user.picture} alt="" width={27} height={27} style={{ objectFit: "cover" }} />
        ) : loaded && user ? (
          initials || "G"
        ) : (
          "G"
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Profile menu"
          style={{
            position: "absolute",
            top: 39,
            right: 0,
            zIndex: 50,
            width: 260,
            maxWidth: "calc(100vw - 24px)",
            padding: 12,
            borderRadius: 10,
            background: "#ffffff",
            border: "1px solid #e4e1dc",
            boxShadow: "0 14px 32px rgba(26, 23, 20, 0.16)",
          }}
        >
          {user ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1714" }}>
                {user.name || "Google account"}
              </div>
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9.5,
                  color: "#78726a",
                  overflowWrap: "anywhere",
                }}
              >
                {user.email}
              </div>
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 9px",
                  borderRadius: 6,
                  background: "#fff0ea",
                  color: "#9b2500",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {credits === null ? "เครดิต …" : `${credits.toLocaleString("th-TH")} เครดิต`}
              </div>
              <Link
                href="/account/credits"
                role="menuitem"
                style={{ ...menuButtonStyle, textDecoration: "none" }}
              >
                เครดิตและประวัติ
              </Link>
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  marginTop: 10,
                  fontSize: 10,
                  lineHeight: 1.4,
                  color: "#443f39",
                }}
              >
                <input
                  type="checkbox"
                  checked={cloudConsent}
                  onChange={(event) => {
                    const granted = event.currentTarget.checked;
                    setCloudConsent(granted);
                    setAccountCloudConsent(granted);
                  }}
                />
                อนุญาตให้ส่งงานไปยัง AI ของแพลตฟอร์ม
              </label>
              <button
                type="button"
                role="menuitem"
                onClick={() => void signOut()}
                disabled={busy}
                style={{ ...menuButtonStyle, color: "#b91c1c" }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <strong style={{ display: "block", fontSize: 12, color: "#172554" }}>
                Your Profile
              </strong>
              <p style={{ margin: "6px 0 10px", fontSize: 10, lineHeight: 1.45, color: "#78726a" }}>
                Login ด้วย Google เพื่อใช้เครดิต AI ของบัญชีคุณ
              </p>
              <button
                type="button"
                role="menuitem"
                onClick={signInWithGoogle}
                disabled={busy || !loaded}
                style={{
                  ...menuButtonStyle,
                  justifyContent: "center",
                  background: busy || !loaded ? "#f8f4ef" : "#ffffff",
                  color: "#2c2824",
                  fontWeight: 700,
                }}
              >
                <span aria-hidden="true" style={{ fontWeight: 800 }}>
                  G
                </span>
                Continue with Google
              </button>
            </>
          )}
          {message ? (
            <p style={{ margin: "8px 0 0", fontSize: 9.5, color: "#047857" }}>{message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const menuButtonStyle = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  width: "100%",
  marginTop: 10,
  padding: "8px 9px",
  border: "1px solid #ece7e0",
  borderRadius: 6,
  background: "#fcf9f5",
  color: "#443f39",
  cursor: "pointer",
  fontSize: 10,
  textAlign: "left" as const,
};

function readAuthCallbackMessage(): string {
  const value = new URLSearchParams(window.location.search).get("auth");
  if (!value) return "";
  window.history.replaceState({}, document.title, window.location.pathname);
  if (value === "success") return "เข้าสู่ระบบด้วย Google สำเร็จแล้ว";
  if (value === "google-cancelled") return "ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว";
  if (value === "google-unavailable") return "Google Login ยังไม่ได้ตั้งค่าในระบบ";
  return "Google Login ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}
