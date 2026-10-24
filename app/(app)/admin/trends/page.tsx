import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import TrendBeheer from "@/components/trends/TrendBeheer";

export const metadata = { title: "Trends keuren · Animideo" };

export default async function TrendsBeheer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminAccount(user.email)) redirect("/ontdek");
  return <TrendBeheer />;
}
