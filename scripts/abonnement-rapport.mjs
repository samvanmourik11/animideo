// Rapport: cursus-/trial-klanten die de €1 betaalden, met betaaltijdstip (Mollie
// payment.paidAt) en echte ingangsdatum van het abonnement (subscription.startDate).
//
// Draaien:
//   node --env-file=.env.local scripts/abonnement-rapport.mjs
// Vereist een ECHTE MOLLIE_API_KEY (live_...) + SUPABASE_SERVICE_ROLE_KEY in de env.

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MKEY = process.env.MOLLIE_API_KEY;

if (!MKEY || /x{4,}/.test(MKEY)) {
  console.error("MOLLIE_API_KEY ontbreekt of is een placeholder. Zet de echte live-key in de env.");
  process.exit(1);
}

const SH = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };
const MH = { Authorization: `Bearer ${MKEY}` };

const fmt = (d) =>
  d ? new Date(d).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const fmtd = (d) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric" }) : "-";

const rows = await (await fetch(
  `${SUPA}/rest/v1/pending_checkouts?select=email,plan,status,is_trial,mollie_customer_id,mollie_payment_id,mollie_subscription_id,created_at&is_cursus=eq.true&status=in.(paid,claimed)&order=created_at.asc`,
  { headers: SH }
)).json();

const out = [];
for (const x of rows) {
  let paidAt = null, payStatus = null, amount = null;
  if (x.mollie_payment_id) {
    const pr = await fetch(`https://api.mollie.com/v2/payments/${x.mollie_payment_id}`, { headers: MH });
    if (pr.ok) { const p = await pr.json(); paidAt = p.paidAt; payStatus = p.status; amount = p.amount?.value; }
  }
  let startDate = null, nextPay = null, subStatus = null, subAmount = null;
  if (x.mollie_customer_id && x.mollie_subscription_id) {
    const sr = await fetch(`https://api.mollie.com/v2/customers/${x.mollie_customer_id}/subscriptions/${x.mollie_subscription_id}`, { headers: MH });
    if (sr.ok) { const s = await sr.json(); startDate = s.startDate; nextPay = s.nextPaymentDate; subStatus = s.status; subAmount = s.amount?.value; }
  }
  out.push({ email: x.email, status: x.status, trial: x.is_trial, paidAt, payStatus, amount, startDate, nextPay, subStatus, subAmount });
}

out.sort((a, b) => (a.paidAt || "").localeCompare(b.paidAt || ""));

console.log(`Cursus-klanten die €1 betaalden: ${out.length}`);
console.log(`Actieve Mollie-subscriptions: ${out.filter((o) => o.subStatus === "active").length}\n`);
for (const o of out) {
  console.log(`${o.email}  [${o.status}]`);
  console.log(`   €${o.amount ?? "?"} betaald: ${fmt(o.paidAt)}  (${o.payStatus ?? "onbekend"})`);
  console.log(`   abonnement gaat in: ${fmtd(o.startDate)}  | volgende incasso: ${fmtd(o.nextPay)}  | €${o.subAmount ?? "?"}/m | sub: ${o.subStatus ?? "GEEN"}`);
}
