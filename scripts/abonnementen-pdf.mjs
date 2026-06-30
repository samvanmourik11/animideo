// Bouwt een HTML-overzicht van alle Mollie-abonnementen (uit Supabase) voor cashflow.
// Draaien: node --env-file=<env> scripts/abonnementen-pdf.mjs > /tmp/abonnementen.html
import { writeFileSync } from "node:fs";

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SH = { apikey: SKEY, Authorization: `Bearer ${SKEY}` };

const PRICE = { free: 0, starter: 49, pro: 99, agency: 249 };
const GEN = "22-06-2026"; // vandaag

const fd = (d) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const profiles = await (await fetch(
  `${SUPA}/rest/v1/profiles?select=email,plan,subscription_status,mollie_subscription_id,credits_reset_date,created_at,updated_at&plan=neq.free&order=created_at.asc`,
  { headers: SH }
)).json();

const pending = await (await fetch(
  `${SUPA}/rest/v1/pending_checkouts?select=email,created_at,mollie_subscription_id&status=in.(paid,claimed)`,
  { headers: SH }
)).json();

// eerste betaaldatum per subscription-id (guest-checkout betaalt vóór account-aanmaak)
const firstPaidBySub = {};
for (const p of pending) {
  if (!p.mollie_subscription_id) continue;
  const cur = firstPaidBySub[p.mollie_subscription_id];
  if (!cur || new Date(p.created_at) < new Date(cur)) firstPaidBySub[p.mollie_subscription_id] = p.created_at;
}

const rows = profiles.map((p) => {
  const start = p.mollie_subscription_id && firstPaidBySub[p.mollie_subscription_id]
    ? firstPaidBySub[p.mollie_subscription_id]
    : p.created_at;
  return {
    email: p.email,
    plan: p.plan,
    price: PRICE[p.plan] ?? 0,
    status: p.subscription_status,
    sub: p.mollie_subscription_id,
    start,
    next: p.credits_reset_date,
  };
});

// Categorieën
const betalend = rows.filter((r) => r.sub && r.status === "active");
const opgezegd = rows.filter((r) => r.status === "canceled");
const comp = rows.filter((r) => !r.sub && r.status === "active"); // intern / handmatig toegekend, geen incasso

betalend.sort((a, b) => new Date(a.start) - new Date(b.start));
const mrr = betalend.reduce((s, r) => s + r.price, 0);

const tr = (r, i) => `<tr>
  <td class="n">${i + 1}</td>
  <td>${r.email}</td>
  <td>${r.plan}</td>
  <td class="eur">€${r.price}</td>
  <td>${fd(r.start)}</td>
  <td>${fd(r.next)}</td>
  <td class="sub">${r.sub || "—"}</td>
</tr>`;

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 16mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a2e; font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub-h { color: #666; margin: 0 0 16px; font-size: 11px; }
  .cards { display: flex; gap: 10px; margin: 0 0 18px; }
  .card { flex: 1; border: 1px solid #e3e3ef; border-radius: 8px; padding: 10px 12px; }
  .card .k { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 19px; font-weight: 700; margin-top: 3px; }
  h2 { font-size: 13px; margin: 20px 0 6px; border-bottom: 2px solid #1a1a2e; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #f3f3fa; padding: 6px 7px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .03em; color: #555; border-bottom: 1px solid #ddd; }
  td { padding: 5px 7px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.n { color: #999; width: 22px; }
  td.eur { white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.sub { color: #888; font-family: ui-monospace, Menlo, monospace; font-size: 9.5px; }
  tr:nth-child(even) td { background: #fafafe; }
  .note { color: #777; font-size: 10px; margin: 6px 0 0; line-height: 1.45; }
  .foot { margin-top: 22px; color: #999; font-size: 9px; border-top: 1px solid #eee; padding-top: 6px; }
</style></head><body>
  <h1>Abonnementen-overzicht</h1>
  <p class="sub-h">JouwAnimatieVideo A.I. · gegenereerd ${GEN} · bron: Mollie-abonnementen via Supabase</p>

  <div class="cards">
    <div class="card"><div class="k">Actieve betalende abo's</div><div class="v">${betalend.length}</div></div>
    <div class="card"><div class="k">MRR (terugkerend p/m)</div><div class="v">€${mrr.toLocaleString("nl-NL")}</div></div>
    <div class="card"><div class="k">Jaaromzet (MRR × 12)</div><div class="v">€${(mrr * 12).toLocaleString("nl-NL")}</div></div>
    <div class="card"><div class="k">Opgezegd</div><div class="v">${opgezegd.length}</div></div>
  </div>

  <h2>Actieve betalende abonnementen — ${betalend.length} × €49/mnd = €${mrr}/mnd</h2>
  <table>
    <thead><tr><th>#</th><th>Klant (e-mail)</th><th>Plan</th><th>Bedrag/mnd</th><th>Afgesloten op</th><th>Volgende incasso</th><th>Mollie-abo</th></tr></thead>
    <tbody>${betalend.map(tr).join("")}</tbody>
  </table>
  <p class="note"><b>Afgesloten op</b> = datum eerste betaling. <b>Volgende incasso</b> = datum waarop de lopende maand afloopt en automatisch opnieuw geïncasseerd wordt (abonnement loopt maandelijks door tot opzegging).</p>

  ${comp.length ? `<h2>Actieve accounts zonder incasso (intern / handmatig toegekend) — ${comp.length}</h2>
  <table>
    <thead><tr><th>#</th><th>Klant (e-mail)</th><th>Plan</th><th>Bedrag/mnd</th><th>Aangemaakt</th><th>Credits-reset</th><th>Mollie-abo</th></tr></thead>
    <tbody>${comp.map(tr).join("")}</tbody>
  </table>
  <p class="note">Deze accounts hebben plan "starter" maar géén actief Mollie-abonnement (geen sub-id) — tellen dus <b>niet</b> mee in de cashflow.</p>` : ""}

  ${opgezegd.length ? `<h2>Opgezegd — ${opgezegd.length}</h2>
  <table>
    <thead><tr><th>#</th><th>Klant (e-mail)</th><th>Plan</th><th>Bedrag/mnd</th><th>Afgesloten op</th><th>Geëindigd rond</th><th>Mollie-abo</th></tr></thead>
    <tbody>${opgezegd.map(tr).join("")}</tbody>
  </table>` : ""}

  <p class="foot">Bedragen op basis van plan-prijs (starter €49, pro €99, agency €249 p/m). "Volgende incasso" is afgeleid van de interne verlengdatum (credits_reset_date, +30 dagen na laatste betaling) en kan ±1 dag afwijken van de exacte Mollie-incassodatum. Voor de exacte Mollie nextPaymentDate per abonnement is een live Mollie-API-key nodig.</p>
</body></html>`;

writeFileSync("/tmp/abonnementen.html", html);
console.log(`OK — ${betalend.length} betalend (€${mrr}/mnd MRR), ${comp.length} intern, ${opgezegd.length} opgezegd`);
