// Aggregatie voor het admin-abonnementendashboard.
// Combineert Mollie (bron van waarheid voor abonnementen + betalingen) met Supabase
// (profiles/credit_transactions/projects). Alleen server-side gebruiken.
//
// Hergebruikte logica:
//  - MRR/actief/ARR + incasso-vooruitblik  → scripts/abonnementen-pdf-mollie.mjs
//  - drie-weg segmentatie betalend/comp/geannuleerd → scripts/abonnementen-pdf.mjs
//  - aanmeldingen (createdAt) / afmeldingen (canceledAt) tijdreeks → .mollie_key-rapport

import { molliePaginate, mollieFetch } from "@/lib/mollie";
import { createServiceClient } from "@/lib/supabase/service";

export const PLAN_PRICE: Record<string, number> = { free: 0, starter: 49, pro: 99, agency: 249 };
export const PLAN_LABELS: Record<string, string> = {
  free: "Gratis",
  starter: "Starter",
  pro: "Pro",
  agency: "Agency",
};
const PAID_PLANS = ["starter", "pro", "agency"];

// ---- Mollie-vormen (subset van de velden die we gebruiken) ----
interface MollieSub {
  id: string;
  customerId: string;
  status: string; // active | canceled | suspended | completed | pending
  amount?: { value: string; currency: string };
  interval?: string;
  createdAt: string;
  canceledAt?: string;
  startDate?: string;
  nextPaymentDate?: string;
  description?: string;
  metadata?: { planId?: string } | null;
}
interface MolliePayment {
  id: string;
  status: string; // paid | failed | expired | pending | canceled
  amount?: { value: string; currency: string };
  settlementAmount?: { value: string; currency: string } | null;
  method?: string | null;
  sequenceType?: string; // oneoff | first | recurring
  subscriptionId?: string | null;
  customerId?: string | null;
  createdAt: string;
  paidAt?: string | null;
  description?: string;
  details?: {
    bankReason?: string;
    failureReason?: string;
    failureMessage?: string;
    consumerName?: string;
    consumerAccount?: string;
  } | null;
}

/**
 * Terugboeking (storno) zoals Mollie hem teruggeeft op /chargebacks. Die lijst
 * gaat over álle betalingen, ook oudere dan het venster dat we voor de rest van
 * het dashboard ophalen — precies wat je wilt, want een storno komt vaak weken
 * ná de betaling binnen.
 */
interface MollieChargeback {
  id: string;
  amount?: { value: string; currency: string };
  createdAt: string;
  reason?: { code?: string; description?: string } | null;
  paymentId: string;
}

// ---- Payload-types (gedeeld met de client) ----
export interface DailyPoint {
  date: string;
  aanmeldingen: number;
  afmeldingen: number;
}
export interface KpiSet {
  mrr: number;
  arr: number;
  activePaying: number;
  arpu: number;
  netGrowthThisMonth: number;
  churnRate30: number;
  mrrChangeThisMonth: number;
  newThisMonth: number;
  canceledThisMonth: number;
}
export interface PlanMixItem {
  plan: string;
  label: string;
  count: number;
  mrr: number;
}
export interface PaymentsInfo {
  revenueThisMonth: number;
  methodMix: { method: string; count: number }[];
  successRate: { paid: number; failed: number; rate: number };
  upcoming30: {
    count: number;
    total: number;
    items: { email: string; amount: number; date: string }[];
  };
}
export interface AttentionInfo {
  failedPayments: { email: string; amount: number; reason: string; date: string; subscriptionId: string | null }[];
  canceledStillActive: { email: string; plan: string; endsAt: string | null }[];
  reconciliation: { email: string; supabase: string; mollie: string }[];
}
export interface Engagement {
  // Actieve gebruikers = makers van projecten (credit_transactions logt verbruik
  // niet betrouwbaar, dus `projects` is het echte activiteitssignaal).
  activeCreators7d: number;
  activeCreators30d: number;
  projectsCreated7d: number;
  projectsCreated30d: number;
  creditsSpent30d: number;
}
export interface ActivityItem {
  ts: string;
  type: "signup" | "cancel" | "payment_paid" | "payment_failed";
  label: string;
  email: string;
  amount?: number;
}
export interface SubscriberRow {
  email: string;
  name: string | null;
  plan: string;
  status: string;
  mrr: number;
  start: string | null;
  next: string | null;
  credits: number | null;
  origin: string | null; // "trial" | "cursus" | null
  subscriptionId: string | null;
}
/** Eén terugboeking, met alles erbij wat je nodig hebt om te kunnen ingrijpen. */
export interface ChargebackRow {
  chargebackId: string;
  paymentId: string;
  date: string;
  amount: number;
  reason: string;
  email: string;
  name: string | null;
  /** Rekening waarvan is teruggeboekt; de enige constante bij herhaald misbruik. */
  iban: string | null;
  accountName: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  /** Status in onze eigen database, zodat je ziet of er al is ingegrepen. */
  userId: string | null;
  billingBlocked: boolean;
  /** Hoe vaak deze rekening al heeft teruggeboekt. */
  aantalVanDezeRekening: number;
}

