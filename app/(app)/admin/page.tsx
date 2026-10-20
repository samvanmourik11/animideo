import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import AdminDashboard from "@/components/admin/AdminDashboard";
import ProviderKosten from "@/components/admin/ProviderKosten";
import Achterstanden from "@/components/admin/Achterstanden";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // Dubbel slot: het is_admin-vinkje én het adres. Het dashboard toont omzet,
  // klantgegevens en terugboekingen; dat is alleen voor Sam, ook als iemand
  // anders ooit het vinkje krijgt.
  if (!profile?.is_admin || !isAdminAccount(user.email)) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <Link
        href="/admin/voorpagina"
        className="block rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-500/15"
      >
        ⭐ Nieuwe app: ingestuurd werk voor de voorpagina beoordelen →
      </Link>
      <AdminDashboard />
      <Achterstanden />
      <ProviderKosten />
    </div>
  );
}
