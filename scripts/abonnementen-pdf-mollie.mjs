// Bouwt een HTML/PDF-overzicht van ALLE Mollie-abonnementen, rechtstreeks uit Mollie.
// Draaien: MOLLIE_API_KEY=live_... node scripts/abonnementen-pdf-mollie.mjs
import { writeFileSync } from "node:fs";

const MKEY = process.env.MOLLIE_API_KEY;
if (!MKEY || /x{4,}/.test(MKEY)) { console.error("Geen geldige MOLLIE_API_KEY"); process.exit(1); }
const MH = { Authorization: `Bearer ${MKEY}` };
const GEN = "22-06-2026";

const fd = (d) =>
  d ? new Date(d).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

// 1. Alle subscriptions ophalen (met paginatie)
let subs = [];
let url = "https://api.mollie.com/v2/subscriptions?limit=250";
while (url) {
  const r = await fetch(url, { headers: MH });
  if (!r.ok) { console.error("Mollie subs fout", r.status, await r.text()); process.exit(1); }
  const j = await r.json();
  subs = subs.concat(j._embedded?.subscriptions || []);
  url = j._links?.next?.href || null;
}

// 2. Klant-emails ophalen (gecached per customerId)
const custCache = {};
async function email(cid) {
  if (!cid) return "—";
  if (custCache[cid] !== undefined) return custCache[cid];
  const r = await fetch(`https://api.mollie.com/v2/customers/${cid}`, { headers: MH });
  const e = r.ok ? (await r.json()).email || "—" : "—";
  custCache[cid] = e;
  return e;
}

const rows = [];
for (const s of subs) {
  rows.push({
    email: await email(s.customerId),
    amount: parseFloat(s.amount?.value || "0"),
    cur: s.amount?.currency || "EUR",
    interval: s.interval,
    status: s.status,            // active | canceled | suspended | completed | pending
    created: s.createdAt,        // aangemaakt
    start: s.startDate,          // ingangsdatum eerste incasso
    next: s.nextPaymentDate,     // volgende incasso
    desc: s.description || "",
    id: s.id,
  });
}

const active = rows.filter((r) => r.status === "active");
const other = rows.filter((r) => r.status !== "active");
active.sort((a, b) => new Date(a.start || a.created) - new Date(b.start || b.created));
other.sort((a, b) => new Date(b.created) - new Date(a.created));

const mrr = active.reduce((s, r) => s + (r.interval?.includes("month") ? r.amount : 0), 0);