export interface DashboardData {
  generatedAt: string;
  kpi: KpiSet;
  totals: { totalSubs: number; active: number; canceled: number; other: number; comp: number };
  daily: DailyPoint[];
  planMix: PlanMixItem[];
  payments: PaymentsInfo;
  attention: AttentionInfo;
  engagement: Engagement;
  activity: ActivityItem[];
  subscribers: SubscriberRow[];
  chargebacks: ChargebackRow[];
}

// ---- Helpers ----
const num = (v?: { value: string } | null) => (v ? parseFloat(v.value) : 0);
const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n: number, from: Date) => new Date(from.getTime() - n * 86400_000);

function planOf(sub: MollieSub): string {
  const m = sub.metadata?.planId;
  if (m && PLAN_PRICE[m] !== undefined) return m;
  const d = (sub.description ?? "").toLowerCase();
  if (d.includes("agency")) return "agency";
  if (d.includes("pro")) return "pro";
  if (d.includes("starter")) return "starter";
  return "starter";
}
const isMonthly = (sub: MollieSub) => (sub.interval ?? "").includes("month");

interface SupaProfile {
  id: string;
  email: string | null;
  name: string | null;
  plan: string;
  subscription_status: string | null;
  mollie_customer_id: string | null;
  mollie_subscription_id: string | null;
  credits: number;
  billing_blocked: boolean | null;
}

/**
 * Bouwt de complete dashboard-payload. Doet één parallelle fetch-ronde en
 * berekent daarna alle secties in-memory.
 */
