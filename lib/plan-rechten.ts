// Wat elk pakket mag (Sam, 25-10-2026; losse credits sinds 26-10 voor elk abonnement). Starter kan alles maken; Pro bespaart tijd
// (automatisch posten, Claude, je eigen stem, samenwerken); Agency heeft alles onbeperkt
// plus eigen sleutels. Credits staan los hiervan in lib/credit-costs.ts, teamplaatsen in
// lib/team/types.ts. Client-veilig: alleen de tabel en pure functies.

export type Plan = "free" | "starter" | "pro" | "agency";

export type Recht =
  /** Posts vooruit inplannen via gekoppelde socialmedia-accounts. */
  | "vooruitPosten"
  /** Animideo in de Claude-app (verbinden via inloggen). */
  | "claude"
  /** Eigen stem trainen en een foto laten praten. */
  | "stemKlonen"
  /** Losse credits bijkopen. */
  | "losseCredits"
  /** Persoonlijke sleutels voor Claude Code, Cursor en eigen koppelingen. */
  | "apiSleutels";

const RANG: Record<Plan, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

export const VANAF: Record<Recht, Plan> = {
  vooruitPosten: "pro",
  claude: "pro",
  stemKlonen: "pro",
  losseCredits: "starter",
  apiSleutels: "agency",
};

/** Hoeveel socialmedia-accounts je mag koppelen. */
export const SOCIAL_ACCOUNTS: Record<Plan, number> = { free: 0, starter: 0, pro: 3, agency: Infinity };

/** Hoeveel huisstijlen je mag hebben. */
export const HUISSTIJLEN: Record<Plan, number> = { free: 1, starter: 1, pro: 5, agency: Infinity };

export const PLAN_NAAM: Record<Plan, string> = { free: "Gratis", starter: "Starter", pro: "Pro", agency: "Agency" };

export function alsPlan(p: string | null | undefined): Plan {
  return p === "starter" || p === "pro" || p === "agency" ? p : "free";
}

export function mag(plan: string | null | undefined, recht: Recht): boolean {
  return RANG[alsPlan(plan)] >= RANG[VANAF[recht]];
}

/** De melding als iets niet in je pakket zit. */
export function upgradeTekst(recht: Recht): string {
  const wat: Record<Recht, string> = {
    vooruitPosten: "Automatisch vooruit posten",
    claude: "Animideo in Claude",
    stemKlonen: "Je eigen stem en pratende foto's",
    losseCredits: "Losse credits bijkopen",
    apiSleutels: "Eigen sleutels",
  };
  return `${wat[recht]} zit in ${PLAN_NAAM[VANAF[recht]]}${VANAF[recht] === "pro" ? " en Agency" : ""}. Upgrade onder Abonnementen om het te gebruiken.`;
}

export class PlanFout extends Error {
  readonly status = 403;
  constructor(readonly recht: Recht | null, bericht: string) {
    super(bericht);
  }
}
