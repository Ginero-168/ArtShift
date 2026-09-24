"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type LedgerEntry = {
  id: string;
  type: "top_up" | "spend" | "adjust" | "refund";
  amount: number;
  balanceAfter: number;
  reason: string;
  action: string | null;
  createdAt: number;
  actor: string;
};

const TYPE_LABEL: Record<LedgerEntry["type"], string> = {
  top_up: "เติม",
  spend: "ใช้",
  adjust: "ปรับ",
  refund: "คืน",
};

export default function CreditsPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/credits", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          balance?: number;
          entries?: LedgerEntry[];
          error?: string;
        };
        if (response.status === 401) throw new Error("เข้าสู่ระบบด้วย Google เพื่อดูเครดิต");
        if (!response.ok) throw new Error(payload.error || "อ่านเครดิตไม่สำเร็จ");
        if (!cancelled) {
          setBalance(payload.balance ?? 0);
          setEntries(payload.entries ?? []);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "อ่านเครดิตไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f0e8",
        color: "#1a1714",
        padding: "32px 20px 64px",
      }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/projects" style={{ fontSize: 13, color: "#78726a" }}>
          ← กลับไปโปรเจกต์
        </Link>
        <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 40, margin: "16px 0 8px" }}>
          เครดิต
        </h1>
        <p style={{ margin: 0, color: "#78726a", fontSize: 14, lineHeight: 1.5 }}>
          1 เครดิต = 0.01 บาทของยอดที่เรียกเก็บ (ต้นทุนผู้ให้บริการบวกมาร์จิ้นประมาณ 25%)
          บัญชีใหม่ได้เครดิตต้อนรับจำนวนเล็กน้อย การเติมเครดิตทำโดยผู้ดูแลเท่านั้น
        </p>
        <section
          style={{
            marginTop: 24,
            padding: 20,
            background: "#fff",
            border: "1px solid rgba(26,23,20,0.12)",
            borderRadius: 12,
          }}
        >
          <div style={{ fontSize: 12, color: "#78726a" }}>ยอดคงเหลือ</div>
          <div style={{ fontSize: 36, fontWeight: 700, marginTop: 4 }}>
            {balance === null ? "…" : balance.toLocaleString("th-TH")}
            <span style={{ fontSize: 16, fontWeight: 500, marginLeft: 8 }}>เครดิต</span>
          </div>
          {error ? <p style={{ color: "#b52c00", fontSize: 13 }}>{error}</p> : null}
        </section>
        <h2 style={{ fontSize: 16, margin: "28px 0 10px" }}>รายการล่าสุด</h2>
        {entries.length === 0 ? (
          <p style={{ color: "#78726a", fontSize: 14 }}>ยังไม่มีรายการ</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {entries.map((entry) => (
              <li
                key={entry.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr auto",
                  gap: 12,
                  alignItems: "baseline",
                  padding: "10px 12px",
                  background: "#fff",
                  borderRadius: 8,
                  border: "1px solid rgba(26,23,20,0.08)",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#78726a" }}>{TYPE_LABEL[entry.type]}</span>
                <span>
                  {entry.reason}
                  <span style={{ display: "block", color: "#78726a", fontSize: 11 }}>
                    {new Date(entry.createdAt).toLocaleString("th-TH")}
                  </span>
                </span>
                <strong style={{ color: entry.amount < 0 ? "#b52c00" : "#1a1714" }}>
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount.toLocaleString("th-TH")}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
