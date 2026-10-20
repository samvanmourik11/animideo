import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminAccount } from "@/lib/studio/access";
import VoorpaginaBeoordelen from "@/components/delen/VoorpaginaBeoordelen";

export const metadata = { title: "Voorpagina beoordelen · Animideo" };

export default async function VoorpaginaBeheer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminAccount(user.email)) redirect("/ontdek");
  return <VoorpaginaBeoordelen />;
}