export async function buildDashboard(): Promise<DashboardData> {
  const now = new Date();
  const cutoff90 = daysAgo(90, now).toISOString();
  const cutoff30 = daysAgo(30, now).toISOString();
  const cutoff7 = daysAgo(7, now).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const service = createServiceClient();

  const [subs, payments, chargebacksRaw, profiles, pending, creditTx, projects] = await Promise.all([
    molliePaginate<MollieSub>("/subscriptions", "subscriptions"),
    molliePaginate<MolliePayment>("/payments", "payments", { stopAtOlderThan: cutoff90, max: 2000 }),
    // Losse lijst: een storno kan op een betaling van maanden geleden slaan en
    // valt dan buiten het venster hierboven.
    molliePaginate<MollieChargeback>("/chargebacks", "chargebacks", { max: 500 }).catch(() => [] as MollieChargeback[]),
    service
      .from("profiles")
      .select("id,email,name,plan,subscription_status,mollie_customer_id,mollie_subscription_id,credits,billing_blocked")
      .then((r) => (r.data ?? []) as SupaProfile[]),
    service
      .from("pending_checkouts")
      .select("email,is_trial,is_cursus,status")
      .then((r) => (r.data ?? []) as { email: string; is_trial: boolean | null; is_cursus: boolean | null; status: string }[]),
    service
      .from("credit_transactions")
      .select("user_id,amount,created_at")
      .gte("created_at", cutoff30)
      .then((r) => (r.data ?? []) as { user_id: string; amount: number; created_at: string }[]),
    service
      .from("projects")
      .select("user_id,created_at")
      .gte("created_at", cutoff30)
      .then((r) => (r.data ?? []) as { user_id: string; created_at: string }[]),
  ]);

  // --- e-mail/naam per Mollie-customerId, primair uit Supabase (geen extra calls) ---
  const emailByCust = new Map<string, string>();
  const nameByCust = new Map<string, string>();
  const creditsByCust = new Map<string, number>();
  const emailToProfile = new Map<string, SupaProfile>();
  for (const p of profiles) {
    if (p.mollie_customer_id) {
      if (p.email) emailByCust.set(p.mollie_customer_id, p.email);
      if (p.name) nameByCust.set(p.mollie_customer_id, p.name);
      creditsByCust.set(p.mollie_customer_id, p.credits);
    }
    if (p.email) emailToProfile.set(p.email.toLowerCase(), p);
  }
  // Ontbrekende e-mails bij Mollie ophalen (begrensd), zodat guest-abo's ook een e-mail tonen.
  const missing = [...new Set(subs.map((s) => s.customerId).filter((c) => c && !emailByCust.has(c)))].slice(0, 60);
  await Promise.all(
    missing.map(async (cid) => {
      try {
        const c = await mollieFetch<{ email?: string; name?: string }>(`/customers/${cid}`);
        if (c.email) emailByCust.set(cid, c.email);
        if (c.name) nameByCust.set(cid, c.name);
      } catch {
        /* laat leeg; toont "—" */
      }
    })
  );
  const emailOf = (cid?: string | null) => (cid && emailByCust.get(cid)) || "—";

  // --- Abonnementen: segmentatie, MRR, ARR ---
  const active = subs.filter((s) => s.status === "active");
  const canceled = subs.filter((s) => s.status === "canceled");
  const other = subs.filter((s) => s.status !== "active" && s.status !== "canceled");
  const mrr = active.reduce((sum, s) => sum + (isMonthly(s) ? num(s.amount) : 0), 0);
  const activePaying = active.length;
  const arpu = activePaying ? mrr / activePaying : 0;

  // interne/comp-accounts: plan betalend + status active in Supabase maar geen Mollie-sub
  const comp = profiles.filter(
    (p) => PAID_PLANS.includes(p.plan) && p.subscription_status === "active" && !p.mollie_subscription_id
  );

  // --- Tijdreeks: aanmeldingen (createdAt) / afmeldingen (canceledAt), 90 dagen ---
  const dailyMap = new Map<string, { aanmeldingen: number; afmeldingen: number }>();
  for (let i = 0; i < 90; i++) {
    dailyMap.set(dayKey(daysAgo(i, now)), { aanmeldingen: 0, afmeldingen: 0 });
  }
  for (const s of subs) {
    const k = dayKey(s.createdAt);
    if (dailyMap.has(k)) dailyMap.get(k)!.aanmeldingen++;
    if (s.canceledAt) {
      const kc = dayKey(s.canceledAt);
      if (dailyMap.has(kc)) dailyMap.get(kc)!.afmeldingen++;
    }
  }
  const daily: DailyPoint[] = [...dailyMap.entries()]
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- KPI's per maand / 30d ---
  const newThisMonth = subs.filter((s) => s.createdAt >= monthStart).length;
  const canceledThisMonth = subs.filter((s) => s.canceledAt && s.canceledAt >= monthStart).length;
  const mrrAddedThisMonth = subs
    .filter((s) => s.createdAt >= monthStart && isMonthly(s))
    .reduce((sum, s) => sum + num(s.amount), 0);
  const mrrLostThisMonth = subs
    .filter((s) => s.canceledAt && s.canceledAt >= monthStart && isMonthly(s))
    .reduce((sum, s) => sum + num(s.amount), 0);
  const canceledLast30 = subs.filter((s) => s.canceledAt && s.canceledAt >= cutoff30).length;
  const churnBase = activePaying + canceledLast30;
  const churnRate30 = churnBase ? canceledLast30 / churnBase : 0;

  const kpi: KpiSet = {
    mrr,
    arr: mrr * 12,
    activePaying,
    arpu,
    netGrowthThisMonth: newThisMonth - canceledThisMonth,
    churnRate30,
    mrrChangeThisMonth: mrrAddedThisMonth - mrrLostThisMonth,
    newThisMonth,
    canceledThisMonth,
  };

  // --- Plan-mix (actieve betalende abonnementen) ---
  const planMix: PlanMixItem[] = PAID_PLANS.map((plan) => {
    const rows = active.filter((s) => planOf(s) === plan);
    return {
      plan,
      label: PLAN_LABELS[plan],
      count: rows.length,
      mrr: rows.reduce((sum, s) => sum + (isMonthly(s) ? num(s.amount) : 0), 0),
    };
  }).filter((p) => p.count > 0);

  // --- Betalingen (alleen abonnement-gerelateerd: first/recurring) ---
  const subPayments = payments.filter(
    (p) => p.sequenceType === "first" || p.sequenceType === "recurring" || p.subscriptionId
  );
  const paidThisMonth = subPayments.filter(
    (p) => p.status === "paid" && (p.paidAt ?? p.createdAt) >= monthStart
  );
  const revenueThisMonth = paidThisMonth.reduce((sum, p) => sum + num(p.settlementAmount ?? p.amount), 0);

  const methodCounts = new Map<string, number>();
  for (const p of subPayments) {
    if (p.status !== "paid") continue;
    const m = p.method ?? "onbekend";
    methodCounts.set(m, (methodCounts.get(m) ?? 0) + 1);
  }
  const methodMix = [...methodCounts.entries()]
    .map(([method, count]) => ({ method, count }))
    .sort((a, b) => b.count - a.count);

  const paidCount = subPayments.filter((p) => p.status === "paid").length;
  const failedCount = subPayments.filter((p) => p.status === "failed" || p.status === "expired").length;
  const successRate = {
    paid: paidCount,
    failed: failedCount,
    rate: paidCount + failedCount ? paidCount / (paidCount + failedCount) : 1,
  };

  // Incasso-vooruitblik komende 30 dagen (actieve, maandelijkse abo's)
  const in30 = new Date(now.getTime() + 30 * 86400_000).toISOString();
  const upcomingSubs = active
    .filter((s) => s.nextPaymentDate && s.nextPaymentDate <= in30.slice(0, 10) && isMonthly(s))
    .sort((a, b) => (a.nextPaymentDate! < b.nextPaymentDate! ? -1 : 1));
  const payments_info: PaymentsInfo = {
    revenueThisMonth,
    methodMix,
    successRate,
    upcoming30: {
      count: upcomingSubs.length,
      total: upcomingSubs.reduce((sum, s) => sum + num(s.amount), 0),
      items: upcomingSubs.slice(0, 30).map((s) => ({
        email: emailOf(s.customerId),
        amount: num(s.amount),
        date: s.nextPaymentDate!,
      })),
    },
  };

  // --- Aandacht vereist ---
  const failedPayments = subPayments
    .filter((p) => p.status === "failed")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 20)
    .map((p) => ({
      email: emailOf(p.customerId),
      amount: num(p.amount),
      reason: p.details?.bankReason || p.details?.failureReason || p.details?.failureMessage || "Onbekend",
      date: p.createdAt,
      subscriptionId: p.subscriptionId ?? null,
    }));

  const canceledStillActive = canceled
    .filter((s) => s.nextPaymentDate && s.nextPaymentDate >= dayKey(now))
    .map((s) => ({ email: emailOf(s.customerId), plan: PLAN_LABELS[planOf(s)], endsAt: s.nextPaymentDate ?? null }));

  // Reconciliatie: Supabase-status wijkt af van werkelijke Mollie-status
  const mollieStatusBySub = new Map<string, string>();
  for (const s of subs) mollieStatusBySub.set(s.id, s.status);
  const reconciliation = profiles
    .filter((p) => p.mollie_subscription_id && mollieStatusBySub.has(p.mollie_subscription_id))
    .map((p) => ({
      email: p.email ?? "—",
      supabase: p.subscription_status ?? "—",
      mollie: mollieStatusBySub.get(p.mollie_subscription_id!)!,
    }))
    .filter((r) => {
      const supaActive = r.supabase === "active";
      const mollieActive = r.mollie === "active";
      return supaActive !== mollieActive;
    })
    .slice(0, 20);

  const attention: AttentionInfo = { failedPayments, canceledStillActive, reconciliation };

  // --- Terugboekingen (storno's) ---
  // De betaling erbij zoeken levert de klant, het abonnement én het
  // rekeningnummer op. Betalingen buiten het opgehaalde venster halen we los na
  // — begrensd, want dit draait bij elke verversing van het dashboard.
  const betalingById = new Map(payments.map((p) => [p.id, p]));
  const ontbrekend = [...new Set(chargebacksRaw.map((c) => c.paymentId))]
    .filter((id) => !betalingById.has(id))
    .slice(0, 40);
  await Promise.all(
    ontbrekend.map(async (id) => {
      try {
        betalingById.set(id, await mollieFetch<MolliePayment>(`/payments/${id}`));
      } catch {
        /* zonder betaling tonen we de storno alsnog, met minder gegevens */
      }
    })
  );

  const profielById = new Map(profiles.map((p) => [p.id, p]));
  const profielByEmail = new Map(
    profiles.filter((p) => p.email).map((p) => [p.email!.toLowerCase(), p])
  );
  const profielByCust = new Map(
    profiles.filter((p) => p.mollie_customer_id).map((p) => [p.mollie_customer_id!, p])
  );

  // Eerst tellen hoe vaak een rekening voorkomt: één storno is pech, vier keer
  // dezelfde rekening is een patroon, en dat wil je in één oogopslag zien.
  const perRekening = new Map<string, number>();
  for (const c of chargebacksRaw) {
    const iban = betalingById.get(c.paymentId)?.details?.consumerAccount;
    if (iban) perRekening.set(iban, (perRekening.get(iban) ?? 0) + 1);
  }

  const chargebacks: ChargebackRow[] = chargebacksRaw
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((c) => {
      const bet = betalingById.get(c.paymentId);
      const cust = bet?.customerId ?? null;
      const email = (cust && emailByCust.get(cust)) || "—";
      const profiel =
        (cust ? profielByCust.get(cust) : undefined) ??
        (email !== "—" ? profielByEmail.get(email.toLowerCase()) : undefined);
      const iban = bet?.details?.consumerAccount ?? null;
      return {
        chargebackId: c.id,
        paymentId: c.paymentId,
        date: c.createdAt,
        amount: num(c.amount),
        reason: c.reason?.description ?? "Reden onbekend",
        email,
        name: (cust && nameByCust.get(cust)) || null,
        iban,
        accountName: bet?.details?.consumerName ?? null,
        customerId: cust,
        subscriptionId: bet?.subscriptionId ?? null,
        userId: profiel?.id ?? null,
        billingBlocked: profiel?.billing_blocked === true,
        aantalVanDezeRekening: iban ? perRekening.get(iban) ?? 1 : 1,
      };
    });

  // --- Engagement (Supabase projects = activiteit; credit_transactions = verbruik) ---
  let creditsSpent30d = 0;
  for (const t of creditTx) if (t.amount < 0) creditsSpent30d += -t.amount;

  const creators30 = new Set(projects.map((p) => p.user_id));
  const creators7 = new Set(projects.filter((p) => p.created_at >= cutoff7).map((p) => p.user_id));
  const engagement: Engagement = {
    activeCreators7d: creators7.size,
    activeCreators30d: creators30.size,
    projectsCreated7d: projects.filter((p) => p.created_at >= cutoff7).length,
    projectsCreated30d: projects.length,
    creditsSpent30d,
  };

  // --- Activiteit-feed (recente events, samengevoegd) ---
  const events: ActivityItem[] = [];
  for (const s of subs) {
    if (s.createdAt >= cutoff30) {
      events.push({
        ts: s.createdAt,
        type: "signup",
        label: `Nieuwe aanmelding — ${PLAN_LABELS[planOf(s)]}`,
        email: emailOf(s.customerId),
      });
    }
    if (s.canceledAt && s.canceledAt >= cutoff30) {
      events.push({
        ts: s.canceledAt,
        type: "cancel",
        label: `Opzegging — ${PLAN_LABELS[planOf(s)]}`,
        email: emailOf(s.customerId),
      });
    }
  }
  for (const p of subPayments) {
    if ((p.paidAt ?? p.createdAt) < cutoff30) continue;
    if (p.status === "paid") {
      events.push({
        ts: p.paidAt ?? p.createdAt,
        type: "payment_paid",
        label: "Incasso geslaagd",
        email: emailOf(p.customerId),
        amount: num(p.amount),
      });
    } else if (p.status === "failed") {
      events.push({
        ts: p.createdAt,
        type: "payment_failed",
        label: "Incasso mislukt",
        email: emailOf(p.customerId),
        amount: num(p.amount),
      });
    }
  }
  const activity = events.sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 40);

  // --- Abonnee-tabel (actief + geannuleerd) ---
  const trialEmails = new Set(pending.filter((p) => p.is_trial).map((p) => p.email?.toLowerCase()));
  const cursusEmails = new Set(pending.filter((p) => p.is_cursus).map((p) => p.email?.toLowerCase()));
  const subscribers: SubscriberRow[] = [...active, ...canceled].map((s) => {
    const email = emailOf(s.customerId);
    const key = email.toLowerCase();
    const prof = emailToProfile.get(key);
    const origin = trialEmails.has(key) ? "trial" : cursusEmails.has(key) ? "cursus" : null;
    return {
      email,
      name: nameByCust.get(s.customerId) ?? prof?.name ?? null,
      plan: PLAN_LABELS[planOf(s)],
      status: s.status,
      mrr: isMonthly(s) && s.status === "active" ? num(s.amount) : 0,
      start: s.startDate ?? s.createdAt ?? null,
      next: s.status === "active" ? s.nextPaymentDate ?? null : null,
      credits: prof?.credits ?? creditsByCust.get(s.customerId) ?? null,
      origin,
      subscriptionId: s.id,
    };
  });

  return {
    generatedAt: now.toISOString(),
    chargebacks,
    kpi,
    totals: {
      totalSubs: subs.length,
      active: active.length,
      canceled: canceled.length,
      other: other.length,
      comp: comp.length,
    },
    daily,
    planMix,
    payments: payments_info,
    attention,
    engagement,
    activity,
    subscribers,
  };
}
