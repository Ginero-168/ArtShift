import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/server/auth/admin";
import { AUTH_SESSION_COOKIE, getAccountFromSessionToken } from "@/lib/server/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const account = getAccountFromSessionToken(jar.get(AUTH_SESSION_COOKIE)?.value);
  if (!account || !isAdminEmail(account.email)) redirect("/");
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f0e8",
        color: "#1a1714",
        fontFamily: '"Anuphan", "Sarabun", sans-serif',
      }}
    >
      {children}
    </div>
  );
}
