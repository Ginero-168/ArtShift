"use client";

import { useEffect, useState } from "react";

type AuthUser = {
  id: string;
  provider: "google";
  email: string;
  name: string | null;
  picture: string | null;
  createdAt: number;
};

type AuthState = { authenticated: boolean; user: AuthUser | null };

type CredentialState = {
  authenticated: boolean;
  provider: "replicate";
  configured: boolean;
  keyHint: string | null;
  storage: "encrypted-account";
  updatedAt: number | null;
};

type AuthResponse = { authenticated?: boolean; user?: AuthUser | null; error?: string };
type CredentialResponse = { credential?: CredentialState; error?: string };

export default function AIProviderSettings({ onClose }: { onClose?: () => void }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [credential, setCredential] = useState<CredentialState | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: Account bootstrap runs once on mount.
  useEffect(() => {
    let cancelled = false;
    const callbackMessage = readCallbackMessage();
    if (callbackMessage && !cancelled) setMessage(callbackMessage);
    void loadAccount().finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadAccount() {
    try {
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as AuthResponse;
      if (!response.ok) throw new Error(payload.error || "Unable to read account status.");
      const nextAuth: AuthState = {
        authenticated: payload.authenticated === true,
        user: payload.user ?? null,
      };
      setAuth(nextAuth);
      if (nextAuth.authenticated) await refreshCredential();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read account status.");
      setAuth({ authenticated: false, user: null });
    }
  }

  async function refreshCredential() {
    const response = await fetch("/api/ai/key", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const payload = (await response.json()) as CredentialResponse;
    if (!response.ok) throw new Error(payload.error || "Unable to read Replicate status.");
    setCredential(payload.credential ?? null);
  }

  async function connectReplicate() {
    if (!apiKey || busy || !auth?.authenticated) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/ai/key", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ provider: "replicate", apiKey }),
      });
      const payload = (await response.json()) as CredentialResponse;
      if (!response.ok || !payload.credential) {
        throw new Error(payload.error || "Replicate rejected this API Key.");
      }
      setCredential(payload.credential);
      setApiKey("");
      setMessage("เชื่อมต่อ Replicate สำเร็จ และเข้ารหัสไว้กับบัญชีของคุณแล้ว");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "เชื่อมต่อ Replicate ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function removeReplicate() {
    if (busy || !auth?.authenticated) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/ai/key", {
        method: "DELETE",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as CredentialResponse;
      if (!response.ok || !payload.credential) {
        throw new Error(payload.error || "Unable to remove the API Key.");
      }
      setCredential(payload.credential);
      setMessage("ลบ Replicate Key ออกจากบัญชีแล้ว");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "ลบ Replicate Key ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("Unable to sign out.");
      setAuth({ authenticated: false, user: null });
      setCredential(null);
      setApiKey("");
      setMessage("ออกจากระบบแล้ว");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "ออกจากระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="AI provider settings"
      style={{
        width: "min(332px, calc(100vw - 32px))",
        padding: 14,
        borderRadius: 10,
        background: "#ffffff",
        border: "1px solid #dbe2ea",
        boxShadow: "0 12px 28px rgba(15, 23, 42, 0.14)",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <div>
          <strong style={{ display: "block", fontSize: 12, color: "#172554" }}>AI Provider</strong>
          <span style={{ display: "block", marginTop: 2, fontSize: 10, color: "#64748b" }}>
            Google Account + Replicate BYOK
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI provider settings"
            style={{
              border: 0,
              background: "transparent",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 16,
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      {auth === null ? (
        <p style={{ margin: "14px 0 0", fontSize: 10, color: "#64748b" }}>กำลังตรวจสอบบัญชี…</p>
      ) : !auth.authenticated ? (
        <>
          <div
            style={{
              marginTop: 12,
              padding: "9px 10px",
              borderRadius: 7,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#1e3a8a",
              fontSize: 10,
              lineHeight: 1.45,
            }}
          >
            Login ด้วย Google เพื่อผูก Replicate Key กับบัญชีของคุณและใช้งานข้าม Session ได้อย่างปลอดภัย
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 10, lineHeight: 1.45, color: "#64748b" }}>
            กรุณา Login ด้วย Google จากปุ่ม Profile มุมขวาบนก่อนจัดการ Replicate Key
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 9.5, lineHeight: 1.45, color: "#64748b" }}>
            ArtShift จะได้รับเฉพาะข้อมูลบัญชีพื้นฐานจาก Google เช่น email และชื่อ ไม่ได้รับ Google password
          </p>
        </>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginTop: 12,
              padding: "7px 9px",
              borderRadius: 7,
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
            }}
          >
            {auth.user?.picture ? (
              // biome-ignore lint/performance/noImgElement: Google profile avatars are remote URLs.
              <img
                src={auth.user.picture}
                alt=""
                width={24}
                height={24}
                style={{ borderRadius: "50%", objectFit: "cover" }}
              />
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              <strong
                style={{
                  display: "block",
                  color: "#0f172a",
                  fontSize: 10,
                  overflowWrap: "anywhere",
                }}
              >
                {auth.user?.name || "Google user"}
              </strong>
              <span style={{ display: "block", marginTop: 2, color: "#64748b", fontSize: 9.5 }}>
                {auth.user?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              disabled={busy}
              style={{
                border: 0,
                background: "transparent",
                color: "#64748b",
                cursor: busy ? "default" : "pointer",
                fontSize: 9.5,
              }}
            >
              Sign out
            </button>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: "7px 9px",
              borderRadius: 7,
              background: credential?.configured ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${credential?.configured ? "#a7f3d0" : "#e2e8f0"}`,
              color: credential?.configured ? "#065f46" : "#475569",
              fontSize: 10,
            }}
            aria-live="polite"
          >
            {credential?.configured
              ? `Replicate connected · ${credential.keyHint}`
              : "ยังไม่ได้เชื่อมต่อ Replicate"}
          </div>

          <label style={{ display: "block", marginTop: 12, fontSize: 10, color: "#475569" }}>
            Replicate API Key
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connectReplicate();
              }}
              placeholder="r8_..."
              autoComplete="new-password"
              spellCheck={false}
              aria-label="Replicate API Key"
              style={{
                display: "block",
                width: "100%",
                marginTop: 5,
                boxSizing: "border-box",
                border: "1px solid #cbd5e1",
                borderRadius: 6,
                padding: "8px 9px",
                fontSize: 11,
                color: "#0f172a",
                outline: "none",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
            <button
              type="button"
              onClick={() => void connectReplicate()}
              disabled={busy || !apiKey}
              style={{
                flex: 1,
                border: 0,
                borderRadius: 6,
                padding: "7px 8px",
                background: busy || !apiKey ? "#cbd5e1" : "#4f46e5",
                color: "#ffffff",
                cursor: busy || !apiKey ? "default" : "pointer",
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              {busy ? "Checking…" : "Test & save"}
            </button>
            {credential?.configured ? (
              <button
                type="button"
                onClick={() => void removeReplicate()}
                disabled={busy}
                style={{
                  border: "1px solid #fecaca",
                  borderRadius: 6,
                  padding: "7px 8px",
                  background: "#fff1f2",
                  color: "#b91c1c",
                  cursor: busy ? "default" : "pointer",
                  fontSize: 10,
                }}
              >
                Remove
              </button>
            ) : null}
          </div>

          <p style={{ margin: "10px 0 0", fontSize: 9.5, lineHeight: 1.45, color: "#64748b" }}>
            Key จะถูกเข้ารหัสบน server และผูกกับ Google Account ไม่เก็บใน Browser storage หรือส่งเข้า Prompt
          </p>
        </>
      )}

      {message ? (
        <p style={{ margin: "8px 0 0", fontSize: 10, color: "#047857" }}>{message}</p>
      ) : null}
      {error ? <p style={{ margin: "8px 0 0", fontSize: 10, color: "#b91c1c" }}>{error}</p> : null}
      <a
        href="https://replicate.com/account/api-tokens"
        target="_blank"
        rel="noreferrer"
        style={{ display: "inline-block", marginTop: 9, fontSize: 9.5, color: "#4f46e5" }}
      >
        Create a Replicate Key ↗
      </a>
    </section>
  );
}

function readCallbackMessage(): string {
  const value = new URLSearchParams(window.location.search).get("auth");
  if (!value) return "";
  window.history.replaceState({}, document.title, window.location.pathname);
  if (value === "success") return "เข้าสู่ระบบด้วย Google สำเร็จแล้ว";
  if (value === "google-cancelled") return "ยกเลิกการเข้าสู่ระบบด้วย Google แล้ว";
  if (value === "google-unavailable") return "Google Login ยังไม่ได้ตั้งค่าในระบบ กรุณาติดต่อผู้ดูแลระบบ";
  return "Google Login ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}
