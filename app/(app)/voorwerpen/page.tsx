import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  leesBibliotheekVoorwerp, tabelOntbreekt, type BibliotheekVoorwerp,
} from "@/lib/infographics/voorwerp-bibliotheek";
import VoorwerpenClient from "./VoorwerpenClient";

export default async function VoorwerpenPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("voorwerpen")
    .select("id, naam, uiterlijk, bladen, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <VoorwerpenClient
      initialVoorwerpen={(data ?? []).map(leesBibliotheekVoorwerp).filter((v): v is BibliotheekVoorwerp => !!v)}
      nietActief={tabelOntbreekt(error)}
      fout={error && !tabelOntbreekt(error) ? error.message : null}
    />
  );
}
