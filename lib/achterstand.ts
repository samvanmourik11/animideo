// Teruggeboekte incasso's terughalen (Sam, 14-10-2026).
//
// Een terugboeking wordt een openstaande post in `chargebacks`. De klant krijgt
// direct een mail met een betaallink, na 7 dagen een herinnering en na 14 dagen
// een laatste herinnering. Tot er betaald is staat het account op slot
// (`profiles.achterstand_sinds`); het abonnement zelf blijft lopen. Na betaling
// gaat het slot er vanzelf af.
//
// Posten worden per klant gebundeld: wie twee maanden terugboekt, krijgt één
// mail en één link voor het totaal. De link verwijst naar het id van één post;
// de betaalpagina rekent altijd het actuele totaal van die klant uit, zodat een
// oude link nooit een verkeerd bedrag vraagt.
//
// Alles hier is idempotent: Mollie meldt dezelfde betaling meer dan eens, en de
// dagelijkse sweep loopt over terugboekingen die de webhook al zag.
// Alleen server-side gebruiken (service-client + Mollie-sleutel).

import { createServiceClient } from "@/lib/supabase/service";
import { bouwBevestiging, bouwMail, toonVoorReden, type Dossier, type MailSoort } from "@/lib/achterstand-mail";

/**
 * Alleen terugboekingen vanaf deze datum vallen onder het systeem. Oudere zaken
 * handelt Sam zelf af; zonder deze grens zou de eerste sweep 39 oude klanten
 * tegelijk mailen.
 */
export const ACHTERSTAND_START = "2026-10-15T00:00:00+02:00";

const DAG = 24 * 60 * 60 * 1000;
export const HERINNERING_NA_DAGEN = 7;

const AFZENDER = "Animideo <noreply@jouwanimatievideo.nl>";
const ANTWOORD_NAAR = "info@jouwanimatievideo.nl";

/**
 * Antwoordt een klant op een mail, dan stopt de reeks en neemt de klantenservice
 * het met de hand over (Sam, 14-10-2026): een herinnering terwijl je al een
 * regeling aan het treffen bent, oogt onprofessioneel. Daarom gaat een antwoord
 * naar een eigen adres per dossier dat Resend ontvangt (zie
 * app/api/resend/inbound). Zolang ANTWOORD_DOMEIN niet gezet is, gaat het
 * antwoord gewoon naar info@: anders zou een antwoord onbestelbaar terugkomen
 * voordat de DNS klaar is.
 */
export function antwoordAdres(postId: string): string {
  const domein = process.env.ANTWOORD_DOMEIN?.trim();
  return domein ? `antwoord-${postId}@${domein}` : ANTWOORD_NAAR;
}

/** Het dossier-id uit een antwoordadres, of null. */
export function postIdUitAdres(adres: string): string | null {
  const m = /antwoord-([0-9a-f-]{36})@/i.exec(adres);
  return m ? m[1].toLowerCase() : null;
}
/** Sam leest elke mail mee, zodat een reactie van de klant nooit als verrassing komt. */
const KOPIE_NAAR = "info@jouwanimatievideo.nl";

export interface Post {
  id: string;
  user_id: string | null;
  mollie_payment_id: string;
  mollie_customer_id: string | null;
  amount: number | null;
  reden_code: string | null;
  email: string | null;
  guest_checkout_id: string | null;
  incasso_datum: string | null;
  status: "open" | "betaald" | "kwijtgescholden";
  mail_1_op: string | null;
  mail_2_op: string | null;
  mail_3_op: string | null;
  /** De klant antwoordde op een mail: geen automatische mails meer, de klantenservice neemt het over. */
  gereageerd_op: string | null;
  created_at: string;
}

interface MolliePayment {
  id: string;
  status: string;
  createdAt: string;
  paidAt?: string | null;
  amount: { value: string; currency: string };
  amountChargedBack?: { value: string; currency: string } | null;
  description?: string;
  method?: string | null;
  sequenceType?: string;
  customerId?: string | null;
  metadata?: Record<string, unknown> | null;
  details?: { consumerName?: string; consumerAccount?: string } | null;
}

interface MollieChargeback {
  id: string;
  createdAt: string;
  amount?: { value: string };
  reason?: { code?: string; description?: string } | null;
}

const MOLLIE_BASE = "https://api.mollie.com/v2";

