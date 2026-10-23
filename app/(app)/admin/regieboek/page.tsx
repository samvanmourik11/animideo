import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import Regieboek from "@/components/regisseur/Regieboek";

export const metadata = { title: "Regieboek · Animideo" };

export default async function RegieboekBeheer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminAccount(user.email)) redirect("/ontdek");
  return <Regieboek />;
}
