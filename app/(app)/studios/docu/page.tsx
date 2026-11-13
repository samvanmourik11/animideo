import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseDocu } from "@/lib/studio/access";
import DocuStudio from "@/components/docu/DocuStudio";

export const metadata = { title: "Docu · Animideo" };

export default async function DocuPagina() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Nog niet voor iedereen open (lib/studio/access.ts).
  if (!canUseDocu(user.email)) notFound();
  return <DocuStudio />;
}
