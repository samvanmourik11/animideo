import { canUseDialoog } from "@/lib/studio/access";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { tabelOntbreekt } from "@/lib/infographics/voorwerp-bibliotheek";
import { leesBibliotheekOmgeving, type BibliotheekOmgeving } from "@/lib/infographics/omgeving-bibliotheek";
import OmgevingenClient from "./OmgevingenClient";

export default async function OmgevingenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Hoort bij de dialoogtool, die nog niet voor iedereen open is (zie access.ts).
  if (!canUseDialoog(user.email)) redirect("/dashboard");

  const { data, error } = await supabase
    .from("omgevingen")
    .select("id, naam, beschrijving, kenmerken, varianten, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <OmgevingenClient
      initialOmgevingen={(data ?? []).map(leesBibliotheekOmgeving).filter((o): o is BibliotheekOmgeving => !!o)}
      nietActief={tabelOntbreekt(error)}
      fout={error && !tabelOntbreekt(error) ? error.message : null}
    />
  );
}
