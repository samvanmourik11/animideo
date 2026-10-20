import { createServiceClient } from "@/lib/supabase/service";
import { getProfile } from "@/lib/credits";
import { ledenVan, mijnTeam } from "./team";
import { teamPlaatsen, type TeamOverzicht } from "./types";

export function uitnodigingsLink(origin: string, token: string): string {
  return `${origin}/doe-mee/${token}`;
}

/** Alles voor de teampagina. Het verbruik is van deze kalendermaand. */
export async function teamOverzicht(userId: string, origin: string): Promise<TeamOverzicht> {
  const team = await mijnTeam(userId);
  if (!team) {
    const p = await getProfile(userId, { service: true });
    return { team: null, rol: null, leden: [], uitnodigingen: [], plan: p.plan, plaatsen: teamPlaatsen(p.plan), saldo: p.credits };
  }
  const db = createServiceClient();
  const eigenaar = await getProfile(team.eigenaar_id, { service: true });
  const leden = await ledenVan(team.id);
  const ids = leden.map((l) => l.user_id);
  const maandBegin = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [{ data: profielen }, { data: verbruik }, { data: uitnodigingen }] = await Promise.all([
    db.from("profiles").select("id, email, name").in("id", ids),
    db.from("team_verbruik").select("user_id, credits").eq("team_id", team.id).gte("created_at", maandBegin),
    team.rol === "eigenaar"
      ? db
          .from("team_uitnodigingen")
          .select("id, email, token, created_at, verloopt_op")
          .eq("team_id", team.id)
          .is("geaccepteerd_op", null)
          .gt("verloopt_op", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const perLid = new Map<string, number>();
  for (const v of (verbruik ?? []) as { user_id: string; credits: number }[]) {
    perLid.set(v.user_id, (perLid.get(v.user_id) ?? 0) + v.credits);
  }
  const profiel = new Map(((profielen ?? []) as { id: string; email: string | null; name: string | null }[]).map((p) => [p.id, p]));
  return {
    team: { id: team.id, naam: team.naam, eigenaar_id: team.eigenaar_id },
    rol: team.rol,
    leden: leden
      .map((l) => ({
        user_id: l.user_id,
        email: profiel.get(l.user_id)?.email ?? null,
        naam: profiel.get(l.user_id)?.name ?? null,
        rol: l.rol,
        verbruik: perLid.get(l.user_id) ?? 0,
      }))
      .sort((a, b) => (a.rol === "eigenaar" ? -1 : b.rol === "eigenaar" ? 1 : b.verbruik - a.verbruik)),
    uitnodigingen: ((uitnodigingen ?? []) as { id: string; email: string; token: string; created_at: string; verloopt_op: string }[]).map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      verloopt_op: u.verloopt_op,
      link: uitnodigingsLink(origin, u.token),
    })),
    plan: eigenaar.plan,
    plaatsen: teamPlaatsen(eigenaar.plan),
    saldo: eigenaar.credits,
  };
}
