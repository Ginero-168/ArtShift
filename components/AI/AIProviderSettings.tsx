"use client";

import { useEffect, useState } from "react";

type CredentialState = {
  provider: "replicate";
  configured: boolean;
  keyHint: string | null;
  storage: "session-memory";
  expiresAt: number | null;
};

type CredentialResponse = { credential?: CredentialState; error?: string };

export default function AIProviderSettings({ onClose }: { onClose?: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [credential, setCredential] = useState<CredentialState | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/key", { cache: "no-store", headers: { accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json()) as CredentialResponse;
        if (!response.ok) throw new Error(payload.error || "Unable to read AI provider status.");
        if (!cancelled) setCredential(payload.credential ?? null);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Unable to read provider status.");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function connect() {
    if (!apiKey || busy) return;
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
      setMessage("เชื่อมต่อ Replicate สำเร็จ ใช้ Key นี้เฉพาะ Session ปัจจุบัน");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "เชื่อมต่อ Replicate ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
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
      if (!response.ok || !payload.credential)
        throw new Error(payload.error || "Unable to remove the API Key.");
      setCredential(payload.credential);
      setMessage("ลบ Replicate Key จาก Session แล้ว");
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "ลบ Replicate Key ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-label="AI provider settings"
      style={{
        width: "min(320px, calc(100vw - 32px))",
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
            Bring your own Replicate Key
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
        {credential?.configured ? `Connected · ${credential.keyHint}` : "ยังไม่ได้เชื่อมต่อ Replicate"}
      </div>

      <label style={{ display: "block", marginTop: 12, fontSize: 10, color: "#475569" }}>
        Replicate API Key
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void connect();
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
          onClick={() => void connect()}
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
          {busy ? "Checking…" : "Test & connect"}
        </button>
        {credential?.configured ? (
          <button
            type="button"
            onClick={() => void remove()}
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
        Key จะอยู่ใน memory ของ Session เท่านั้น ไม่เก็บใน Browser storage และหมดอายุเมื่อ Session/server
        ถูกรีสตาร์ต
      </p>
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
