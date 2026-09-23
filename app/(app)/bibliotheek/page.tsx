// DE BIBLIOTHEEK: personages, voorwerpen en omgevingen onder één dak.
//
// Het waren drie losse menuknoppen naar drie losse pagina's, terwijl het voor de
// gebruiker één ding is: de dingen die in elke video hetzelfde horen te zijn.
// Deze pagina haalt alle drie de lijsten op en laat de bestaande clients per
// tabje zien; de oude adressen sturen hierheen door.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canUseDialoog, magRealistischeStijl } from "@/lib/studio/access";
import type { Character } from "@/lib/types";
import {
  leesBibliotheekVoorwerp, tabelOntbreekt, type BibliotheekVoorwerp,
} from "@/lib/infographics/voorwerp-bibliotheek";
import {
  leesBibliotheekOmgeving, type BibliotheekOmgeving,
} from "@/lib/infographics/omgeving-bibliotheek";
import BibliotheekClient from "./BibliotheekClient";

export default async function BibliotheekPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Voorwerpen en omgevingen horen bij de dialoogtool en gaan met die tool open;
  // personages staan voor iedereen open. Bij een dicht account tonen we dus
  // alleen het eerste tabje.
  const magObjecten = canUseDialoog(user.email);

  const [characters, voorwerpen, omgevingen] = await Promise.all([
    supabase.from("characters").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
    magObjecten
      ? supabase.from("voorwerpen").select("id, naam, uiterlijk, bladen, created_at, updated_at")
          .eq("user_id", user.id).order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as never),
    magObjecten
      ? supabase.from("omgevingen").select("id, naam, beschrijving, kenmerken, varianten, created_at, updated_at")
          .eq("user_id", user.id).order("updated_at", { ascending: false })
      : Promise.resolve({ data: [], error: null } as never),
  ]);

  const tab = (await searchParams).tab;

  return (
    <BibliotheekClient
      startTab={tab === "voorwerpen" || tab === "omgevingen" ? tab : "personages"}
      magObjecten={magObjecten}
      magRealistisch={magRealistischeStijl(user.email)}
      characters={(characters.data ?? []) as Character[]}
      voorwerpen={(voorwerpen.data ?? []).map(leesBibliotheekVoorwerp).filter((v): v is BibliotheekVoorwerp => !!v)}
      voorwerpenNietActief={tabelOntbreekt(voorwerpen.error)}
      omgevingen={(omgevingen.data ?? []).map(leesBibliotheekOmgeving).filter((o): o is BibliotheekOmgeving => !!o)}
      omgevingenNietActief={tabelOntbreekt(omgevingen.error)}
    />
  );
}
