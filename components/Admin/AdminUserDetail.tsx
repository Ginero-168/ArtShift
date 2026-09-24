"use client";

import Link from "next/link";
import { type CSSProperties, type FormEvent, useCallback, useEffect, useState } from "react";

type LedgerEntry = {
  id: string;
  type: "top_up" | "spend" | "adjust" | "refund";
  amount: number;
  balanceAfter: number;
  reason: string;
  actor: string;
  actorEmail: string | null;
  createdAt: number;
};

type UserPayload = {
  id: string;
  email: string;
  name: string | null;
  balance: number;
  createdAt: number;
  lastSeenAt: number;
};

export default function AdminUserDetail({ userId }: { userId: string }) {
  const [user, setUser] = useState<UserPayload | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [mode, setMode] = useState<"top_up" | "adjust">("top_up");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      user?: UserPayload;
      entries?: LedgerEntry[];
      error?: string;
    };
    if (!response.ok || !payload.user) throw new Error(payload.error || "ไม่พบผู้ใช้");
    setUser(payload.user);
    setEntries(payload.entries ?? []);
  }, [userId]);

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "โหลดไม่สำเร็จ");
    });
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          amount: Number(amount),
          reason,
        }),
      });
      const payload = (await response.json()) as { balance?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      setMessage(`ยอดใหม่ ${payload.balance?.toLocaleString("th-TH")} เครดิต`);
      setReason("");
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 64px" }}>
      <Link href="/admin" style={{ fontSize: 13, color: "#78726a" }}>
        ← ผู้ใช้ทั้งหมด
      </Link>
      <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 34, margin: "12px 0 4px" }}>
        {user?.email || "ผู้ใช้"}
      </h1>
      <p style={{ margin: 0, color: "#78726a", fontSize: 13 }}>
        {user?.name || "ไม่มีชื่อ"} · สร้าง{" "}
        {user ? new Date(user.createdAt).toLocaleString("th-TH") : "…"} · เห็นล่าสุด{" "}
        {user ? new Date(user.lastSeenAt).toLocaleString("th-TH") : "…"}
      </p>
      <p style={{ fontSize: 28, fontWeight: 700, margin: "16px 0" }}>
        {(user?.balance ?? 0).toLocaleString("th-TH")} เครดิต
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        style={{
          display: "grid",
          gap: 10,
          padding: 16,
          background: "#fff",
          borderRadius: 12,
          border: "1px solid rgba(26,23,20,0.1)",
        }}
      >
        <strong style={{ fontSize: 14 }}>เติมหรือปรับเครดิต</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMode("top_up")}
            style={modeButton(mode === "top_up")}
          >
            เติม (บวก)
          </button>
          <button
            type="button"
            onClick={() => setMode("adjust")}
            style={modeButton(mode === "adjust")}
          >
            ปรับ (+/−)
          </button>
        </div>
        <label style={{ fontSize: 13 }}>
          จำนวนเครดิต
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="numeric"
            required
            style={field}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          เหตุผล (จำเป็น)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            minLength={2}
            placeholder="เช่น โอนเงินแล้ว / ชดเชยงานที่ล้มเหลว"
            style={field}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{
            justifySelf: "start",
            padding: "8px 14px",
            borderRadius: 8,
            border: 0,
            background: "#1a1714",
            color: "#f4f0e8",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        {message ? <p style={{ margin: 0, color: "#047857", fontSize: 13 }}>{message}</p> : null}
        {error ? <p style={{ margin: 0, color: "#b52c00", fontSize: 13 }}>{error}</p> : null}
      </form>
      <h2 style={{ fontSize: 16, marginTop: 28 }}>ประวัติ</h2>
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            style={{
              background: "#fff",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 13,
              border: "1px solid rgba(26,23,20,0.08)",
            }}
          >
            <strong>
              {entry.type} {entry.amount > 0 ? "+" : ""}
              {entry.amount}
            </strong>
            <span style={{ color: "#78726a" }}> → {entry.balanceAfter}</span>
            <div>{entry.reason}</div>
            <div style={{ color: "#78726a", fontSize: 11 }}>
              {entry.actor}
              {entry.actorEmail ? ` · ${entry.actorEmail}` : ""} ·{" "}
              {new Date(entry.createdAt).toLocaleString("th-TH")}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

function modeButton(active: boolean): CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid rgba(26,23,20,0.16)",
    background: active ? "#1a1714" : "#fff",
    color: active ? "#f4f0e8" : "#1a1714",
    cursor: "pointer",
  };
}

const field: CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(26,23,20,0.16)",
  boxSizing: "border-box",
};
