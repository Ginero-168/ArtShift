"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: number;
  lastSeenAt: number;
  balance: number;
};

export default function AdminHome() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [summary, setSummary] = useState<{ users: number; outstandingCredits: number } | null>(
    null,
  );
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      void fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = (await response.json()) as { users?: AdminUser[]; error?: string };
          if (!response.ok) throw new Error(payload.error || "โหลดผู้ใช้ไม่สำเร็จ");
          setUsers(payload.users ?? []);
          setError("");
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "โหลดผู้ใช้ไม่สำเร็จ");
        });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    void fetch("/api/admin/summary", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        setSummary((await response.json()) as { users: number; outstandingCredits: number });
      })
      .catch(() => undefined);
  }, []);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px 64px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", color: "#78726a" }}>ARTSHIFT</div>
          <h1 style={{ fontFamily: '"Instrument Serif", serif', fontSize: 36, margin: "6px 0" }}>
            ผู้ดูแลเครดิต
          </h1>
        </div>
        <Link href="/projects" style={{ fontSize: 13, color: "#443f39", alignSelf: "center" }}>
          กลับสตูดิโอ
        </Link>
      </div>
      <section style={{ display: "flex", gap: 12, margin: "8px 0 20px" }}>
        <Stat label="ผู้ใช้ทั้งหมด" value={summary ? String(summary.users) : "…"} />
        <Stat
          label="เครดิตค้างในระบบ"
          value={summary ? summary.outstandingCredits.toLocaleString("th-TH") : "…"}
        />
      </section>
      <label style={{ display: "block", fontSize: 13 }}>
        ค้นหาอีเมล
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="name@example.com"
          style={{
            display: "block",
            width: "min(360px, 100%)",
            marginTop: 6,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(26,23,20,0.16)",
            background: "#fff",
          }}
        />
      </label>
      {error ? <p style={{ color: "#b52c00" }}>{error}</p> : null}
      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff" }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: "#78726a" }}>
              <th style={th}>อีเมล</th>
              <th style={th}>ชื่อ</th>
              <th style={th}>เครดิต</th>
              <th style={th}>สร้างเมื่อ</th>
              <th style={th}>เห็นล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ borderTop: "1px solid rgba(26,23,20,0.08)" }}>
                <td style={td}>
                  <Link href={`/admin/users/${user.id}`} style={{ color: "#b52c00" }}>
                    {user.email}
                  </Link>
                </td>
                <td style={td}>{user.name || "—"}</td>
                <td style={td}>{user.balance.toLocaleString("th-TH")}</td>
                <td style={td}>{new Date(user.createdAt).toLocaleString("th-TH")}</td>
                <td style={td}>{new Date(user.lastSeenAt).toLocaleString("th-TH")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && !error ? (
          <p style={{ color: "#78726a", fontSize: 13 }}>ไม่พบผู้ใช้</p>
        ) : null}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "#fff",
        borderRadius: 10,
        border: "1px solid rgba(26,23,20,0.1)",
        minWidth: 160,
      }}
    >
      <div style={{ fontSize: 12, color: "#78726a" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const th = { padding: "10px 12px", fontWeight: 600 };
const td = { padding: "10px 12px" };