/** Kleine Mollie-aanroep. `path` mag relatief (`/payments`) of een volledige URL zijn. */
export async function mollieFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.MOLLIE_API_KEY;
  if (!key || /x{4,}/.test(key)) throw new Error("MOLLIE_API_KEY ontbreekt of is een placeholder");
  const res = await fetch(path.startsWith("http") ? path : `${MOLLIE_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mollie ${res.status} op ${path}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

/** Recente terugboekingen bij Mollie (nieuwste eerst), tot en met `sinds`. */
export async function recenteTerugboekingen(sinds: string): Promise<{ paymentId: string; createdAt: string }[]> {
  // Datums vergelijken als tijd, niet als tekst: Mollie schrijft "+00:00", toISOString "Z".
  const grens = Date.parse(sinds);
  const uit: { paymentId: string; createdAt: string }[] = [];
  let url: string | null = `${MOLLIE_BASE}/chargebacks?limit=250`;
  while (url && uit.length < 1000) {
    const pagina: { _embedded?: { chargebacks?: { paymentId: string; createdAt: string }[] }; _links?: { next?: { href: string } | null } } =
      await mollieFetch(url);
    const items = pagina._embedded?.chargebacks ?? [];
    uit.push(...items.filter((c) => Date.parse(c.createdAt) >= grens));
    if (items.length === 0 || Date.parse(items[items.length - 1].createdAt) < grens) break;
    url = pagina._links?.next?.href ?? null;
  }
  return uit;
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://ai.animideo.com").replace(/\/$/, "");
}

export function betaalUrl(postId: string): string {
  return `${appUrl()}/betalen/${postId}`;
}

/** Is er op deze Mollie-betaling teruggeboekt? Let op de hoofdletter B: Mollie schrijft `amountChargedBack`. */
export function isTeruggeboekt(payment: { amountChargedBack?: { value: string } | null }): boolean {
  return Number(payment.amountChargedBack?.value ?? 0) > 0;
}

// ── Vastleggen ────────────────────────────────────────────────────────────

/**
 * Een terugboeking op `paymentId` verwerken: post aanmaken, account op slot,
 * eerste mail sturen. Doet niets als de post er al is.
 */
export async function verwerkTerugboeking(paymentId: string): Promise<{ nieuw: boolean; postId: string | null }> {
  const db = createServiceClient();

  const { data: bestaand } = await db.from("chargebacks").select("id").eq("mollie_payment_id", paymentId).maybeSingle();
  if (bestaand) return { nieuw: false, postId: bestaand.id };

  const payment = await mollieFetch<MolliePayment>(`/payments/${paymentId}`);
  if (!isTeruggeboekt(payment)) return { nieuw: false, postId: null };

  // Een terugboeking op een betaling van de betaallink zelf: die post blijft
  // betaald staan in de boeken, maar dit is een nieuwe achterstand.
  const cbs = await mollieFetch<{ _embedded?: { chargebacks?: MollieChargeback[] } }>(
    `/payments/${paymentId}/chargebacks`
  ).catch(() => null);
  const laatste = (cbs?._embedded?.chargebacks ?? []).sort((a: MollieChargeback, b: MollieChargeback) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  // Oude zaken handelt Sam zelf af, ook als Mollie zo'n betaling nog eens meldt.
  if (laatste && new Date(laatste.createdAt) < new Date(ACHTERSTAND_START)) return { nieuw: false, postId: null };

  const meta = payment.metadata ?? {};
  const customerId = payment.customerId ?? null;
  const guestCheckoutId = (meta.guestCheckoutId as string | undefined) ?? null;
  const { userId, email } = await vindKlant(db, {
    userId: (meta.userId as string | undefined) ?? null,
    customerId,
    guestCheckoutId,
  });

  const { data: post, error } = await db
    .from("chargebacks")
    .insert({
      user_id: userId,
      mollie_payment_id: paymentId,
      mollie_customer_id: customerId,
      amount: Number(payment.amountChargedBack?.value ?? payment.amount.value),
      currency: payment.amount.currency,
      reden_code: laatste?.reason?.code ?? null,
      reden: laatste?.reason?.description ?? null,
      email,
      guest_checkout_id: guestCheckoutId,
      incasso_datum: payment.paidAt ?? payment.createdAt,
      status: "open",
    })
    .select("*")
    .single();

  // De unieke index op mollie_payment_id vangt een gelijktijdige tweede melding
  // af: die insert faalt, en dan heeft de eerste het werk al gedaan.
  if (error || !post) return { nieuw: false, postId: null };

  if (userId) {
    await db
      .from("profiles")
      .update({ achterstand_sinds: new Date().toISOString() })
      .eq("id", userId)
      .is("achterstand_sinds", null);
  }

  await mailKlant(post as Post, "eerste");
  console.warn(`[achterstand] terugboeking ${paymentId} vastgelegd (klant ${customerId ?? "?"}, ${email ?? "geen e-mail"})`);
  return { nieuw: true, postId: post.id };
}

type Db = ReturnType<typeof createServiceClient>;

/** Account en e-mailadres bij een betaling. Gastklanten hebben geen userId in de metadata. */
async function vindKlant(
  db: Db,
  { userId, customerId, guestCheckoutId }: { userId: string | null; customerId: string | null; guestCheckoutId: string | null }
): Promise<{ userId: string | null; email: string | null }> {
  let email: string | null = null;

  if (!userId && customerId) {
    const { data } = await db.from("profiles").select("id").eq("mollie_customer_id", customerId).maybeSingle();
    userId = data?.id ?? null;
  }
  if (guestCheckoutId) {
    const { data } = await db.from("pending_checkouts").select("email").eq("id", guestCheckoutId).maybeSingle();
    email = data?.email ?? null;
    if (!userId && email) {
      const { data: p } = await db
        .from("profiles")
        .select("id")
        .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
        .maybeSingle();
      userId = p?.id ?? null;
    }
  }
  if (userId) {
    const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    email = data?.email ?? email;
  }
  if (!email && customerId) {
    const c = await mollieFetch<{ email?: string }>(`/customers/${customerId}`).catch(() => null);
    email = c?.email ?? null;
  }
  return { userId, email: email?.trim().toLowerCase() ?? null };
}

// ── Opvragen ──────────────────────────────────────────────────────────────

/** Alle openstaande posten van dezelfde klant als `post` (op Mollie-klant, anders op e-mail). */
export async function openPostenVan(post: Pick<Post, "mollie_customer_id" | "email">): Promise<Post[]> {
  const db = createServiceClient();
  let q = db.from("chargebacks").select("*").eq("status", "open");
  if (post.mollie_customer_id) q = q.eq("mollie_customer_id", post.mollie_customer_id);
  else if (post.email) q = q.eq("email", post.email);
  else return [];
  const { data } = await q.order("incasso_datum", { ascending: true });
  return (data ?? []) as Post[];
}

export async function haalPost(id: string): Promise<Post | null> {
  // Geen geldig uuid? Dan niet eens naar de database: een kapotte link geeft anders een 500.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await createServiceClient().from("chargebacks").select("*").eq("id", id).maybeSingle();
  return (data as Post | null) ?? null;
}

// ── Bewijs verzamelen ─────────────────────────────────────────────────────

export async function stelDossierSamen(posten: Post[]): Promise<Dossier | null> {
  const db = createServiceClient();
  const eerste = posten[0];
  const email = posten.find((p) => p.email)?.email;
  if (!eerste || !email) return null;

  const userId = posten.find((p) => p.user_id)?.user_id ?? null;
  const customerId = eerste.mollie_customer_id;
  // De nieuwste post bepaalt de toon: één bewuste terugboeking maakt de rest niet vriendelijker.
  const nieuwste = [...posten].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const toon = posten.some((p) => toonVoorReden(p.reden_code) === "bewust") ? "bewust" : "mislukt";

  // Betalingen van deze klant bij Mollie: de eerste (aanmelding) en de incasso's.
  let betalingen: MolliePayment[] = [];
  if (customerId) {
    const r = await mollieFetch<{ _embedded?: { payments?: MolliePayment[] } }>(
      `/customers/${customerId}/payments?limit=250`
    ).catch(() => null);
    betalingen = r?._embedded?.payments ?? [];
  }
  // Betalingen via de betaallink zelf horen niet in het overzicht van het abonnement.
  betalingen = betalingen.filter((b) => !b.metadata?.achterstand);
  const eersteBetaling = betalingen
    .filter((b) => b.sequenceType === "first" && (b.status === "paid" || b.paidAt))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];

  const akkoordMeta = eersteBetaling?.metadata?.consent as
    | { terms?: boolean; subscription?: boolean; at?: string }
    | undefined;

  // Gebruik van de dienst.
  let naam: string | null = null;
  let laatstIngelogd: string | null = null;
  let projecten: { title: string | null; status: string | null; created_at: string }[] = [];
  let editorProjecten = 0;
  let afschrijvingen: { amount: number; created_at: string }[] = [];
  if (userId) {
    const [prof, proj, ed, tx, auth] = await Promise.all([
      db.from("profiles").select("name").eq("id", userId).maybeSingle(),
      db.from("projects").select("title,status,created_at").eq("user_id", userId).order("created_at"),
      db.from("editor_projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db.from("credit_transactions").select("amount,created_at").eq("user_id", userId).lt("amount", 0).order("created_at"),
      db.auth.admin.getUserById(userId),
    ]);
    naam = prof.data?.name?.trim() || null;
    projecten = proj.data ?? [];
    editorProjecten = ed.count ?? 0;
    afschrijvingen = tx.data ?? [];
    laatstIngelogd = auth.data?.user?.last_sign_in_at ?? null;
  }

  // Gebruik binnen de maand na elke teruggeboekte incasso.
  const perioden = posten
    .filter((p) => p.incasso_datum)
    .map((p) => [new Date(p.incasso_datum!).getTime(), new Date(p.incasso_datum!).getTime() + 31 * DAG] as const);
  const binnenPeriode = (iso: string) => {
    const t = new Date(iso).getTime();
    return perioden.some(([van, tot]) => t >= van && t < tot);
  };
  const momenten = [...afschrijvingen.map((a) => a.created_at), ...projecten.map((p) => p.created_at)];

  const afgerondeProjecten = projecten.filter((p) => p.status === "Done");
  const voorbeelden = [...afgerondeProjecten, ...projecten.filter((p) => p.status !== "Done")]
    .filter((p) => p.title && p.title !== "Untitled Project")
    .slice(0, 3)
    .map((p) => ({ titel: p.title!, datum: p.created_at }));

  const eerderGemaild = [
    ...new Set(posten.flatMap((p) => [p.mail_1_op, p.mail_2_op, p.mail_3_op]).filter((x): x is string => !!x)),
  ].sort();

  return {
    naam,
    email,
    toon,
    redenCode: nieuwste.reden_code,
    aanmelding: eersteBetaling
      ? {
          datum: eersteBetaling.paidAt ?? eersteBetaling.createdAt,
          omschrijving: eersteBetaling.description ?? "Animideo",
          bedrag: Number(eersteBetaling.amount.value),
          methode: eersteBetaling.method ?? null,
          rekeninghouder: eersteBetaling.details?.consumerName ?? null,
          rekening: eersteBetaling.details?.consumerAccount ?? null,
          akkoord: akkoordMeta?.at
            ? { op: akkoordMeta.at, abonnement: akkoordMeta.subscription === true, voorwaarden: akkoordMeta.terms === true }
            : null,
          webinar: eersteBetaling.metadata?.isCursus === true,
        }
      : null,
    betalingen: betalingen
      .filter((b) => b.sequenceType === "recurring" || b === eersteBetaling)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .map((b) => ({
        datum: b.paidAt ?? b.createdAt,
        bedrag: Number(b.amount.value),
        status: isTeruggeboekt(b) ? "teruggeboekt" : b.status === "paid" ? "betaald" : b.status === "failed" ? "mislukt" : "open",
      })),
    gebruik: {
      laatstIngelogd,
      aantalProjecten: projecten.length + editorProjecten,
      afgerond: afgerondeProjecten.length,
      voorbeelden,
      keerGebruikt: afschrijvingen.length,
      creditsGebruikt: afschrijvingen.reduce((s, a) => s - a.amount, 0),
      laatstGebruikt: afschrijvingen.at(-1)?.created_at ?? null,
      keerInTeruggeboektePeriode: momenten.filter(binnenPeriode).length,
    },
    open: posten.map((p) => ({ incassoDatum: p.incasso_datum ?? p.created_at, bedrag: Number(p.amount ?? 0) })),
    eerderGemaild,
    betaalUrl: betaalUrl(nieuwste.id),
  };
}

// ── Mailen ────────────────────────────────────────────────────────────────

async function verstuur(
  aan: string,
  mail: { onderwerp: string; text: string; html: string },
  antwoordAan: string = ANTWOORD_NAAR
): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return "RESEND_API_KEY ontbreekt";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: AFZENDER,
      to: [aan],
      bcc: aan === KOPIE_NAAR ? undefined : [KOPIE_NAAR],
      reply_to: antwoordAan,
      subject: mail.onderwerp,
      text: mail.text,
      html: mail.html,
    }),
  });
  if (res.ok) return null;
  return `Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
}

