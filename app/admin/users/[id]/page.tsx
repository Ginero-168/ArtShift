import AdminUserDetail from "@/components/Admin/AdminUserDetail";

export const dynamic = "force-dynamic";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserDetail userId={id} />;
}