// volgende 6 maanden incasso-vooruitblik (alleen actieve, maandelijks)
const months = [];
const base = new Date("2026-06-22T00:00:00+02:00");
for (let i = 0; i < 6; i++) {
  const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
  months.push({ label: d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" }), ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
}

const euro = (n) => "€" + n.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const tr = (r, i) => `<tr>
  <td class="n">${i + 1}</td>
  <td>${r.email}</td>
  <td class="eur">€${r.amount.toFixed(0)}<span class="mut">/${r.interval?.replace("1 ", "").replace("month", "mnd").replace("months", "mnd") || ""}</span></td>
  <td>${fd(r.start)}</td>
  <td>${fd(r.next)}</td>
  <td><span class="badge ${r.status}">${r.status === "active" ? "actief" : r.status}</span></td>
  <td class="sub">${r.id}</td>
</tr>`;

const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 15mm 11mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1a1a2e; font-size: 11px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub-h { color: #666; margin: 0 0 16px; font-size: 11px; }
  .cards { display: flex; gap: 10px; margin: 0 0 16px; }
  .card { flex: 1; border: 1px solid #e3e3ef; border-radius: 8px; padding: 10px 12px; }
  .card .k { color: #777; font-size: 9.5px; text-transform: uppercase; letter-spacing: .04em; }
  .card .v { font-size: 19px; font-weight: 700; margin-top: 3px; }
  h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 2px solid #1a1a2e; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; background: #f3f3fa; padding: 6px 7px; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; color: #555; border-bottom: 1px solid #ddd; }
  td { padding: 5px 7px; border-bottom: 1px solid #eee; vertical-align: middle; }
  td.n { color: #aaa; width: 20px; }
  td.eur { white-space: nowrap; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.eur .mut { color: #999; font-weight: 400; }
  td.sub { color: #999; font-family: ui-monospace, Menlo, monospace; font-size: 9px; }
  tr:nth-child(even) td { background: #fafafe; }
  .badge { padding: 1px 7px; border-radius: 10px; font-size: 9px; font-weight: 600; }
  .badge.active { background: #e3f7ec; color: #16794a; }
  .badge.canceled { background: #fde8e8; color: #b42318; }
  .badge.suspended, .badge.pending { background: #fff3e0; color: #9a6700; }
  .badge.completed { background: #eef0f5; color: #555; }
  .fc th { text-align: right; } .fc td { text-align: right; font-variant-numeric: tabular-nums; }
  .fc td:first-child, .fc th:first-child { text-align: left; }
  .note { color: #777; font-size: 9.5px; margin: 6px 0 0; line-height: 1.45; }
  .foot { margin-top: 20px; color: #999; font-size: 8.5px; border-top: 1px solid #eee; padding-top: 6px; }
</style></head><body>
  <h1>Abonnementen-overzicht</h1>
  <p class="sub-h">JouwAnimatieVideo A.I. · gegenereerd ${GEN} · bron: <b>Mollie API (live)</b></p>

  <div class="cards">
    <div class="card"><div class="k">Actieve abonnementen</div><div class="v">${active.length}</div></div>
    <div class="card"><div class="k">MRR (terugkerend p/m)</div><div class="v">${euro(mrr)}</div></div>
    <div class="card"><div class="k">Jaaromzet (MRR × 12)</div><div class="v">${euro(mrr * 12)}</div></div>
    <div class="card"><div class="k">Opgezegd / overig</div><div class="v">${other.length}</div></div>
  </div>

  <h2>Actieve abonnementen — ${active.length} · ${euro(mrr)}/maand</h2>
  <table>
    <thead><tr><th>#</th><th>Klant (e-mail)</th><th>Bedrag</th><th>Ingangsdatum</th><th>Volgende incasso</th><th>Status</th><th>Mollie-abo</th></tr></thead>
    <tbody>${active.map(tr).join("")}</tbody>
  </table>
  <p class="note"><b>Ingangsdatum</b> = startdatum eerste incasso (Mollie <code>startDate</code>). <b>Volgende incasso</b> = eerstvolgende automatische afschrijving (Mollie <code>nextPaymentDate</code>). Maandelijks doorlopend tot opzegging.</p>

  <h2>Incasso-vooruitblik (actieve abo's, maandelijks)</h2>
  <table class="fc">
    <thead><tr><th>Maand</th><th>Aantal abo's</th><th>Verwachte incasso</th></tr></thead>
    <tbody>${months.map((m) => `<tr><td>${m.label}</td><td>${active.filter((r) => r.interval?.includes("month")).length}</td><td>${euro(mrr)}</td></tr>`).join("")}</tbody>
  </table>
  <p class="note">Aanname: alle huidige actieve abonnementen lopen door (geen opzeggingen/nieuwe klanten meegerekend). Pas dit in je cashflow-model aan met je eigen churn- en groeicijfers.</p>

  ${other.length ? `<h2>Niet-actief (opgezegd / overig) — ${other.length}</h2>
  <table>
    <thead><tr><th>#</th><th>Klant (e-mail)</th><th>Bedrag</th><th>Ingangsdatum</th><th>Laatste incasso</th><th>Status</th><th>Mollie-abo</th></tr></thead>
    <tbody>${other.map(tr).join("")}</tbody>
  </table>` : ""}

  <p class="foot">Rechtstreeks opgehaald uit de Mollie API op ${GEN}. Bedragen zijn de werkelijke abonnementsbedragen per Mollie-subscription. MRR telt alleen maandelijkse, actieve abonnementen.</p>
</body></html>`;

writeFileSync("/tmp/abonnementen.html", html);
console.log(`OK — ${active.length} actief (${euro(mrr)}/mnd MRR), ${other.length} niet-actief, ${rows.length} totaal`);
