// Kanalen van klanten die niet meer betalen, ontkoppelen (Sam, 23-10-2026). Zernio rekent
// per gekoppeld account per maand; een vertrokken klant kost anders gewoon door.
//
// Dag 0: we zien dat er geen actief abonnement meer is → waarschuwingsmail. Na 14 dagen:
// ingeplande posts annuleren, lopende kalenders stoppen, accounts ontkoppelen, laatste mail.
// Betaalt hij intussen weer, dan begint het niet (de teller gaat terug op nul).
//
// "Betaalt" vragen we aan Mollie zelf: profiles.subscription_status blijft op 'active'
// staan als iemand in het Mollie-dashboard opzegt. Twijfel (Mollie onbereikbaar, een
// plan zonder Mollie-abonnement) telt als betalend: liever een maand Zernio te veel dan
// een betalende klant zijn kanalen afpakken.

import { createServiceClient } from "@/lib/supabase/service";
import { mollieFetch } from "@/lib/mollie";
import { betalerVan } from "@/lib/team/team";
import { accountsVan, annuleer, ontkoppel } from "./zernio";
import { mailOpruimen } from "./mail";

export const GRATIE_DAGEN = 14;
const DAG_MS = 24 * 60 * 60 * 1000;

/** Onze eigen accounts (Sam, redacteuren) ruimen we nooit op. */
export function intern(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@jouwanimatievideo.nl");
}

export async function betaalt(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const eigenaar = await betalerVan(userId);
  const { data: p } = await db.from("profiles").select("email, plan, mollie_customer_id, mollie_subscription_id").eq("id", eigenaar).maybeSingle();
  if (!p) return true;
  if (intern(p.email)) return true;
  if (!p.plan || p.plan === "free") return false;
  if (!p.mollie_customer_id || !p.mollie_subscription_id) return true;
  try {
    const s = await mollieFetch<{ status?: string }>(`/customers/${p.mollie_customer_id}/subscriptions/${p.mollie_subscription_id}`);
    return s.status === "active";
  } catch (e) {
    // 404 = het abonnement bestaat niet meer; al het andere is twijfel.
    return !/Mollie 404/.test(e instanceof Error ? e.message : "");
  }
}

export type Stap = "niets" | "hersteld" | "gewaarschuwd" | "wacht" | "ontkoppeld";

/** Wat er vandaag met deze klant moet gebeuren (puur, los te testen). */
export function volgendeStap(o: { betaalt: boolean; accounts: number; sinds: number | null; nu: number }): Stap {
  if (o.betaalt) return o.sinds ? "hersteld" : "niets";
  if (!o.accounts) return "niets";
  if (!o.sinds) return "gewaarschuwd";
  return o.nu - o.sinds >= GRATIE_DAGEN * DAG_MS ? "ontkoppeld" : "wacht";
}

async function stopEnOntkoppel(userId: string): Promise<number> {
  const db = createServiceClient();
  const { data: ingepland } = await db.from("content_posts").select("id, zernio_post").eq("user_id", userId).eq("status", "ingepland");
  for (const p of ingepland ?? []) {
    if (p.zernio_post) await annuleer(p.zernio_post).catch((e) => console.error("[social/opruimen] annuleren:", e));
  }
  await db.from("content_posts").update({ status: "mislukt", foutmelding: "Niet geplaatst: je abonnement is gestopt." }).eq("user_id", userId).in("status", ["ingepland", "gepland", "maken", "te_keuren"]);
  await db.from("content_kalenders").update({ status: "gestopt" }).eq("user_id", userId).in("status", ["actief", "ideeen", "ideeen_maken"]);
  const accounts = await accountsVan(userId);
  for (const a of accounts) await ontkoppel(userId, a.id);
  return accounts.length;
}

/** De dagelijkse ronde. Geeft per stap terug hoeveel klanten. */
export async function ruimOp(nu = Date.now()): Promise<Record<Stap, number>> {
  const db = createServiceClient();
  const telling: Record<Stap, number> = { niets: 0, hersteld: 0, gewaarschuwd: 0, wacht: 0, ontkoppeld: 0 };
  const { data } = await db.from("social_profielen").select("user_id, niet_betalend_sinds").is("ontkoppeld_op", null);
  for (const r of data ?? []) {
    try {
      const accounts = (await accountsVan(r.user_id)).length;
      const sinds = r.niet_betalend_sinds ? new Date(r.niet_betalend_sinds).getTime() : null;
      const stap = volgendeStap({ betaalt: await betaalt(r.user_id), accounts, sinds, nu });
      telling[stap]++;
      if (stap === "hersteld") await db.from("social_profielen").update({ niet_betalend_sinds: null }).eq("user_id", r.user_id);
      if (stap === "gewaarschuwd") {
        await db.from("social_profielen").update({ niet_betalend_sinds: new Date(nu).toISOString() }).eq("user_id", r.user_id);
        await mailOpruimen(r.user_id, "waarschuwing", accounts);
      }
      if (stap === "ontkoppeld") {
        const n = await stopEnOntkoppel(r.user_id);
        await db.from("social_profielen").update({ ontkoppeld_op: new Date(nu).toISOString() }).eq("user_id", r.user_id);
        await mailOpruimen(r.user_id, "ontkoppeld", n);
      }
    } catch (e) {
      console.error("[social/opruimen]", r.user_id, e);
    }
  }
  return telling;
}