const MAIL_KOLOM: Record<MailSoort, "mail_1_op" | "mail_2_op" | "mail_3_op"> = {
  eerste: "mail_1_op",
  herinnering: "mail_2_op",
  laatste: "mail_3_op",
};

/**
 * Stuurt één mail over álle openstaande posten van de klant van `post`, en zet
 * de bijbehorende datum op elke post die hem nog niet had.
 */
export async function mailKlant(post: Post, soort: MailSoort): Promise<{ verstuurd: boolean; fout?: string }> {
  const db = createServiceClient();
  const posten = await openPostenVan(post);
  if (posten.length === 0) return { verstuurd: false, fout: "niets open" };

  const ids = posten.map((p) => p.id);
  // Heeft de klant al geantwoord, dan ligt het dossier bij de klantenservice,
  // ook als er intussen een nieuwe terugboeking bij is gekomen.
  const gereageerd = posten.map((p) => p.gereageerd_op).filter((x): x is string => !!x).sort()[0];
  if (gereageerd) {
    await db.from("chargebacks").update({ gereageerd_op: gereageerd }).in("id", ids).is("gereageerd_op", null);
    return { verstuurd: false, fout: "klant heeft gereageerd" };
  }

  const dossier = await stelDossierSamen(posten);
  if (!dossier) {
    await db.from("chargebacks").update({ mail_fout: "Geen e-mailadres bekend" }).in("id", ids);
    return { verstuurd: false, fout: "geen e-mailadres" };
  }

  const nieuwste = [...posten].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const fout = await verstuur(dossier.email, bouwMail(dossier, soort), antwoordAdres(nieuwste.id));
  if (fout) {
    await db.from("chargebacks").update({ mail_fout: fout }).in("id", ids);
    console.error(`[achterstand] mail (${soort}) aan ${dossier.email} mislukt: ${fout}`);
    return { verstuurd: false, fout };
  }
  const kolom = MAIL_KOLOM[soort];
  await db.from("chargebacks").update({ [kolom]: new Date().toISOString(), mail_fout: null }).in("id", ids).is(kolom, null);
  return { verstuurd: true };
}

