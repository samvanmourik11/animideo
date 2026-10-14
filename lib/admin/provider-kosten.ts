// Samenvatting van het kostenlogboek voor het beheerdashboard.
//
// Puur (geen database), zodat het te testen is: de route haalt de rijen op en
// geeft ze hier doorheen.

export interface KostenRij {
  created_at: string;
  email: string | null;
  model: string;
  kosten_usd: number | string;
  actie: string | null;
}

/**
 * Omrekening van dollars naar euro's. fal rekent in dollars; de bank schreef
 * eind september €17,70 af per opwaardering van $20, vandaar 0,885.
 */
export const USD_NAAR_EUR = 0.885;

/** Boven dit bedrag per dag kleurt het dashboard rood. */
export const DAGGRENS_EUR = 50;

export interface KostenPost { naam: string; eur: number; aantal: number; intern?: boolean }

export interface KostenSamenvatting {
  vandaagEur: number;
  zevenDagenEur: number;
  dertigDagenEur: number;
  daggrensEur: number;
  perDag: { dag: string; eur: number }[];
  perAccount: KostenPost[];
  perActie: KostenPost[];
  internAandeel: number;
}

const dagVan = (iso: string) => iso.slice(0, 10);

function top(map: Map<string, { eur: number; aantal: number; intern?: boolean }>, n: number): KostenPost[] {
  return [...map.entries()]
    .map(([naam, v]) => ({ naam, ...v, eur: Math.round(v.eur * 100) / 100 }))
    .sort((a, b) => b.eur - a.eur)
    .slice(0, n);
}

export function vatKostenSamen(
  rijen: KostenRij[],
  nu: Date,
  isIntern: (email: string | null) => boolean
): KostenSamenvatting {
  const vandaag = dagVan(nu.toISOString());
  const grens7 = nu.getTime() - 7 * 86400_000;
  let vandaagEur = 0, zevenEur = 0, dertigEur = 0, internEur = 0;
  const perDag = new Map<string, number>();
  const perAccount = new Map<string, { eur: number; aantal: number; intern?: boolean }>();
  const perActie = new Map<string, { eur: number; aantal: number }>();

  for (const r of rijen) {
    const eur = Number(r.kosten_usd) * USD_NAAR_EUR;
    if (!Number.isFinite(eur)) continue;
    dertigEur += eur;
    const dag = dagVan(r.created_at);
    if (dag === vandaag) vandaagEur += eur;
    if (new Date(r.created_at).getTime() < grens7) continue;

    zevenEur += eur;
    perDag.set(dag, (perDag.get(dag) ?? 0) + eur);
    const intern = isIntern(r.email);
    if (intern) internEur += eur;
    const wie = r.email ?? "(onbekend: geen creditafschrijving vooraf)";
    const a = perAccount.get(wie) ?? { eur: 0, aantal: 0, intern };
    a.eur += eur; a.aantal += 1; perAccount.set(wie, a);
    // De actie zegt meer dan het model ("Story genereren" vs "nano-banana/edit"),
    // maar niet elke aanroep heeft er een.
    const wat = (r.actie ?? r.model).replace(/\d+/g, "#");
    const w = perActie.get(wat) ?? { eur: 0, aantal: 0 };
    w.eur += eur; w.aantal += 1; perActie.set(wat, w);
  }

  const dagen: { dag: string; eur: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = dagVan(new Date(nu.getTime() - i * 86400_000).toISOString());
    dagen.push({ dag: d, eur: Math.round((perDag.get(d) ?? 0) * 100) / 100 });
  }

  const rond = (n: number) => Math.round(n * 100) / 100;
  return {
    vandaagEur: rond(vandaagEur),
    zevenDagenEur: rond(zevenEur),
    dertigDagenEur: rond(dertigEur),
    daggrensEur: DAGGRENS_EUR,
    perDag: dagen,
    perAccount: top(perAccount, 10),
    perActie: top(perActie, 10),
    internAandeel: zevenEur > 0 ? Math.round((internEur / zevenEur) * 100) : 0,
  };
}
