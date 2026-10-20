// Werken met je team (nieuwe app, fase 4). Client-veilig.
//
// Eén gedeelde pot: collega's maken op de credits van de eigenaar. Hoeveel collega's er
// bij mogen, hangt af van het plan van de eigenaar. Starter en gratis hebben geen team.

/** Aantal collega's naast de eigenaar. */
export const TEAM_PLAATSEN: Record<string, number> = { pro: 3, agency: 10 };

export function teamPlaatsen(plan: string | null | undefined): number {
  return TEAM_PLAATSEN[plan ?? ""] ?? 0;
}

export type TeamRol = "eigenaar" | "lid";

export interface TeamLid {
  user_id: string;
  email: string | null;
  naam: string | null;
  rol: TeamRol;
  /** Credits die dit lid deze maand van de pot gebruikte. */
  verbruik: number;
}

export interface TeamUitnodiging {
  id: string;
  email: string;
  created_at: string;
  verloopt_op: string;
  link: string;
}

export interface TeamOverzicht {
  team: { id: string; naam: string; eigenaar_id: string } | null;
  rol: TeamRol | null;
  leden: TeamLid[];
  uitnodigingen: TeamUitnodiging[];
  /** Plan van de eigenaar (of van jezelf, zonder team). */
  plan: string;
  plaatsen: number;
  saldo: number;
}