/**
 * Herinneringen: 7 dagen na de laatste mail de volgende, tot en met de laatste
 * herinnering. Daarna staat de klant in het dashboard en beslist Sam.
 * De nieuwste post van een klant telt: komt er een nieuwe terugboeking bij, dan
 * begint de reeks voor het totaal opnieuw.
 */
export async function verstuurHerinneringen(nu = Date.now()): Promise<{ klant: string; soort: MailSoort; fout?: string }[]> {
  const db = createServiceClient();
  const { data } = await db.from("chargebacks").select("*").eq("status", "open");
  const perKlant = new Map<string, Post[]>();
  for (const p of (data ?? []) as Post[]) {
    const sleutel = p.mollie_customer_id ?? p.email ?? p.id;
    perKlant.set(sleutel, [...(perKlant.get(sleutel) ?? []), p]);
  }

  const gedaan: { klant: string; soort: MailSoort; fout?: string }[] = [];
  for (const [klant, posten] of perKlant) {
    const nieuwste = posten.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const soort = volgendeMail(nieuwste, nu);
    if (!soort) continue;
    const r = await mailKlant(nieuwste, soort);
    gedaan.push({ klant, soort, fout: r.fout });
  }
  return gedaan;
}

/** Welke mail er voor deze post nu aan de beurt is, of null. Los voor de tests. */
export function volgendeMail(
  p: Pick<Post, "mail_1_op" | "mail_2_op" | "mail_3_op" | "email"> & { gereageerd_op?: string | null },
  nu = Date.now()
): MailSoort | null {
  if (p.gereageerd_op) return null;
  const wacht = HERINNERING_NA_DAGEN * DAG;
  const verstreken = (iso: string) => nu - new Date(iso).getTime() >= wacht;
  // Eerste mail nooit verstuurd (bv. Resend lag eruit): alsnog proberen.
  if (!p.mail_1_op) return p.email ? "eerste" : null;
  if (!p.mail_2_op) return verstreken(p.mail_1_op) ? "herinnering" : null;
  if (!p.mail_3_op) return verstreken(p.mail_2_op) ? "laatste" : null;
  return null;
}

