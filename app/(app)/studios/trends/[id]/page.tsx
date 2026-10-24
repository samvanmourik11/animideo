import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import { trendVoor } from "@/lib/trends/lijst";
import TrendMaker from "@/components/trends/TrendMaker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await trendVoor((await params).id, false);
  return { title: t ? `${t.titel} · Animideo` : "Trends · Animideo" };
}

export default async function TrendPagina({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const beheer = isAdminAccount(user.email);
  const t = await trendVoor((await params).id, beheer);
  if (!t) notFound();
  return <TrendMaker trend={t} beheer={beheer} />;
}
