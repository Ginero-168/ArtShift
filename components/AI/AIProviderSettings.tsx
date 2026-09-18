"use client";

import { useEffect, useState } from "react";
import { hasStoredCloudConsent, setAccountCloudConsent } from "@/lib/ai/cloudConsent";

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
  provider: "replicate" | "openai";
  configured: boolean;
  keyHint: string | null;
  storage: "encrypted-account";
  updatedAt: number | null;
};

type CredentialsState = {
  authenticated: boolean;
  replicate: CredentialState;
  openai: CredentialState;
};

type AuthResponse = { authenticated?: boolean; user?: AuthUser | null; error?: string };
type CredentialResponse = {
  credential?: CredentialState;
  credentials?: CredentialsState;
  error?: string;
};

export default function AIProviderSettings({ onClose }: { onClose?: () => void }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [replicateKey, setReplicateKey] = useState("");
  const [openAiKey, setOpenAiKey] = useState("");
  const [busy, setBusy] = useState(true);
  const [busyProvider, setBusyProvider] = useState<"replicate" | "openai" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cloudConsent, setCloudConsent] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Account bootstrap runs once on mount.
  useEffect(() => {
    let cancelled = false;
    const callbackMessage = readCallbackMessage();
    if (callbackMessage && !cancelled) setMessage(callbackMessage);
    setCloudConsent(hasStoredCloudConsent());
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
      if (nextAuth.authenticated) await refreshCredentials();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to read account status.");
      setAuth({ authenticated: false, user: null });
    }
  }

  async function refreshCredentials() {
    const response = await fetch("/api/ai/key", {
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    const payload = (await response.json()) as CredentialResponse;
    if (!response.ok) throw new Error(payload.error || "Unable to read API key status.");
    if (payload.credentials) {
      setCredentials(payload.credentials);
      return;
    }
    // Legacy shape: only Replicate
    if (payload.credential) {
      setCredentials({
        authenticated: payload.credential.authenticated,
        replicate: payload.credential,
        openai: {
          authenticated: payload.credential.authenticated,
          provider: "openai",
          configured: false,
          keyHint: null,
          storage: "encrypted-account",
          updatedAt: null,
        },
      });
    }
  }

  async function connectProvider(provider: "replicate" | "openai") {
    const apiKey = provider === "replicate" ? replicateKey : openAiKey;
    if (!apiKey || busy || busyProvider || !auth?.authenticated) return;
    setBusyProvider(provider);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/ai/key", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ provider, apiKey }),
      });
      const payload = (await response.json()) as CredentialResponse;
      if (!response.ok || !payload.credentials) {
        throw new Error(
          payload.error ||
            (provider === "openai"
              ? "OpenAI rejected this API Key."
              : "Replicate rejected this API Key."),
        );
      }
      setCredentials(payload.credentials);
      if (provider === "replicate") setReplicateKey("");
      else setOpenAiKey("");
      setMessage(
        provider === "openai"
          ? "เชื่อมต่อ OpenAI สำเร็จ และเข้ารหัสไว้กับบัญชีของคุณแล้ว"
          : "เชื่อมต่อ Replicate สำเร็จ และเข้ารหัสไว้กับบัญชีของคุณแล้ว",
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : provider === "openai"
            ? "เชื่อมต่อ OpenAI ไม่สำเร็จ"
            : "เชื่อมต่อ Replicate ไม่สำเร็จ",
      );
    } finally {
      setBusyProvider(null);
    }
  }

  async function removeProvider(provider: "replicate" | "openai") {
    if (busy || busyProvider || !auth?.authenticated) return;
    setBusyProvider(provider);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/ai/key?provider=${provider}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      const payload = (await response.json()) as CredentialResponse;
      if (!response.ok || !payload.credentials) {
        throw new Error(payload.error || "Unable to remove the API Key.");
      }
      setCredentials(payload.credentials);
      setMessage(
        provider === "openai" ? "ลบ OpenAI Key ออกจากบัญชีแล้ว" : "ลบ Replicate Key ออกจากบัญชีแล้ว",
      );
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "ลบ API Key ไม่สำเร็จ");
    } finally {
      setBusyProvider(null);
    }
  }

  async function signOut() {
    if (busy || busyProvider) return;
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
      setCredentials(null);
      setReplicateKey("");
      setOpenAiKey("");
      setMessage("ออกจากระบบแล้ว");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "ออกจากระบบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const anyBusy = busy || busyProvider !== null;

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
            Google Account · OpenAI + Replicate BYOK
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
            Login ด้วย Google เพื่อผูก OpenAI / Replicate Key กับบัญชีของคุณและใช้งานข้าม Session ได้อย่างปลอดภัย
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 10, lineHeight: 1.45, color: "#64748b" }}>
            กรุณา Login ด้วย Google จากปุ่ม Profile มุมขวาบนก่อนจัดการ API Key
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
              disabled={anyBusy}
              style={{
                border: 0,
                background: "transparent",
                color: "#64748b",
                cursor: anyBusy ? "default" : "pointer",
                fontSize: 9.5,
              }}
            >
              Sign out
            </button>
          </div>

          <ProviderKeyBlock
            title="OpenAI API Key"
            hint="ใช้สร้างภาพ GPT Image 2.5 Sunburst · รองรับ 3:1"
            placeholder="sk-..."
            createUrl="https://platform.openai.com/api-keys"
            createLabel="Create an OpenAI Key ↗"
            value={openAiKey}
            onChange={setOpenAiKey}
            credential={credentials?.openai ?? null}
            busy={busyProvider === "openai"}
            disabled={anyBusy}
            onSave={() => void connectProvider("openai")}
            onRemove={() => void removeProvider("openai")}
          />

          <ProviderKeyBlock
            title="Replicate API Key"
            hint="ใช้กับ vectorize / upscale และเป็น fallback"
            placeholder="r8_..."
            createUrl="https://replicate.com/account/api-tokens"
            createLabel="Create a Replicate Key ↗"
            value={replicateKey}
            onChange={setReplicateKey}
            credential={credentials?.replicate ?? null}
            busy={busyProvider === "replicate"}
            disabled={anyBusy}
            onSave={() => void connectProvider("replicate")}
            onRemove={() => void removeProvider("replicate")}
          />

          <p style={{ margin: "10px 0 0", fontSize: 9.5, lineHeight: 1.45, color: "#64748b" }}>
            Key จะถูกเข้ารหัสบน server และผูกกับ Google Account ไม่เก็บใน Browser storage หรือส่งเข้า Prompt
          </p>

          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              marginTop: 12,
              padding: "8px 9px",
              borderRadius: 7,
              background: cloudConsent ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${cloudConsent ? "#a7f3d0" : "#e2e8f0"}`,
              fontSize: 10,
              color: "#334155",
              lineHeight: 1.45,
              cursor: "pointer",
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
              style={{ marginTop: 2 }}
              aria-label="Allow sending prompts and images to cloud AI"
            />
            <span>
              อนุญาตให้ส่ง prompt และภาพไปยัง cloud AI (Creative Director / Image Model)
              โดยไม่ต้องยืนยันทุกครั้ง
            </span>
          </label>
        </>
      )}

      {message ? (
        <p style={{ margin: "8px 0 0", fontSize: 10, color: "#047857" }}>{message}</p>
      ) : null}
      {error ? <p style={{ margin: "8px 0 0", fontSize: 10, color: "#b91c1c" }}>{error}</p> : null}
    </section>
  );
}

function ProviderKeyBlock({
  title,
  hint,
  placeholder,
  createUrl,
  createLabel,
  value,
  onChange,
  credential,
  busy,
  disabled,
  onSave,
  onRemove,
}: {
  title: string;
  hint: string;
  placeholder: string;
  createUrl: string;
  createLabel: string;
  value: string;
  onChange: (value: string) => void;
  credential: CredentialState | null;
  busy: boolean;
  disabled: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
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
          ? `${title.replace(" API Key", "")} connected · ${credential.keyHint}`
          : `ยังไม่ได้เชื่อมต่อ ${title.replace(" API Key", "")}`}
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 9.5, color: "#64748b", lineHeight: 1.4 }}>{hint}</p>

      <label style={{ display: "block", marginTop: 8, fontSize: 10, color: "#475569" }}>
        {title}
        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onSave();
          }}
          placeholder={placeholder}
          autoComplete="new-password"
          spellCheck={false}
          aria-label={title}
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
          onClick={onSave}
          disabled={disabled || !value}
          style={{
            flex: 1,
            border: 0,
            borderRadius: 6,
            padding: "7px 8px",
            background: disabled || !value ? "#cbd5e1" : "#4f46e5",
            color: "#ffffff",
            cursor: disabled || !value ? "default" : "pointer",
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {busy ? "Checking…" : "Test & save"}
        </button>
        {credential?.configured ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            style={{
              border: "1px solid #fecaca",
              borderRadius: 6,
              padding: "7px 8px",
              background: "#fff1f2",
              color: "#b91c1c",
              cursor: disabled ? "default" : "pointer",
              fontSize: 10,
            }}
          >
            Remove
          </button>
        ) : null}
      </div>

      <a
        href={createUrl}
        target="_blank"
        rel="noreferrer"
        style={{ display: "inline-block", marginTop: 8, fontSize: 9.5, color: "#4f46e5" }}
      >
        {createLabel}
      </a>
    </div>
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