// ── Betalen ───────────────────────────────────────────────────────────────

/** Maakt een Mollie-betaling voor het actuele openstaande totaal. Null als er niets meer open staat. */
export async function startBetaling(post: Post): Promise<string | null> {
  const posten = await openPostenVan(post);
  if (posten.length === 0) return null;
  const bedrag = posten.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const n = posten.length;

  const payment = await mollieFetch<{ _links: { checkout?: { href: string } } }>("/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: { currency: "EUR", value: bedrag.toFixed(2) },
      description: `Animideo (JouwAnimatieVideo), openstaand bedrag (${n} teruggeboekte incasso${n > 1 ? "'s" : ""})`,
      redirectUrl: `${appUrl()}/betalen/${post.id}?terug=1`,
      webhookUrl: `${appUrl()}/api/mollie/webhook`,
      ...(post.mollie_customer_id ? { customerId: post.mollie_customer_id } : {}),
      metadata: { achterstand: true, posten: posten.map((p) => p.id) },
    }),
  });
  return payment._links.checkout?.href ?? null;
}

/**
 * Webhook-tak voor betalingen via de betaallink. Zet de posten op betaald,
 * haalt het slot van het account als er niets meer openstaat, en bevestigt.
 */
export async function verwerkAchterstandBetaling(payment: MolliePayment): Promise<void> {
  if (payment.status !== "paid") return;
  const ids = (payment.metadata?.posten as string[] | undefined) ?? [];
  if (ids.length === 0) return;

  const db = createServiceClient();
  const { data: bijgewerkt } = await db
    .from("chargebacks")
    .update({ status: "betaald", betaald_op: payment.paidAt ?? new Date().toISOString(), betaal_payment_id: payment.id })
    .in("id", ids)
    .eq("status", "open")
    .select("*");
  const posten = (bijgewerkt ?? []) as Post[];
  // Niets bijgewerkt = deze melding is al eerder verwerkt.
  if (posten.length === 0) return;

  for (const userId of new Set(posten.map((p) => p.user_id).filter((x): x is string => !!x))) {
    const { count } = await db
      .from("chargebacks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "open");
    if (!count) await db.from("profiles").update({ achterstand_sinds: null }).eq("id", userId);
  }

  const email = posten.find((p) => p.email)?.email;
  if (email) {
    let naam: string | null = null;
    const userId = posten.find((p) => p.user_id)?.user_id;
    if (userId) {
      const { data } = await db.from("profiles").select("name").eq("id", userId).maybeSingle();
      naam = data?.name?.trim() || null;
    }
    const fout = await verstuur(email, bouwBevestiging(naam, Number(payment.amount.value)));
    if (fout) console.error(`[achterstand] bevestiging aan ${email} mislukt: ${fout}`);
  }
}

// ── Antwoorden ────────────────────────────────────────────────────────────

/**
 * Een klant antwoordde op een van de mails. Stopt de reeks voor al zijn open
 * posten en stuurt het antwoord door naar info@, met het dossier erbij, zodat
 * de klantenservice het meteen kan oppakken. Het slot op het account blijft:
 * het bedrag staat nog open tot de klantenservice anders besluit.
 */
export async function verwerkAntwoord(mail: {
  emailId: string;
  van: string;
  aan: string[];
  onderwerp: string;
}): Promise<{ herkend: boolean }> {
  const db = createServiceClient();
  const postId = mail.aan.map(postIdUitAdres).find((x): x is string => !!x) ?? null;
  const vanAdres = (/<([^>]+)>/.exec(mail.van)?.[1] ?? mail.van).trim().toLowerCase();

  // Eerst via het adres (werkt ook als de klant vanaf een ander adres antwoordt),
  // anders via de afzender.
  let post = postId ? await haalPost(postId) : null;
  if (!post) {
    const { data } = await db.from("chargebacks").select("*").eq("status", "open").ilike("email", vanAdres).limit(1);
    post = ((data ?? [])[0] as Post | undefined) ?? null;
  }

  const nu = new Date().toISOString();
  const posten = post ? await openPostenVan(post) : [];
  if (posten.length) {
    await db.from("chargebacks").update({ gereageerd_op: nu }).in("id", posten.map((p) => p.id)).is("gereageerd_op", null);
  }

  // De inhoud zit niet in de webhook; die halen we apart op.
  let tekst = "";
  let html = "";
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(mail.emailId)}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (res.ok) {
      const j = (await res.json()) as { text?: string | null; html?: string | null };
      tekst = j.text ?? "";
      html = j.html ?? "";
    }
  } catch {
    // Doorsturen zonder inhoud is beter dan niet doorsturen: info@ ziet dan in elk geval wie er reageerde.
  }

  const totaalOpen = posten.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const kop = posten.length
    ? `${vanAdres} heeft gereageerd op de mail over de terugboeking. De automatische herinneringen zijn gestopt; ` +
      `neem het vanaf hier met de hand over. Openstaand: € ${totaalOpen.toFixed(2).replace(".", ",")}. ` +
      `Het account staat nog op slot tot er betaald is of je het dossier afboekt.`
    : `${vanAdres} stuurde een mail naar het antwoordadres van de terugboekingsmails, maar er is geen open dossier gevonden.`;
  const fout = await verstuur(
    KOPIE_NAAR,
    {
      onderwerp: `Reactie op terugboeking: ${mail.onderwerp || "(geen onderwerp)"}`,
      text: `${kop}\n\n---\n\n${tekst || "(Inhoud niet op te halen, zie Resend > Receiving.)"}`,
      html:
        `<p style="font-family:sans-serif;background:#fef3c7;padding:12px;border-radius:6px">${kop.replace(/</g, "&lt;")}</p><hr>` +
        (html || `<pre style="white-space:pre-wrap">${(tekst || "(Inhoud niet op te halen, zie Resend > Receiving.)").replace(/</g, "&lt;")}</pre>`),
    },
    vanAdres
  );
  if (fout) console.error(`[achterstand] antwoord van ${vanAdres} doorsturen mislukt: ${fout}`);
  return { herkend: posten.length > 0 };
}

// ── Beheer ────────────────────────────────────────────────────────────────

export interface OpenDossier {
  /** De nieuwste post: daarmee spreekt het beheerscherm het dossier aan. */
  postId: string;
  email: string | null;
  totaal: number;
  aantal: number;
  redenCode: string | null;
  sinds: string;
  laatsteMail: MailSoort | null;
  laatsteMailOp: string | null;
  gereageerdOp: string | null;
}

/** Alle open dossiers, één per klant, voor het beheerscherm. */
export async function openDossiers(): Promise<OpenDossier[]> {
  const { data } = await createServiceClient().from("chargebacks").select("*").eq("status", "open");
  const perKlant = new Map<string, Post[]>();
  for (const p of (data ?? []) as Post[]) {
    const sleutel = p.mollie_customer_id ?? p.email ?? p.id;
    perKlant.set(sleutel, [...(perKlant.get(sleutel) ?? []), p]);
  }
  return [...perKlant.values()]
    .map((posten) => {
      posten.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const n = posten[0];
      const laatsteMail: MailSoort | null = n.mail_3_op ? "laatste" : n.mail_2_op ? "herinnering" : n.mail_1_op ? "eerste" : null;
      return {
        postId: n.id,
        email: n.email,
        totaal: Math.round(posten.reduce((s, p) => s + Number(p.amount ?? 0), 0) * 100) / 100,
        aantal: posten.length,
        redenCode: n.reden_code,
        sinds: posten[posten.length - 1].created_at,
        laatsteMail,
        laatsteMailOp: n.mail_3_op ?? n.mail_2_op ?? n.mail_1_op,
        gereageerdOp: posten.map((p) => p.gereageerd_op).filter((x): x is string => !!x).sort()[0] ?? null,
      };
    })
    .sort((a, b) => (a.sinds < b.sinds ? 1 : -1));
}

/**
 * De reeks met de hand stoppen (klant belde of mailde los naar info@) of weer
 * hervatten. Geldt voor alle open posten van die klant; het slot op het account
 * blijft staan tot er betaald is.
 */
export async function zetReeks(postId: string, stoppen: boolean): Promise<boolean> {
  const post = await haalPost(postId);
  if (!post) return false;
  const ids = (await openPostenVan(post)).map((p) => p.id);
  if (!ids.length) return false;
  const { error } = await createServiceClient()
    .from("chargebacks")
    .update({ gereageerd_op: stoppen ? new Date().toISOString() : null })
    .in("id", ids);
  if (error) throw new Error(error.message);
  return true;
}
